/**
 * Site Checker Module
 *
 * Uses Puppeteer to visit a live app as a real user would and checks
 * for compliance-visible elements:
 *
 * - Cookie/consent banners
 * - Privacy policy links
 * - Terms of service links
 * - Data collection forms & PII fields
 * - Security headers (HTTPS, HSTS, CSP)
 * - Third-party trackers
 * - User rights (account deletion, data export)
 */

import puppeteer from "puppeteer";
import type {
  SiteCheckResults,
  SecurityHeaderCheck,
  CookieBannerCheck,
  LinkCheck,
  DataCollectionCheck,
  FormCheck,
  FormFieldInfo,
  UserRightsCheck,
  TrackerCheck,
} from "@/types/tester";

const TIMEOUT_MS = 30_000;

// Common cookie banner selectors (covers most consent management platforms)
const COOKIE_BANNER_SELECTORS = [
  // Generic
  '[class*="cookie"]', '[id*="cookie"]',
  '[class*="consent"]', '[id*="consent"]',
  '[class*="gdpr"]', '[id*="gdpr"]',
  '[class*="privacy-banner"]', '[id*="privacy-banner"]',
  // Specific CMPs
  '#onetrust-banner-sdk',       // OneTrust
  '#CybotCookiebotDialog',      // Cookiebot
  '.cc-banner',                 // Cookie Consent by Insites
  '#gdpr-cookie-notice',
  '[data-testid="cookie-banner"]',
  '[aria-label*="cookie"]',
  '[aria-label*="consent"]',
  '.osano-cm-window',           // Osano
  '#klaro',                     // Klaro
  '.evidon-banner',             // Evidon / Crownpeak
];

// PII field patterns
const PII_PATTERNS: Record<string, RegExp> = {
  email: /email|e-mail/i,
  phone: /phone|tel|mobile|cell/i,
  name: /^name$|first.?name|last.?name|full.?name|surname/i,
  address: /address|street|city|zip|postal|country/i,
  dob: /birth|dob|birthday|age/i,
  ssn: /ssn|social.?security|national.?id|tax.?id/i,
  credit_card: /card.?number|credit.?card|cvv|expir/i,
  password: /password|passwd/i,
};

// Known tracker patterns in script URLs and network requests
const TRACKER_PATTERNS: {
  name: string;
  pattern: RegExp;
  type: "analytics" | "advertising" | "social";
}[] = [
  { name: "Google Analytics", pattern: /google-analytics\.com|googletagmanager\.com|gtag/i, type: "analytics" },
  { name: "Facebook Pixel", pattern: /facebook\.com\/tr|connect\.facebook|fbevents/i, type: "advertising" },
  { name: "Hotjar", pattern: /hotjar\.com/i, type: "analytics" },
  { name: "Mixpanel", pattern: /mixpanel\.com/i, type: "analytics" },
  { name: "Segment", pattern: /segment\.com|segment\.io|cdn\.segment/i, type: "analytics" },
  { name: "Amplitude", pattern: /amplitude\.com/i, type: "analytics" },
  { name: "Intercom", pattern: /intercom\.io|widget\.intercom/i, type: "analytics" },
  { name: "Crisp", pattern: /crisp\.chat/i, type: "analytics" },
  { name: "HubSpot", pattern: /hubspot\.com|hs-analytics|hs-scripts/i, type: "analytics" },
  { name: "LinkedIn Insight", pattern: /linkedin\.com\/insight|snap\.licdn/i, type: "advertising" },
  { name: "Twitter Pixel", pattern: /ads-twitter\.com|static\.ads-twitter/i, type: "advertising" },
  { name: "TikTok Pixel", pattern: /analytics\.tiktok\.com/i, type: "advertising" },
  { name: "Sentry", pattern: /sentry\.io|browser\.sentry/i, type: "analytics" },
  { name: "PostHog", pattern: /posthog\.com|app\.posthog/i, type: "analytics" },
  { name: "Plausible", pattern: /plausible\.io/i, type: "analytics" },
];

/**
 * Run a full user-POV compliance check on a live URL.
 */
export async function checkSite(url: string): Promise<SiteCheckResults> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const startTime = Date.now();
  const networkRequests: string[] = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Capture network requests to detect trackers
    page.on("request", (req) => {
      networkRequests.push(req.url());
    });

    // Navigate to the site
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: TIMEOUT_MS,
    });

    const loadTimeMs = Date.now() - startTime;
    const finalUrl = page.url();
    const httpsEnforced = finalUrl.startsWith("https://");

    // Collect security headers from the response
    const headers = response?.headers() ?? {};
    const securityHeaders = checkSecurityHeaders(headers);

    // Wait a moment for cookie banners to appear (they often load async)
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));

    // Run all checks in parallel where possible
    const [cookieBanner, privacyPolicy, termsOfService, dataCollection, userRights] =
      await Promise.all([
        checkCookieBanner(page),
        checkLink(page, "privacy"),
        checkLink(page, "terms"),
        checkDataCollection(page),
        checkUserRights(page),
      ]);

    const thirdPartyTrackers = detectTrackers(networkRequests, page);

    // Take a screenshot of the homepage
    const screenshotBuffer = await page.screenshot({
      encoding: "base64",
      fullPage: false,
    });

    return {
      url: finalUrl,
      reachable: true,
      loadTimeMs,
      httpsEnforced,
      securityHeaders,
      cookieBanner,
      privacyPolicy,
      termsOfService,
      dataCollection,
      userRights,
      thirdPartyTrackers,
      screenshots: [{ name: "homepage", base64: screenshotBuffer as string }],
    };
  } catch (err) {
    return {
      url,
      reachable: false,
      loadTimeMs: Date.now() - startTime,
      httpsEnforced: url.startsWith("https://"),
      securityHeaders: emptySecurityHeaders(),
      cookieBanner: emptyCookieBanner(),
      privacyPolicy: emptyLink(),
      termsOfService: emptyLink(),
      dataCollection: { formsFound: 0, forms: [] },
      userRights: emptyUserRights(),
      thirdPartyTrackers: emptyTrackerCheck(),
      screenshots: [],
    };
  } finally {
    await browser.close();
  }
}

/* ── Security Headers ──────────────────────────────────────────────── */

function checkSecurityHeaders(headers: Record<string, string>): SecurityHeaderCheck {
  const get = (name: string) => headers[name.toLowerCase()] ?? "";

  return {
    hasHSTS: !!get("strict-transport-security"),
    hasCSP: !!get("content-security-policy"),
    hasXFrameOptions: !!get("x-frame-options"),
    hasXContentTypeOptions: !!get("x-content-type-options"),
    hasReferrerPolicy: !!get("referrer-policy"),
    rawHeaders: {
      ...(get("strict-transport-security") ? { "strict-transport-security": get("strict-transport-security") } : {}),
      ...(get("content-security-policy") ? { "content-security-policy": get("content-security-policy").slice(0, 200) } : {}),
      ...(get("x-frame-options") ? { "x-frame-options": get("x-frame-options") } : {}),
      ...(get("x-content-type-options") ? { "x-content-type-options": get("x-content-type-options") } : {}),
      ...(get("referrer-policy") ? { "referrer-policy": get("referrer-policy") } : {}),
    },
  };
}

/* ── Cookie Banner ─────────────────────────────────────────────────── */

async function checkCookieBanner(page: puppeteer.Page): Promise<CookieBannerCheck> {
  // Try to find a cookie banner element
  for (const selector of COOKIE_BANNER_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (!element) continue;

      // Check if it's actually visible
      const isVisible = await element.evaluate((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.height > 0
        );
      });

      if (!isVisible) continue;

      // Extract text and check for reject/granular options
      const bannerInfo = await element.evaluate((el) => {
        const text = el.textContent?.trim() ?? "";
        const buttons = Array.from(el.querySelectorAll("button, a, [role='button']"));
        const buttonTexts = buttons.map((b) => b.textContent?.trim().toLowerCase() ?? "");

        const rejectKeywords = ["reject", "decline", "refuse", "deny", "no thanks", "only necessary", "ablehnen"];
        const hasRejectOption = buttonTexts.some((t) => rejectKeywords.some((kw) => t.includes(kw)));

        const granularKeywords = ["customize", "preferences", "settings", "manage", "choose", "einstellungen"];
        const hasGranularChoices = buttonTexts.some((t) => granularKeywords.some((kw) => t.includes(kw)));

        // Check for pre-checked boxes
        const checkboxes = Array.from(el.querySelectorAll('input[type="checkbox"]'));
        const preCheckedBoxes = checkboxes.some((cb) => (cb as HTMLInputElement).checked);

        return { text: text.slice(0, 500), hasRejectOption, hasGranularChoices, preCheckedBoxes };
      });

      return {
        found: true,
        hasRejectOption: bannerInfo.hasRejectOption,
        hasGranularChoices: bannerInfo.hasGranularChoices,
        preCheckedBoxes: bannerInfo.preCheckedBoxes,
        bannerText: bannerInfo.text,
      };
    } catch {
      continue;
    }
  }

  return emptyCookieBanner();
}

/* ── Link Checks (Privacy Policy, Terms) ───────────────────────────── */

async function checkLink(
  page: puppeteer.Page,
  type: "privacy" | "terms"
): Promise<LinkCheck> {
  const keywords =
    type === "privacy"
      ? ["privacy", "datenschutz", "privacidad", "confidentialité", "data protection", "privacy policy"]
      : ["terms", "conditions", "tos", "nutzungsbedingungen", "agb", "terms of service", "terms of use", "legal"];

  try {
    const linkInfo = await page.evaluate((kws) => {
      const links = Array.from(document.querySelectorAll("a"));
      for (const link of links) {
        const text = (link.textContent ?? "").toLowerCase().trim();
        const href = link.href;
        if (kws.some((kw) => text.includes(kw) || href.toLowerCase().includes(kw))) {
          return { found: true, url: href };
        }
      }
      // Also check footer specifically
      const footer = document.querySelector("footer");
      if (footer) {
        const footerLinks = Array.from(footer.querySelectorAll("a"));
        for (const link of footerLinks) {
          const text = (link.textContent ?? "").toLowerCase().trim();
          const href = link.href;
          if (kws.some((kw) => text.includes(kw) || href.toLowerCase().includes(kw))) {
            return { found: true, url: href };
          }
        }
      }
      return { found: false, url: "" };
    }, keywords);

    if (!linkInfo.found) {
      return emptyLink();
    }

    // Try to visit the linked page and check its content length
    let contentLength = 0;
    try {
      const linkedPage = await page.browser().newPage();
      await linkedPage.goto(linkInfo.url, { waitUntil: "domcontentloaded", timeout: 10_000 });
      const bodyText = await linkedPage.evaluate(() => document.body?.innerText ?? "");
      contentLength = bodyText.split(/\s+/).length;
      await linkedPage.close();
    } catch {
      // Link exists but page isn't accessible — still counts as found
    }

    return {
      found: true,
      url: linkInfo.url,
      accessible: contentLength > 0,
      contentLength,
    };
  } catch {
    return emptyLink();
  }
}

/* ── Data Collection (Forms & PII) ─────────────────────────────────── */

async function checkDataCollection(page: puppeteer.Page): Promise<DataCollectionCheck> {
  try {
    const formsData = await page.evaluate((piiPatterns) => {
      const forms = Array.from(document.querySelectorAll("form"));
      return forms.map((form) => {
        const inputs = Array.from(form.querySelectorAll("input, select, textarea")).filter(
          (el) => {
            const type = (el as HTMLInputElement).type?.toLowerCase();
            return type !== "hidden" && type !== "submit" && type !== "button";
          }
        );

        const fields = inputs.map((input) => {
          const el = input as HTMLInputElement;
          const name = el.name || el.id || "";
          const type = el.type || el.tagName.toLowerCase();
          const label = el.labels?.[0]?.textContent?.trim() ||
            el.placeholder ||
            el.getAttribute("aria-label") ||
            name;

          // Check if field collects PII
          const fieldStr = `${name} ${label} ${type}`.toLowerCase();
          const isPII = Object.values(piiPatterns).some((pattern) => new RegExp(pattern).test(fieldStr));

          return {
            name,
            type,
            label,
            required: el.required,
            isPII,
          };
        });

        // Check for privacy notice near the form
        const formText = form.textContent?.toLowerCase() ?? "";
        const hasPrivacyNotice = [
          "privacy", "data protection", "datenschutz", "we use your data",
          "personal data", "processing"
        ].some((kw) => formText.includes(kw));

        // Check for consent checkbox
        const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]'));
        const hasConsentCheckbox = checkboxes.some((cb) => {
          const label = (cb as HTMLInputElement).labels?.[0]?.textContent?.toLowerCase() ?? "";
          const name = ((cb as HTMLInputElement).name ?? "").toLowerCase();
          return ["consent", "agree", "accept", "privacy", "terms", "gdpr"].some(
            (kw) => label.includes(kw) || name.includes(kw)
          );
        });

        return {
          action: form.action || "",
          method: form.method || "get",
          fields,
          hasPrivacyNotice,
          hasConsentCheckbox,
        };
      });
    }, Object.fromEntries(Object.entries(PII_PATTERNS).map(([k, v]) => [k, v.source])));

    return {
      formsFound: formsData.length,
      forms: formsData as FormCheck[],
    };
  } catch {
    return { formsFound: 0, forms: [] };
  }
}

/* ── User Rights ───────────────────────────────────────────────────── */

async function checkUserRights(page: puppeteer.Page): Promise<UserRightsCheck> {
  try {
    const rights = await page.evaluate(() => {
      const allText = document.body?.innerText?.toLowerCase() ?? "";
      const allLinks = Array.from(document.querySelectorAll("a")).map((a) => ({
        text: (a.textContent ?? "").toLowerCase().trim(),
        href: a.href,
      }));

      const deletionKeywords = ["delete account", "delete my data", "account deletion", "remove my data", "konto löschen"];
      const exportKeywords = ["export data", "download my data", "data export", "download your data", "data portability"];
      const settingsKeywords = ["settings", "profile", "account", "preferences", "einstellungen"];

      const hasAccountDeletion = deletionKeywords.some(
        (kw) => allText.includes(kw) || allLinks.some((l) => l.text.includes(kw) || l.href.includes(kw.replace(/\s/g, "-")))
      );
      const hasDataExport = exportKeywords.some(
        (kw) => allText.includes(kw) || allLinks.some((l) => l.text.includes(kw))
      );
      const hasProfileSettings = settingsKeywords.some(
        (kw) => allLinks.some((l) => l.text.includes(kw))
      );

      const detectedLinks = allLinks
        .filter((l) =>
          [...deletionKeywords, ...exportKeywords].some(
            (kw) => l.text.includes(kw) || l.href.toLowerCase().includes(kw.replace(/\s/g, "-"))
          )
        )
        .map((l) => `${l.text}: ${l.href}`);

      return { hasAccountDeletion, hasDataExport, hasProfileSettings, detectedLinks };
    });

    return rights;
  } catch {
    return emptyUserRights();
  }
}

/* ── Tracker Detection ─────────────────────────────────────────────── */

function detectTrackers(
  networkRequests: string[],
  page: puppeteer.Page
): TrackerCheck {
  const found = new Set<string>();
  let hasGA = false;
  let hasFB = false;
  let hasOther = false;

  for (const url of networkRequests) {
    for (const tracker of TRACKER_PATTERNS) {
      if (tracker.pattern.test(url)) {
        found.add(tracker.name);
        if (tracker.name === "Google Analytics") hasGA = true;
        else if (tracker.name === "Facebook Pixel") hasFB = true;
        else hasOther = true;
      }
    }
  }

  return {
    trackersFound: Array.from(found),
    hasGoogleAnalytics: hasGA,
    hasFacebookPixel: hasFB,
    hasOtherTrackers: hasOther,
    // Under GDPR, consent is required for non-essential trackers
    consentRequired: found.size > 0,
  };
}

/* ── Empty defaults ────────────────────────────────────────────────── */

function emptySecurityHeaders(): SecurityHeaderCheck {
  return { hasHSTS: false, hasCSP: false, hasXFrameOptions: false, hasXContentTypeOptions: false, hasReferrerPolicy: false, rawHeaders: {} };
}

function emptyCookieBanner(): CookieBannerCheck {
  return { found: false, hasRejectOption: false, hasGranularChoices: false, preCheckedBoxes: false, bannerText: "" };
}

function emptyLink(): LinkCheck {
  return { found: false, url: "", accessible: false, contentLength: 0 };
}

function emptyUserRights(): UserRightsCheck {
  return { hasAccountDeletion: false, hasDataExport: false, hasProfileSettings: false, detectedLinks: [] };
}

function emptyTrackerCheck(): TrackerCheck {
  return { trackersFound: [], hasGoogleAnalytics: false, hasFacebookPixel: false, hasOtherTrackers: false, consentRequired: false };
}
