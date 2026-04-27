/**
 * Google Workspace Scanner for Compliance Signals
 *
 * Scans a connected Google Workspace for:
 * 1. Admin directory — user count, 2FA enforcement, org units
 * 2. Drive — shared drive policies, external sharing settings
 * 3. Admin audit logs — recent security events, login activity
 *
 * Returns structured signals that feed into the evidence pipeline
 * so the compliance scanner can auto-answer controls about
 * access management, data governance, and security monitoring.
 */

export interface GoogleWorkspaceCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface GoogleWorkspaceSignals {
  scannedAt: string;
  workspace: string; // email domain or workspace name

  // Directory / identity signals
  totalUsers: number;
  adminUsers: number;
  suspendedUsers: number;
  has2FAEnforced: boolean;
  orgUnitsCount: number;

  // Drive / data governance signals
  externalSharingEnabled: boolean;
  sharedDrivesCount: number;
  hasDataLossPreventionRules: boolean;

  // Audit / monitoring signals
  recentSecurityEvents: number;
  hasLoginMonitoring: boolean;
  hasSuspiciousActivityAlerts: boolean;
  recentAdminActions: string[];

  // Compliance-relevant findings (human-readable)
  findings: string[];
  summary: string;
}

const GOOGLE_API = "https://www.googleapis.com";
const ADMIN_API = "https://admin.googleapis.com";

async function gFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

async function gJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await gFetch(url, token);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

/**
 * Scan a Google Workspace for compliance-relevant signals.
 */
export async function scanGoogleWorkspace(
  creds: GoogleWorkspaceCredentials
): Promise<GoogleWorkspaceSignals> {
  const { accessToken: token } = creds;
  const findings: string[] = [];

  // ── 1. Directory: users, admins, 2FA ──────────────────────────
  let totalUsers = 0;
  let adminUsers = 0;
  let suspendedUsers = 0;
  let has2FAEnforced = false;
  let workspace = "unknown";

  type UserListResponse = {
    users?: Array<{
      primaryEmail: string;
      isAdmin: boolean;
      suspended: boolean;
      isEnrolledIn2Sv: boolean;
      isEnforcedIn2Sv: boolean;
    }>;
    nextPageToken?: string;
  };

  const users = await gJson<UserListResponse>(
    `${ADMIN_API}/admin/directory/v1/users?customer=my_customer&maxResults=100&projection=basic`,
    token
  );

  if (users?.users) {
    totalUsers = users.users.length;
    adminUsers = users.users.filter((u) => u.isAdmin).length;
    suspendedUsers = users.users.filter((u) => u.suspended).length;
    const enrolled2FA = users.users.filter((u) => u.isEnrolledIn2Sv).length;
    const enforced2FA = users.users.filter((u) => u.isEnforcedIn2Sv).length;
    has2FAEnforced = enforced2FA > totalUsers * 0.8; // 80%+ enforced = yes

    if (users.users[0]?.primaryEmail) {
      workspace = users.users[0].primaryEmail.split("@")[1] || "unknown";
    }

    findings.push(`Directory: ${totalUsers} users, ${adminUsers} admins, ${suspendedUsers} suspended`);
    findings.push(`2FA: ${enrolled2FA} enrolled, ${enforced2FA} enforced (${Math.round((enforced2FA / Math.max(totalUsers, 1)) * 100)}% enforcement)`);

    if (has2FAEnforced) {
      findings.push("Strong: 2FA enforcement above 80% — meets access control requirements");
    } else {
      findings.push("Gap: 2FA enforcement below 80% — consider enforcing for all users");
    }
  } else {
    findings.push("Directory: Could not access user directory (insufficient permissions or no admin access)");
  }

  // ── 2. Org Units ──────────────────────────────────────────────
  let orgUnitsCount = 0;

  type OrgUnitResponse = {
    organizationUnits?: Array<{ name: string; orgUnitPath: string }>;
  };

  const orgUnits = await gJson<OrgUnitResponse>(
    `${ADMIN_API}/admin/directory/v1/customer/my_customer/orgunits?type=all`,
    token
  );

  if (orgUnits?.organizationUnits) {
    orgUnitsCount = orgUnits.organizationUnits.length;
    findings.push(`Organization units: ${orgUnitsCount} configured — indicates role-based access structure`);
  }

  // ── 3. Drive: shared drives ───────────────────────────────────
  let sharedDrivesCount = 0;
  let externalSharingEnabled = false;

  type DriveListResponse = {
    drives?: Array<{ id: string; name: string }>;
  };

  const drives = await gJson<DriveListResponse>(
    `${GOOGLE_API}/drive/v3/drives?pageSize=50`,
    token
  );

  if (drives?.drives) {
    sharedDrivesCount = drives.drives.length;
    findings.push(`Shared drives: ${sharedDrivesCount} found — indicates structured data governance`);
  }

  // Check About resource for sharing settings
  type AboutResponse = {
    user?: { permissionId: string };
    canCreateDrives?: boolean;
  };

  const about = await gJson<AboutResponse>(
    `${GOOGLE_API}/drive/v3/about?fields=user,canCreateDrives`,
    token
  );
  if (about) {
    findings.push("Drive API: Accessible — file metadata can be audited");
  }

  // External sharing is hard to detect without admin SDK settings — assume enabled unless proven otherwise
  externalSharingEnabled = true; // conservative default

  // ── 4. Admin Audit Logs ───────────────────────────────────────
  let recentSecurityEvents = 0;
  let hasLoginMonitoring = false;
  let hasSuspiciousActivityAlerts = false;
  const recentAdminActions: string[] = [];

  // Check admin activities (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  type AuditItem = {
    events?: Array<{ type: string; name: string }>;
    actor?: { email: string };
  };
  type AuditResponse = {
    items?: AuditItem[];
  };

  // Admin activity audit
  const adminAudit = await gJson<AuditResponse>(
    `${ADMIN_API}/admin/reports/v1/activity/users/all/applications/admin?startTime=${sevenDaysAgo}&maxResults=50`,
    token
  );

  if (adminAudit?.items) {
    for (const item of adminAudit.items.slice(0, 20)) {
      const eventNames = item.events?.map((e) => e.name).join(", ") ?? "unknown";
      recentAdminActions.push(eventNames);
    }
    findings.push(`Admin audit: ${adminAudit.items.length} admin actions in last 7 days`);
  }

  // Login activity audit
  const loginAudit = await gJson<AuditResponse>(
    `${ADMIN_API}/admin/reports/v1/activity/users/all/applications/login?startTime=${sevenDaysAgo}&maxResults=50`,
    token
  );

  if (loginAudit?.items) {
    hasLoginMonitoring = true;
    const suspiciousEvents = loginAudit.items.filter((item) =>
      item.events?.some((e) =>
        e.name.toLowerCase().includes("suspicious") ||
        e.name.toLowerCase().includes("blocked") ||
        e.name.toLowerCase().includes("failed")
      )
    );
    recentSecurityEvents = suspiciousEvents.length;
    hasSuspiciousActivityAlerts = suspiciousEvents.length > 0;

    findings.push(`Login monitoring: Active — ${loginAudit.items.length} login events, ${recentSecurityEvents} security events`);
  } else {
    findings.push("Login monitoring: Could not access login audit logs");
  }

  // ── Build summary ─────────────────────────────────────────────
  const hasDataLossPreventionRules = false; // Would need DLP API access

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (has2FAEnforced) strengths.push("2FA enforcement");
  else gaps.push("2FA not enforced for majority of users");

  if (orgUnitsCount > 1) strengths.push("organizational unit structure");
  if (hasLoginMonitoring) strengths.push("login activity monitoring");
  else gaps.push("no login audit access");

  if (sharedDrivesCount > 0) strengths.push("structured shared drives");
  if (recentAdminActions.length > 0) strengths.push("active admin oversight");

  if (totalUsers === 0) gaps.push("could not enumerate users");

  const summary = `Google Workspace (${workspace}): ${strengths.length} compliance strengths (${strengths.join(", ") || "none detected"}). ${gaps.length} gaps (${gaps.join(", ") || "none"}).`;

  return {
    scannedAt: new Date().toISOString(),
    workspace,
    totalUsers,
    adminUsers,
    suspendedUsers,
    has2FAEnforced,
    orgUnitsCount,
    externalSharingEnabled,
    sharedDrivesCount,
    hasDataLossPreventionRules,
    recentSecurityEvents,
    hasLoginMonitoring,
    hasSuspiciousActivityAlerts,
    recentAdminActions,
    findings,
    summary,
  };
}
