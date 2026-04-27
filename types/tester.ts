/**
 * Types for the Tester Agent — a headless browser-based
 * user-POV compliance checker that interacts with a live app.
 */

export interface TesterProgressEvent {
  type: "narration" | "finding" | "complete" | "error";
  message?: string;
  finding?: ComplianceFinding;
  report?: TesterReport;
}

export interface ComplianceFinding {
  category: ComplianceCategory;
  check: string;
  status: "PASS" | "FAIL" | "WARN" | "NOT_APPLICABLE";
  detail: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  /** Which regulation articles this maps to */
  articleRefs: string[];
}

export type ComplianceCategory =
  | "consent"
  | "privacy"
  | "data_collection"
  | "security"
  | "transparency"
  | "user_rights"
  | "third_party";

export interface SiteCheckResults {
  url: string;
  reachable: boolean;
  loadTimeMs: number;
  httpsEnforced: boolean;
  securityHeaders: SecurityHeaderCheck;
  cookieBanner: CookieBannerCheck;
  privacyPolicy: LinkCheck;
  termsOfService: LinkCheck;
  dataCollection: DataCollectionCheck;
  userRights: UserRightsCheck;
  thirdPartyTrackers: TrackerCheck;
  screenshots: { name: string; base64: string }[];
}

export interface SecurityHeaderCheck {
  hasHSTS: boolean;
  hasCSP: boolean;
  hasXFrameOptions: boolean;
  hasXContentTypeOptions: boolean;
  hasReferrerPolicy: boolean;
  rawHeaders: Record<string, string>;
}

export interface CookieBannerCheck {
  found: boolean;
  hasRejectOption: boolean;
  hasGranularChoices: boolean;
  preCheckedBoxes: boolean;
  bannerText: string;
}

export interface LinkCheck {
  found: boolean;
  url: string;
  accessible: boolean;
  /** Rough word count of the linked page */
  contentLength: number;
}

export interface DataCollectionCheck {
  formsFound: number;
  forms: FormCheck[];
}

export interface FormCheck {
  action: string;
  method: string;
  fields: FormFieldInfo[];
  hasPrivacyNotice: boolean;
  hasConsentCheckbox: boolean;
}

export interface FormFieldInfo {
  name: string;
  type: string;
  label: string;
  required: boolean;
  isPII: boolean;
}

export interface UserRightsCheck {
  hasAccountDeletion: boolean;
  hasDataExport: boolean;
  hasProfileSettings: boolean;
  detectedLinks: string[];
}

export interface TrackerCheck {
  trackersFound: string[];
  hasGoogleAnalytics: boolean;
  hasFacebookPixel: boolean;
  hasOtherTrackers: boolean;
  consentRequired: boolean;
}

export interface TesterReport {
  url: string;
  testedAt: string;
  overallScore: number;
  findings: ComplianceFinding[];
  summary: string;
  /** Organized by category for the UI */
  categories: Record<ComplianceCategory, {
    score: number;
    findings: ComplianceFinding[];
  }>;
}

export interface UrlDiscoveryResult {
  url: string | null;
  source: "readme" | "package_json" | "vercel" | "netlify" | "cname" | "github_pages" | "repo_homepage" | "manual";
  confidence: number;
}
