import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { FrameworkReport, ScanControlResult } from "@/types/scan";

const COLORS = {
  primary: "#1e40af",
  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
  neutral: "#6b7280",
  lightGray: "#f3f4f6",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.text,
    padding: 40,
    backgroundColor: COLORS.white,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    borderBottomStyle: "solid",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  scoreRow: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 12,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: COLORS.lightGray,
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
  },
  scoreNumber: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    marginTop: 20,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  summaryText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: COLORS.text,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    padding: 6,
    marginBottom: 1,
  },
  tableHeaderText: {
    color: COLORS.white,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    padding: 6,
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderBottomStyle: "solid",
  },
  tableRowAlt: {
    backgroundColor: COLORS.lightGray,
  },
  colCode: { width: "18%", paddingRight: 4 },
  colTitle: { width: "35%", paddingRight: 4 },
  colStatus: { width: "14%", paddingRight: 4 },
  colConfidence: { width: "13%", paddingRight: 4 },
  colGaps: { width: "20%" },
  cellText: { fontSize: 9, lineHeight: 1.4 },
  statusPass: { color: COLORS.success, fontFamily: "Helvetica-Bold" },
  statusFail: { color: COLORS.danger, fontFamily: "Helvetica-Bold" },
  statusPartial: { color: COLORS.warning, fontFamily: "Helvetica-Bold" },
  statusNoEvidence: { color: COLORS.neutral, fontFamily: "Helvetica-Bold" },
  roadmapItem: {
    marginBottom: 8,
    padding: 10,
    backgroundColor: COLORS.lightGray,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    borderLeftStyle: "solid",
  },
  roadmapTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  roadmapDesc: {
    fontSize: 9,
    color: COLORS.textMuted,
    lineHeight: 1.4,
  },
  auditBox: {
    marginTop: 24,
    padding: 10,
    backgroundColor: COLORS.lightGray,
    borderRadius: 4,
  },
  auditText: {
    fontSize: 8,
    color: COLORS.textMuted,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.textMuted,
  },
});

function statusStyle(status: string) {
  switch (status) {
    case "PASS":
      return styles.statusPass;
    case "FAIL":
      return styles.statusFail;
    case "PARTIAL":
      return styles.statusPartial;
    default:
      return styles.statusNoEvidence;
  }
}

function riskColor(riskLevel: string): string {
  switch (riskLevel?.toUpperCase()) {
    case "LOW":
      return COLORS.success;
    case "MEDIUM":
      return COLORS.warning;
    case "HIGH":
      return COLORS.danger;
    case "CRITICAL":
      return COLORS.danger;
    default:
      return COLORS.neutral;
  }
}

interface PdfReportProps {
  scanId: string;
  orgName: string;
  frameworkType: string;
  report: FrameworkReport;
  generatedAt: string;
  completedAt: string;
}

export function AuditReportDocument({
  scanId,
  orgName,
  frameworkType,
  report,
  generatedAt,
  completedAt,
}: PdfReportProps) {
  const frameworkLabel = frameworkType.replace(/_/g, " ");
  const scoreColor =
    report.score >= 80
      ? COLORS.success
      : report.score >= 50
        ? COLORS.warning
        : COLORS.danger;

  return (
    <Document
      title={`${orgName} — ${frameworkLabel} Compliance Report`}
      author="Kodex Compliance Platform"
      subject="Compliance Audit Report"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Compliance Audit Report</Text>
          <Text style={styles.headerSubtitle}>Organization: {orgName}</Text>
          <Text style={styles.headerSubtitle}>Framework: {frameworkLabel}</Text>
          <Text style={styles.headerSubtitle}>Generated: {generatedAt}</Text>
        </View>

        {/* Score cards */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreNumber, { color: scoreColor }]}>
              {report.score}%
            </Text>
            <Text style={styles.scoreLabel}>Compliance Score</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text
              style={[
                styles.scoreNumber,
                { color: riskColor(report.riskLevel) },
              ]}
            >
              {report.riskLevel ?? "—"}
            </Text>
            <Text style={styles.scoreLabel}>Risk Level</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={[styles.scoreNumber, { color: COLORS.primary }]}>
              {report.controlsPassed}/{report.controlsTotal}
            </Text>
            <Text style={styles.scoreLabel}>Controls Passed</Text>
          </View>
        </View>

        {/* Executive Summary */}
        {report.executiveSummary && (
          <>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.summaryText}>{report.executiveSummary.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}</Text>
          </>
        )}

        {/* Control Results */}
        <Text style={styles.sectionTitle}>
          Control Results ({report.controlsTotal} controls evaluated)
        </Text>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <View style={styles.colCode}>
            <Text style={styles.tableHeaderText}>Code</Text>
          </View>
          <View style={styles.colTitle}>
            <Text style={styles.tableHeaderText}>Control</Text>
          </View>
          <View style={styles.colStatus}>
            <Text style={styles.tableHeaderText}>Status</Text>
          </View>
          <View style={styles.colConfidence}>
            <Text style={styles.tableHeaderText}>Confidence</Text>
          </View>
          <View style={styles.colGaps}>
            <Text style={styles.tableHeaderText}>Gaps / Notes</Text>
          </View>
        </View>

        {/* Table rows */}
        {(report.results ?? []).map((control: ScanControlResult, i: number) => (
          <View
            key={control.controlCode}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <View style={styles.colCode}>
              <Text
                style={[
                  styles.cellText,
                  { fontFamily: "Courier", fontSize: 8 },
                ]}
              >
                {control.controlCode}
              </Text>
            </View>
            <View style={styles.colTitle}>
              <Text style={styles.cellText}>{control.controlTitle}</Text>
            </View>
            <View style={styles.colStatus}>
              <Text
                style={[styles.cellText, statusStyle(control.status)]}
              >
                {control.status}
              </Text>
            </View>
            <View style={styles.colConfidence}>
              <Text style={styles.cellText}>
                {Math.round((control.confidence ?? 0) * 100)}%
              </Text>
            </View>
            <View style={styles.colGaps}>
              <Text style={styles.cellText}>
                {control.note
                  ? control.note.slice(0, 120)
                  : (control.gaps ?? [])
                      .slice(0, 2)
                      .join("; ")
                      .slice(0, 120) || "—"}
              </Text>
            </View>
          </View>
        ))}

        {/* Remediation Roadmap */}
        {(report.roadmap ?? []).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Remediation Roadmap</Text>
            {report.roadmap.slice(0, 8).map((task: any, i: number) => (
              <View key={i} style={styles.roadmapItem} wrap={false}>
                <Text style={styles.roadmapTitle}>
                  {task.priority} — {task.title}
                </Text>
                <Text style={styles.roadmapDesc}>{task.description}</Text>
                {task.effortEstimate && (
                  <Text style={[styles.roadmapDesc, { marginTop: 2 }]}>
                    Effort: {task.effortEstimate}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* Audit Trail */}
        <View style={styles.auditBox}>
          <Text style={styles.auditText}>Scan ID: {scanId}</Text>
          <Text style={styles.auditText}>Framework: {frameworkType}</Text>
          <Text style={styles.auditText}>
            Controls evaluated: {report.controlsTotal}
          </Text>
          <Text style={styles.auditText}>Scan completed: {completedAt}</Text>
          <Text style={styles.auditText}>Report generated: {generatedAt}</Text>
          <Text style={[styles.auditText, { marginTop: 4 }]}>
            This report was generated automatically by Kodex Compliance
            Platform. Results are based on evidence and AI-powered analysis at
            the time of scan.
          </Text>
        </View>

        {/* Page footer */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${orgName} — ${frameworkLabel} Compliance Report · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
