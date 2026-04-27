/**
 * Slack Workspace Scanner for Compliance Signals
 *
 * Scans a connected Slack workspace for:
 * 1. Channel structure — compliance/security/incident channels
 * 2. Team info — workspace settings and size
 * 3. Recent messages — mentions of compliance topics in relevant channels
 * 4. File sharing — compliance documents shared in Slack
 *
 * Returns signals about organizational awareness of compliance topics,
 * incident response readiness (dedicated channels), and data governance.
 */

export interface SlackCredentials {
  accessToken: string;
  teamId?: string;
  teamName?: string;
}

export interface SlackScanSignals {
  scannedAt: string;
  teamName: string;

  // Workspace structure
  totalChannels: number;
  totalMembers: number;

  // Compliance-relevant channels
  hasSecurityChannel: boolean;
  hasIncidentChannel: boolean;
  hasComplianceChannel: boolean;
  hasPrivacyChannel: boolean;
  hasDevOpsChannel: boolean;
  complianceChannels: Array<{ name: string; category: string; memberCount: number }>;

  // Data governance signals
  hasFileSharing: boolean;
  recentComplianceFiles: Array<{ name: string; fileType: string }>;
  hasExternalSharing: boolean;

  // Activity signals
  hasActiveIncidentProcess: boolean; // Recent activity in incident channels
  complianceTopicMentions: number;

  findings: string[];
  summary: string;
}

const SLACK_API = "https://slack.com/api";

async function slackFetch<T>(method: string, token: string, params?: Record<string, string>): Promise<T | null> {
  try {
    const url = new URL(`${SLACK_API}/${method}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return data as T;
  } catch {
    return null;
  }
}

// Patterns that indicate compliance-relevant channels
const CHANNEL_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /security|infosec|appsec|cybersec/i, category: "security" },
  { pattern: /incident|outage|oncall|on-call|pagerduty|alerts/i, category: "incident" },
  { pattern: /compliance|gdpr|audit|regulatory|legal/i, category: "compliance" },
  { pattern: /privacy|dpo|data-protection/i, category: "privacy" },
  { pattern: /devops|infrastructure|platform|sre|deploy/i, category: "devops" },
  { pattern: /risk|governance|grc/i, category: "compliance" },
];

type SlackChannel = {
  id: string;
  name: string;
  num_members: number;
  is_archived: boolean;
  topic?: { value: string };
  purpose?: { value: string };
};

type ConversationsListResponse = {
  ok: boolean;
  channels: SlackChannel[];
  response_metadata?: { next_cursor: string };
};

type TeamInfoResponse = {
  ok: boolean;
  team: {
    id: string;
    name: string;
    domain: string;
    email_domain: string;
  };
};

type UsersListResponse = {
  ok: boolean;
  members: Array<{
    id: string;
    deleted: boolean;
    is_bot: boolean;
    is_restricted: boolean;
  }>;
};

type ConversationHistoryResponse = {
  ok: boolean;
  messages: Array<{
    text: string;
    ts: string;
    files?: Array<{ name: string; filetype: string }>;
  }>;
};

type FilesListResponse = {
  ok: boolean;
  files: Array<{
    name: string;
    filetype: string;
    title: string;
    created: number;
    is_external: boolean;
  }>;
};

/**
 * Scan a Slack workspace for compliance-relevant signals.
 */
export async function scanSlackWorkspace(
  creds: SlackCredentials
): Promise<SlackScanSignals> {
  const { accessToken: token, teamName: initialTeamName = "Slack workspace" } = creds;
  const findings: string[] = [];

  // ── 1. Team info ──────────────────────────────────────────────
  let teamName = initialTeamName;
  const teamInfo = await slackFetch<TeamInfoResponse>("team.info", token);
  if (teamInfo?.team) {
    teamName = teamInfo.team.name;
    findings.push(`Workspace: ${teamInfo.team.name} (${teamInfo.team.domain}.slack.com)`);
  }

  // ── 2. Get member count ───────────────────────────────────────
  let totalMembers = 0;
  const users = await slackFetch<UsersListResponse>("users.list", token, { limit: "200" });
  if (users?.members) {
    totalMembers = users.members.filter((u) => !u.deleted && !u.is_bot).length;
    findings.push(`Team size: ${totalMembers} active members`);
  }

  // ── 3. Channel analysis ───────────────────────────────────────
  let totalChannels = 0;
  const complianceChannels: SlackScanSignals["complianceChannels"] = [];
  const allChannels: SlackChannel[] = [];

  let cursor: string | undefined;
  do {
    const params: Record<string, string> = {
      types: "public_channel",
      exclude_archived: "true",
      limit: "200",
    };
    if (cursor) params.cursor = cursor;

    const channelsRes = await slackFetch<ConversationsListResponse>("conversations.list", token, params);
    if (!channelsRes?.channels) break;

    allChannels.push(...channelsRes.channels);
    cursor = channelsRes.response_metadata?.next_cursor || undefined;
    if (cursor === "") cursor = undefined;
  } while (cursor);

  totalChannels = allChannels.length;

  // Categorize channels
  for (const channel of allChannels) {
    for (const { pattern, category } of CHANNEL_PATTERNS) {
      const nameMatch = pattern.test(channel.name);
      const topicMatch = pattern.test(channel.topic?.value ?? "");
      const purposeMatch = pattern.test(channel.purpose?.value ?? "");

      if (nameMatch || topicMatch || purposeMatch) {
        complianceChannels.push({
          name: channel.name,
          category,
          memberCount: channel.num_members,
        });
        findings.push(`Channel #${channel.name} (${category}) — ${channel.num_members} members`);
        break; // Don't double-count a channel
      }
    }
  }

  const hasSecurityChannel = complianceChannels.some((c) => c.category === "security");
  const hasIncidentChannel = complianceChannels.some((c) => c.category === "incident");
  const hasComplianceChannel = complianceChannels.some((c) => c.category === "compliance");
  const hasPrivacyChannel = complianceChannels.some((c) => c.category === "privacy");
  const hasDevOpsChannel = complianceChannels.some((c) => c.category === "devops");

  if (complianceChannels.length > 0) {
    findings.push(`Found ${complianceChannels.length} compliance-relevant channels — indicates organizational awareness`);
  } else {
    findings.push("No compliance-specific channels found — consider creating #security, #incidents, #compliance channels");
  }

  // ── 4. Check incident channel activity ────────────────────────
  let hasActiveIncidentProcess = false;
  let complianceTopicMentions = 0;

  const incidentChannels = complianceChannels.filter((c) =>
    c.category === "incident" || c.category === "security"
  );

  for (const ch of incidentChannels.slice(0, 3)) {
    const channelObj = allChannels.find((c) => c.name === ch.name);
    if (!channelObj) continue;

    const history = await slackFetch<ConversationHistoryResponse>(
      "conversations.history",
      token,
      { channel: channelObj.id, limit: "20" }
    );

    if (history?.messages && history.messages.length > 5) {
      hasActiveIncidentProcess = true;
      complianceTopicMentions += history.messages.length;
      findings.push(`Channel #${ch.name} has recent activity — incident process appears active`);
    }
  }

  // ── 5. Check for compliance files ─────────────────────────────
  let hasFileSharing = false;
  let hasExternalSharing = false;
  const recentComplianceFiles: Array<{ name: string; fileType: string }> = [];

  const complianceFileKeywords = /policy|security|compliance|gdpr|privacy|incident|dpia|audit|risk/i;

  const files = await slackFetch<FilesListResponse>("files.list", token, {
    count: "50",
    types: "pdfs,docs,spreadsheets",
  });

  if (files?.files) {
    hasFileSharing = files.files.length > 0;
    for (const file of files.files) {
      if (complianceFileKeywords.test(file.name) || complianceFileKeywords.test(file.title)) {
        recentComplianceFiles.push({ name: file.name, fileType: file.filetype });
        findings.push(`Compliance file: "${file.name}" (${file.filetype})`);
      }
      if (file.is_external) hasExternalSharing = true;
    }

    if (recentComplianceFiles.length > 0) {
      findings.push(`Found ${recentComplianceFiles.length} compliance-related files shared in Slack`);
    }
  }

  // ── Build summary ─────────────────────────────────────────────
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (hasSecurityChannel) strengths.push("dedicated security channel");
  else gaps.push("no security channel");

  if (hasIncidentChannel) strengths.push("incident response channel");
  else gaps.push("no incident response channel");

  if (hasComplianceChannel) strengths.push("compliance channel");
  if (hasPrivacyChannel) strengths.push("privacy channel");

  if (hasActiveIncidentProcess) strengths.push("active incident process");
  if (recentComplianceFiles.length > 0) strengths.push(`${recentComplianceFiles.length} compliance files shared`);

  if (complianceChannels.length === 0) gaps.push("no compliance-relevant channels");

  const summary = `Slack workspace "${teamName}": ${totalChannels} channels, ${totalMembers} members. ${strengths.length} compliance strengths (${strengths.join(", ") || "none"}). ${gaps.length} gaps (${gaps.join(", ") || "none"}).`;

  return {
    scannedAt: new Date().toISOString(),
    teamName,
    totalChannels,
    totalMembers,
    hasSecurityChannel,
    hasIncidentChannel,
    hasComplianceChannel,
    hasPrivacyChannel,
    hasDevOpsChannel,
    complianceChannels,
    hasFileSharing,
    recentComplianceFiles,
    hasExternalSharing,
    hasActiveIncidentProcess,
    complianceTopicMentions,
    findings,
    summary,
  };
}
