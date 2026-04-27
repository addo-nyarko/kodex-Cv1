/**
 * URL Discovery Module
 *
 * Finds the deployed URL of a project from GitHub repo metadata.
 * Checks (in priority order):
 * 1. GitHub repo homepage field
 * 2. Vercel/Netlify deployment configs
 * 3. CNAME file (GitHub Pages)
 * 4. package.json homepage field
 * 5. README links matching common deployment patterns
 */

import type { UrlDiscoveryResult } from "@/types/tester";

const DEPLOYMENT_PATTERNS = [
  // Vercel
  /https?:\/\/[\w-]+\.vercel\.app/i,
  // Netlify
  /https?:\/\/[\w-]+\.netlify\.app/i,
  // Railway
  /https?:\/\/[\w-]+\.up\.railway\.app/i,
  // Render
  /https?:\/\/[\w-]+\.onrender\.com/i,
  // Fly.io
  /https?:\/\/[\w-]+\.fly\.dev/i,
  // Heroku
  /https?:\/\/[\w-]+\.herokuapp\.com/i,
  // Custom domains (broad but filtered later)
  /https?:\/\/(?:www\.)?[\w-]+\.(?:com|io|dev|app|co|org|eu|de)(?:\/[\w-]*)?/i,
];

const GITHUB_API = "https://api.github.com";

async function ghFetch(path: string, token: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Kodex-Tester-Agent",
    },
  });
}

async function ghJson<T>(path: string, token: string): Promise<T | null> {
  const res = await ghFetch(path, token);
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

async function ghText(path: string, token: string): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3.raw",
      "User-Agent": "Kodex-Tester-Agent",
    },
  });
  if (!res.ok) return null;
  return res.text();
}

type RepoMeta = {
  homepage: string | null;
  html_url: string;
  has_pages: boolean;
  default_branch: string;
};

/**
 * Discover the deployed URL from a GitHub repo.
 */
export async function discoverUrl(
  owner: string,
  repo: string,
  token: string
): Promise<UrlDiscoveryResult> {
  const prefix = `/repos/${owner}/${repo}`;

  // 1. Check GitHub repo homepage field (highest confidence — user set it explicitly)
  const meta = await ghJson<RepoMeta>(prefix, token);
  if (meta?.homepage && isValidUrl(meta.homepage)) {
    return { url: meta.homepage, source: "repo_homepage", confidence: 0.95 };
  }

  // 2. Check for Vercel config (vercel.json)
  const vercelConfig = await ghText(`${prefix}/contents/vercel.json`, token);
  if (vercelConfig) {
    try {
      const vc = JSON.parse(vercelConfig);
      // vercel.json sometimes has an alias or domain
      if (vc.alias && Array.isArray(vc.alias) && vc.alias[0]) {
        const alias = vc.alias[0];
        const url = alias.startsWith("http") ? alias : `https://${alias}`;
        return { url, source: "vercel", confidence: 0.85 };
      }
    } catch { /* ignore */ }
    // If vercel.json exists, the app is likely on vercel — try the convention
    const conventionUrl = `https://${repo}.vercel.app`;
    return { url: conventionUrl, source: "vercel", confidence: 0.6 };
  }

  // 3. Check for Netlify config (netlify.toml)
  const netlifyConfig = await ghText(`${prefix}/contents/netlify.toml`, token);
  if (netlifyConfig) {
    const conventionUrl = `https://${repo}.netlify.app`;
    return { url: conventionUrl, source: "netlify", confidence: 0.6 };
  }

  // 4. Check CNAME file (GitHub Pages)
  const cname = await ghText(`${prefix}/contents/CNAME`, token);
  if (cname && cname.trim()) {
    const domain = cname.trim();
    return { url: `https://${domain}`, source: "cname", confidence: 0.9 };
  }

  // Also check if GitHub Pages is enabled
  if (meta?.has_pages) {
    const pagesUrl = `https://${owner}.github.io/${repo}`;
    return { url: pagesUrl, source: "github_pages", confidence: 0.8 };
  }

  // 5. Check package.json homepage
  const packageJson = await ghText(`${prefix}/contents/package.json`, token);
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      if (pkg.homepage && isValidUrl(pkg.homepage)) {
        return { url: pkg.homepage, source: "package_json", confidence: 0.85 };
      }
    } catch { /* ignore */ }
  }

  // 6. Parse README for deployment URLs
  const readme = await ghText(`${prefix}/readme`, token);
  if (readme) {
    const url = extractDeploymentUrl(readme, owner, repo);
    if (url) {
      return { url, source: "readme", confidence: 0.5 };
    }
  }

  return { url: null, source: "readme", confidence: 0 };
}

/**
 * Check if a URL is live and returns a successful response.
 */
export async function verifyUrl(url: string): Promise<{
  reachable: boolean;
  finalUrl: string;
  statusCode: number;
  loadTimeMs: number;
}> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Kodex-Tester-Agent/1.0" },
    });

    return {
      reachable: res.ok,
      finalUrl: res.url,
      statusCode: res.status,
      loadTimeMs: Date.now() - start,
    };
  } catch {
    return {
      reachable: false,
      finalUrl: url,
      statusCode: 0,
      loadTimeMs: Date.now() - start,
    };
  }
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractDeploymentUrl(readme: string, owner: string, repo: string): string | null {
  // Look for markdown links with deployment-like URLs
  const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  const links: { text: string; url: string }[] = [];
  let match;

  while ((match = linkRegex.exec(readme)) !== null) {
    links.push({ text: match[1].toLowerCase(), url: match[2] });
  }

  // Prioritize links that say "demo", "live", "app", "website", "production"
  const priorityKeywords = ["demo", "live", "app", "website", "production", "visit", "try it", "deployed"];
  for (const kw of priorityKeywords) {
    const found = links.find((l) => l.text.includes(kw));
    if (found && !isGitHubUrl(found.url, owner, repo)) {
      return found.url;
    }
  }

  // Fall back to URL patterns in raw text
  for (const pattern of DEPLOYMENT_PATTERNS) {
    const m = readme.match(pattern);
    if (m && !isGitHubUrl(m[0], owner, repo)) {
      return m[0];
    }
  }

  return null;
}

function isGitHubUrl(url: string, owner: string, repo: string): boolean {
  return url.includes("github.com") || url.includes(`${owner}.github.io`) && url.includes(repo);
}
