/**
 * PDF Audit Report Generator
 *
 * Generates a professional compliance audit PDF from scan results.
 * Uses raw PDF content streams — no external PDF dependencies required.
 *
 * The PDF includes:
 * - Header with organization name, scan date, framework
 * - Executive summary
 * - Overall score and risk level
 * - Per-control results with gaps and remediations
 * - Cross-framework coverage (shadow pass)
 * - Remediation roadmap
 * - Timestamp and audit trail metadata
 */

interface PdfScanData {
  scanId: string;
  orgName: string;
  frameworkType: string;
  score: number;
  riskLevel: string;
  startedAt: string;
  completedAt: string;
  controlResults: {
    controlCode: string;
    controlTitle: string;
    status: string;
    confidence: number;
    gaps: string[];
    remediations: string[];
    note: string;
  }[];
  executiveSummary: string;
  roadmap: {
    controlCode: string;
    title: string;
    description: string;
    priority: string;
  }[];
  shadowPass: Record<string, { met: number; total: number; pct: number }> | null;
}

/**
 * Generate a compliance audit PDF report as a Buffer.
 * This generates a simple but professional PDF using raw text layout.
 * For production, consider using a library like PDFKit or Puppeteer.
 */
export function generateAuditPdfHtml(data: PdfScanData): string {
  const statusColors: Record<string, string> = {
    PASS: "#22c55e",
    PARTIAL: "#eab308",
    FAIL: "#ef4444",
    NO_EVIDENCE: "#6b7280",
  };

  const statusLabels: Record<string, string> = {
    PASS: "PASS",
    PARTIAL: "PARTIAL",
    FAIL: "FAIL",
    NO_EVIDENCE: "NO EVIDENCE",
  };

  const passed = data.controlResults.filter((r) => r.status === "PASS").length;
  const partial = data.controlResults.filter((r) => r.status === "PARTIAL").length;
  const failed = data.controlResults.filter((r) => r.status === "FAIL").length;
  const noEvidence = data.controlResults.filter((r) => r.status === "NO_EVIDENCE").length;

  const riskColor = data.riskLevel === "LOW" ? "#22c55e" :
    data.riskLevel === "MEDIUM" ? "#eab308" :
    data.riskLevel === "HIGH" ? "#f97316" : "#ef4444";

  const controlRows = data.controlResults.map((cr) => {
    const color = statusColors[cr.status] || "#6b7280";
    const label = statusLabels[cr.status] || cr.status;
    const gapsList = cr.gaps.length > 0
      ? `<div style="margin-top:4px;"><strong style="color:#ef4444;font-size:10px;">Gaps:</strong><ul style="margin:2px 0 0 16px;padding:0;font-size:10px;color:#374151;">${cr.gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul></div>`
      : "";
    const remList = cr.remediations.length > 0
      ? `<div style="margin-top:4px;"><strong style="color:#3b82f6;font-size:10px;">Remediation:</strong><ul style="margin:2px 0 0 16px;padding:0;font-size:10px;color:#374151;">${cr.remediations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>`
      : "";
    const noteHtml = cr.note
      ? `<div style="margin-top:4px;font-size:10px;color:#6b7280;">${escapeHtml(cr.note)}</div>`
      : "";

    return `
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong style="font-size:12px;">${escapeHtml(cr.controlCode)}</strong>
            <span style="color:#6b7280;font-size:11px;margin-left:8px;">${escapeHtml(cr.controlTitle)}</span>
          </div>
          <span style="background:${color}15;color:${color};padding:2px 10px;border-radius:12px;font-size:10px;font-weight:600;">${label} · ${Math.round(cr.confidence * 100)}%</span>
        </div>
        ${noteHtml}
        ${gapsList}
        ${remList}
      </div>
    `;
  }).join("");

  const roadmapRows = data.roadmap.map((task) => {
    const prioColor = task.priority === "CRITICAL" ? "#ef4444" :
      task.priority === "HIGH" ? "#f97316" :
      task.priority === "MEDIUM" ? "#eab308" : "#22c55e";
    return `
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:6px;page-break-inside:avoid;display:flex;gap:10px;align-items:flex-start;">
        <span style="background:${prioColor}15;color:${prioColor};padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;white-space:nowrap;">${escapeHtml(task.priority)}</span>
        <div>
          <div style="font-size:11px;font-weight:600;">${escapeHtml(task.title)}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">${escapeHtml(task.description)}</div>
        </div>
      </div>
    `;
  }).join("");

  const shadowPassHtml = data.shadowPass
    ? Object.entries(data.shadowPass)
        .filter(([, v]) => v.total > 0)
        .map(([fw, v]) => `
          <div style="text-align:center;padding:10px;background:#f0f9ff;border-radius:6px;">
            <div style="font-size:18px;font-weight:700;color:#3b82f6;">${v.pct}%</div>
            <div style="font-size:10px;color:#6b7280;">${fw.replace(/_/g, " ")}</div>
            <div style="font-size:9px;color:#9ca3af;">${v.met}/${v.total} controls</div>
          </div>
        `).join("")
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 40px 50px; size: A4; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 12px; line-height: 1.5; }
    .header { border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #3b82f6; }
    .subtitle { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .section-title { font-size: 14px; font-weight: 700; color: #111827; margin: 24px 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    .score-card { display: flex; gap: 16px; margin-bottom: 24px; }
    .score-box { flex: 1; text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .score-value { font-size: 28px; font-weight: 700; }
    .score-label { font-size: 10px; color: #6b7280; margin-top: 4px; }
    .summary-text { font-size: 11px; color: #374151; line-height: 1.6; padding: 12px; background: #f9fafb; border-radius: 6px; }
    .cross-fw { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; }
    .watermark { position: fixed; bottom: 20px; right: 50px; font-size: 8px; color: #d1d5db; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">KODEX</div>
    <div class="subtitle">Compliance Audit Report</div>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:10px;color:#6b7280;">
      <div>
        <strong>Organization:</strong> ${escapeHtml(data.orgName)}<br>
        <strong>Framework:</strong> ${escapeHtml(data.frameworkType.replace(/_/g, " "))}
      </div>
      <div style="text-align:right;">
        <strong>Scan ID:</strong> ${escapeHtml(data.scanId)}<br>
        <strong>Date:</strong> ${escapeHtml(data.completedAt)}<br>
        <strong>Generated:</strong> ${new Date().toISOString().split("T")[0]}
      </div>
    </div>
  </div>

  <!-- Score Overview -->
  <div class="score-card">
    <div class="score-box">
      <div class="score-value" style="color:${data.score >= 75 ? "#22c55e" : data.score >= 50 ? "#eab308" : "#ef4444"};">${data.score}%</div>
      <div class="score-label">Compliance Score</div>
    </div>
    <div class="score-box">
      <div class="score-value" style="color:${riskColor};">${escapeHtml(data.riskLevel)}</div>
      <div class="score-label">Risk Level</div>
    </div>
    <div class="score-box">
      <div class="score-value">${passed}/${data.controlResults.length}</div>
      <div class="score-label">Controls Passed</div>
    </div>
    <div class="score-box">
      <div style="display:flex;gap:6px;justify-content:center;">
        <span style="color:#22c55e;font-weight:600;">${passed}P</span>
        <span style="color:#eab308;font-weight:600;">${partial}A</span>
        <span style="color:#ef4444;font-weight:600;">${failed}F</span>
        <span style="color:#6b7280;font-weight:600;">${noEvidence}N</span>
      </div>
      <div class="score-label">Pass / Partial / Fail / No Evidence</div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="section-title">Executive Summary</div>
  <div class="summary-text">${escapeHtml(data.executiveSummary)}</div>

  <!-- Control Results -->
  <div class="section-title">Control Results (${data.controlResults.length} controls evaluated)</div>
  ${controlRows}

  <!-- Cross-Framework Coverage -->
  ${shadowPassHtml ? `
    <div class="section-title">Cross-Framework Coverage</div>
    <div class="cross-fw">${shadowPassHtml}</div>
  ` : ""}

  <!-- Remediation Roadmap -->
  ${data.roadmap.length > 0 ? `
    <div class="section-title">Remediation Roadmap (${data.roadmap.length} actions)</div>
    ${roadmapRows}
  ` : ""}

  <!-- Audit Trail Footer -->
  <div class="footer">
    <strong>Audit Trail</strong><br>
    Scan initiated: ${escapeHtml(data.startedAt)}<br>
    Scan completed: ${escapeHtml(data.completedAt)}<br>
    Report generated: ${new Date().toISOString()}<br>
    Scan ID: ${escapeHtml(data.scanId)}<br>
    Framework: ${escapeHtml(data.frameworkType)}<br>
    Controls evaluated: ${data.controlResults.length}<br>
    This report was generated automatically by Kodex Compliance Platform.
    Results are based on uploaded evidence and AI-powered analysis at the time of scan.
  </div>

  <div class="watermark">Kodex Compliance Platform — Confidential</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
