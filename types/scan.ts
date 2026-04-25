export interface EvidencePool {
  onboarding: {
    companyName: string;
    industry: string;
    country: string;
    size: string;
    usesAI: boolean;
    aiDescription?: string;
    dataCategories: string[];
  };
  questionnaire: Record<string, unknown>;
  documents: DocumentChunk[];
  codeSignals: Record<string, unknown>;
  clarifications: Record<string, string>;
  priorResults: Record<string, ControlEvalResult>;
}

export interface DocumentChunk {
  evidenceId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  pageNumber?: number;
}

export interface ControlRule {
  id: string;
  code: string;
  title: string;
  frameworks: string[];
  evidenceKeys: string[];
  articleRefs: Record<string, string>;
  check: (evidence: EvidencePool) => ControlEvalResult;
  automatable?: boolean;
}

export interface ControlEvalResult {
  status: "PASS" | "FAIL" | "PARTIAL" | "NO_EVIDENCE";
  confidence: number;
  evidenceUsed: string[];
  gaps: string[];
  remediations: string[];
  lawyerQuestions: string[];
  note: string;
}

export interface ScanProgressEvent {
  type:
    | "narration"
    | "control_evaluated"
    | "clarification_needed"
    | "cross_framework_hit"
    | "complete"
    | "error";
  message?: string;
  controlCode?: string;
  question?: string;
  report?: FrameworkReport;
  shadowPass?: Record<string, ShadowPassResult>;
}

export interface ShadowPassResult {
  met: number;
  total: number;
  pct: number;
}

export interface FrameworkReport {
  framework: string;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
  controlsTotal: number;
  controlsPassed: number;
  controlsFromOtherFrameworks: number;
  results: ScanControlResult[];
  roadmap: RemediationTask[];
  executiveSummary: string;
}

export interface ScanControlResult {
  controlId: string;
  controlCode: string;
  controlTitle: string;
  status: ControlEvalResult["status"];
  confidence: number;
  evidenceUsed: string[];
  gaps: string[];
  remediations: string[];
  lawyerQuestions: string[];
  note: string;
  inheritedFromFramework?: string;
}

export interface RemediationTask {
  controlCode: string;
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  effortEstimate: string;
  deadline?: string;
  lawyerQuestions: string[];
  articleRef: string;
}
