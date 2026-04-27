/**
 * Notion Workspace Scanner for Compliance Evidence
 *
 * Searches a connected Notion workspace for compliance-relevant pages:
 * - Privacy policies, security policies, incident response plans
 * - DPIAs, RoPAs, data retention schedules
 * - Employee handbooks, training materials
 * - Architecture docs, runbooks
 *
 * Returns both structured signals AND extracted text content
 * that gets injected as document chunks into the evidence pool.
 * This means Notion pages become searchable evidence for the scanner
 * without the user having to manually upload PDFs.
 */

export interface NotionCredentials {
  accessToken: string;
  workspaceId?: string;
  workspaceName?: string;
}

export interface NotionCompliancePage {
  id: string;
  title: string;
  url: string;
  category: string; // e.g. "privacy_policy", "security_policy", "incident_response"
  textContent: string;
  lastEditedAt: string;
}

export interface NotionScanSignals {
  scannedAt: string;
  workspaceName: string;

  // What compliance docs were found
  pagesScanned: number;
  compliancePagesFound: number;
  categories: Record<string, number>; // category → count

  // Specific doc presence
  hasPrivacyPolicy: boolean;
  hasSecurityPolicy: boolean;
  hasIncidentResponse: boolean;
  hasDPIA: boolean;
  hasRoPA: boolean;
  hasDataRetentionPolicy: boolean;
  hasAcceptableUsePolicy: boolean;
  hasEmployeeHandbook: boolean;
  hasVendorManagement: boolean;
  hasChangeManagement: boolean;
  hasAIPolicy: boolean;

  // The actual page content for evidence injection
  compliancePages: NotionCompliancePage[];

  findings: string[];
  summary: string;
}

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function notionFetch(path: string, token: string, options?: RequestInit): Promise<Response> {
  return fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

async function notionJson<T>(path: string, token: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await notionFetch(path, token, options);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// Compliance keyword categories for searching
const COMPLIANCE_SEARCHES: Array<{ query: string; category: string }> = [
  { query: "privacy policy", category: "privacy_policy" },
  { query: "data protection", category: "privacy_policy" },
  { query: "GDPR", category: "privacy_policy" },
  { query: "security policy", category: "security_policy" },
  { query: "information security", category: "security_policy" },
  { query: "incident response", category: "incident_response" },
  { query: "breach notification", category: "incident_response" },
  { query: "data protection impact assessment", category: "dpia" },
  { query: "DPIA", category: "dpia" },
  { query: "record of processing", category: "ropa" },
  { query: "RoPA", category: "ropa" },
  { query: "data retention", category: "data_retention" },
  { query: "acceptable use", category: "acceptable_use" },
  { query: "employee handbook", category: "employee_handbook" },
  { query: "vendor management", category: "vendor_management" },
  { query: "third party", category: "vendor_management" },
  { query: "change management", category: "change_management" },
  { query: "AI policy", category: "ai_policy" },
  { query: "artificial intelligence", category: "ai_policy" },
  { query: "risk assessment", category: "risk_assessment" },
  { query: "access control", category: "access_control" },
  { query: "business continuity", category: "business_continuity" },
  { query: "disaster recovery", category: "business_continuity" },
];

type NotionSearchResult = {
  results: Array<{
    id: string;
    object: string;
    url: string;
    last_edited_time: string;
    properties?: Record<string, {
      type: string;
      title?: Array<{ plain_text: string }>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }>;
    // For pages with title in parent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parent?: any;
  }>;
  has_more: boolean;
  next_cursor: string | null;
};

type NotionBlock = {
  id: string;
  type: string;
  has_children: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type NotionBlocksResponse = {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
};

/**
 * Extract plain text from a Notion rich text array.
 */
function extractRichText(richText: Array<{ plain_text: string }> | undefined): string {
  if (!richText) return "";
  return richText.map((t) => t.plain_text).join("");
}

/**
 * Extract text content from a single block.
 */
function extractBlockText(block: NotionBlock): string {
  const type = block.type;
  const data = block[type];
  if (!data) return "";

  // Most text blocks have a rich_text array
  if (data.rich_text) {
    return extractRichText(data.rich_text);
  }

  // Special cases
  if (type === "child_page") return `[Page: ${data.title || "Untitled"}]`;
  if (type === "child_database") return `[Database: ${data.title || "Untitled"}]`;
  if (type === "code") return extractRichText(data.rich_text);

  return "";
}

/**
 * Get the title of a Notion page from its properties.
 */
function getPageTitle(page: NotionSearchResult["results"][0]): string {
  if (!page.properties) return "Untitled";

  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && prop.title) {
      return extractRichText(prop.title) || "Untitled";
    }
  }
  return "Untitled";
}

/**
 * Fetch the text content of a Notion page (first ~100 blocks).
 */
async function fetchPageContent(pageId: string, token: string): Promise<string> {
  const blocks: string[] = [];
  let cursor: string | null = null;
  let fetched = 0;
  const MAX_BLOCKS = 100;

  do {
    const url = `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const response = await notionJson<NotionBlocksResponse>(url, token);
    if (!response?.results) break;

    for (const block of response.results) {
      const text = extractBlockText(block);
      if (text) blocks.push(text);
      fetched++;
    }

    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor && fetched < MAX_BLOCKS);

  return blocks.join("\n");
}

/**
 * Scan a Notion workspace for compliance-relevant documentation.
 */
export async function scanNotionWorkspace(
  creds: NotionCredentials
): Promise<NotionScanSignals> {
  const { accessToken: token, workspaceName = "Notion workspace" } = creds;
  const findings: string[] = [];
  const seenPageIds = new Set<string>();
  const compliancePages: NotionCompliancePage[] = [];
  const categories: Record<string, number> = {};

  // Search for each compliance keyword
  for (const { query, category } of COMPLIANCE_SEARCHES) {
    const result = await notionJson<NotionSearchResult>(
      "/search",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          query,
          filter: { property: "object", value: "page" },
          page_size: 5,
        }),
      }
    );

    if (!result?.results) continue;

    for (const page of result.results) {
      if (seenPageIds.has(page.id)) continue;
      seenPageIds.add(page.id);

      const title = getPageTitle(page);
      if (title === "Untitled") continue;

      // Fetch the page content (capped at ~100 blocks)
      const textContent = await fetchPageContent(page.id, token);
      if (textContent.length < 50) continue; // Skip near-empty pages

      compliancePages.push({
        id: page.id,
        title,
        url: page.url,
        category,
        textContent: textContent.slice(0, 8000), // Cap content for evidence pool
        lastEditedAt: page.last_edited_time,
      });

      categories[category] = (categories[category] ?? 0) + 1;
      findings.push(`Found "${title}" (${category.replace(/_/g, " ")}) — ${textContent.length} chars of content`);
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  // Determine what's present
  const hasCategory = (cat: string) => (categories[cat] ?? 0) > 0;

  const hasPrivacyPolicy = hasCategory("privacy_policy");
  const hasSecurityPolicy = hasCategory("security_policy");
  const hasIncidentResponse = hasCategory("incident_response");
  const hasDPIA = hasCategory("dpia");
  const hasRoPA = hasCategory("ropa");
  const hasDataRetentionPolicy = hasCategory("data_retention");
  const hasAcceptableUsePolicy = hasCategory("acceptable_use");
  const hasEmployeeHandbook = hasCategory("employee_handbook");
  const hasVendorManagement = hasCategory("vendor_management");
  const hasChangeManagement = hasCategory("change_management");
  const hasAIPolicy = hasCategory("ai_policy");

  // Build summary
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (hasPrivacyPolicy) strengths.push("privacy policy");
  else gaps.push("no privacy policy found");

  if (hasSecurityPolicy) strengths.push("security policy");
  else gaps.push("no security policy found");

  if (hasIncidentResponse) strengths.push("incident response plan");
  else gaps.push("no incident response plan");

  if (hasDPIA) strengths.push("DPIA documentation");
  if (hasRoPA) strengths.push("records of processing");
  if (hasDataRetentionPolicy) strengths.push("data retention policy");
  if (hasAIPolicy) strengths.push("AI governance policy");

  if (compliancePages.length === 0) {
    findings.push("No compliance-related documentation found in Notion workspace");
  }

  const summary = `Notion workspace "${workspaceName}": Scanned ${seenPageIds.size} pages, found ${compliancePages.length} compliance-relevant documents. Strengths: ${strengths.join(", ") || "none"}. Gaps: ${gaps.join(", ") || "none"}.`;

  return {
    scannedAt: new Date().toISOString(),
    workspaceName,
    pagesScanned: seenPageIds.size,
    compliancePagesFound: compliancePages.length,
    categories,
    hasPrivacyPolicy,
    hasSecurityPolicy,
    hasIncidentResponse,
    hasDPIA,
    hasRoPA,
    hasDataRetentionPolicy,
    hasAcceptableUsePolicy,
    hasEmployeeHandbook,
    hasVendorManagement,
    hasChangeManagement,
    hasAIPolicy,
    compliancePages,
    findings,
    summary,
  };
}
