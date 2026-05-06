"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Upload,
  Link2,
  GitBranch,
  FileText,
  MessageSquare,
  BookOpen,
  Shield,
  ScanSearch,
  LayoutDashboard,
  Star,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance",
  "Retail",
  "Education",
  "Legal",
  "Manufacturing",
  "Consulting",
  "Government",
  "Other",
];

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

const AI_PURPOSES = [
  { id: "automated_decision_making", label: "Automated decision-making" },
  { id: "content_generation", label: "Content generation" },
  { id: "data_analysis", label: "Data analysis" },
  { id: "customer_service", label: "Customer service" },
  { id: "recommendation_engine", label: "Recommendation engine" },
  { id: "other", label: "Other" },
];

const DATA_CATEGORIES = [
  { id: "personal", label: "Personal" },
  { id: "health", label: "Health" },
  { id: "financial", label: "Financial" },
  { id: "biometric", label: "Biometric" },
  { id: "children", label: "Children" },
  { id: "location", label: "Location" },
  { id: "behavioral", label: "Behavioral" },
  { id: "employment", label: "Employment" },
];

const FRAMEWORKS = [
  {
    id: "GDPR",
    name: "GDPR",
    description: "EU General Data Protection Regulation for personal data processing",
  },
  {
    id: "EU_AI_ACT",
    name: "EU AI Act",
    description: "European regulation for artificial intelligence systems",
  },
  {
    id: "ISO_27001",
    name: "ISO 27001",
    description: "International standard for information security management",
  },
  {
    id: "SOC2",
    name: "SOC 2",
    description: "Trust service criteria for service organisations",
  },
  {
    id: "NIS2",
    name: "NIS2",
    description: "EU directive for network and information security",
  },
  {
    id: "DORA",
    name: "DORA",
    description: "Digital Operational Resilience Act for financial entities",
  },
  {
    id: "CYBER_RESILIENCE_ACT",
    name: "Cyber Resilience Act",
    description: "EU requirements for digital products with cybersecurity features",
  },
];

const INTEGRATION_CARDS = [
  { name: "GitHub", icon: GitBranch, description: "Pull policies & code evidence" },
  { name: "Google Workspace", icon: FileText, description: "Import documents & policies" },
  { name: "Slack", icon: MessageSquare, description: "Collect attestation responses" },
  { name: "Notion", icon: BookOpen, description: "Sync documentation & runbooks" },
];

const STEPS = [
  "Project Details",
  "About Your Product",
  "Choose Frameworks",
  "Evidence Checklist",
  "Ready to Scan",
];

// ─── Types ───────────────────────────────────────────────────────────────────

type ChecklistItem = {
  id: string;
  title: string;
  why: string;
  required: boolean;
  framework: string;
};

type FormData = {
  name: string;
  description: string;
  industry: string;
  companySize: string;
  usesAI: boolean;
  aiDescription: string;
  aiPurposes: string[];
  dataCategories: string[];
  usesThirdPartyAI: boolean;
  thirdPartyProviders: string;
  trainsOwnModels: boolean;
  hasPrivacyPolicy: boolean;
  selectedFrameworks: string[];
};

// ─── Page component ──────────────────────────────────────────────────────────

export default function NewProjectForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    description: "",
    industry: "",
    companySize: "1-10",
    usesAI: false,
    aiDescription: "",
    aiPurposes: [],
    dataCategories: [],
    usesThirdPartyAI: false,
    thirdPartyProviders: "",
    trainsOwnModels: false,
    hasPrivacyPolicy: false,
    selectedFrameworks: [],
  });

  const updateForm = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const toggleArrayItem = useCallback((key: "aiPurposes" | "dataCategories" | "selectedFrameworks", id: string) => {
    setForm((prev) => {
      const arr = prev[key] as string[];
      return {
        ...prev,
        [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
      };
    });
  }, []);

  // Recommend frameworks based on answers
  const getRecommendedFrameworks = useCallback((): string[] => {
    const rec: string[] = [];
    const cats = form.dataCategories;
    const hasPersonalData =
      cats.includes("personal") ||
      cats.includes("health") ||
      cats.includes("financial") ||
      cats.includes("biometric") ||
      cats.includes("children") ||
      cats.includes("location") ||
      cats.includes("employment");

    if (hasPersonalData) rec.push("GDPR");
    if (form.usesAI) rec.push("EU_AI_ACT");
    if (hasPersonalData || form.usesAI) rec.push("ISO_27001");
    if (cats.includes("financial") || form.industry === "Finance") {
      rec.push("DORA");
      rec.push("SOC2");
    }
    if (form.industry === "Technology" || form.industry === "Manufacturing") {
      rec.push("CYBER_RESILIENCE_ACT");
    }
    if (
      form.industry === "Healthcare" ||
      form.industry === "Government" ||
      form.industry === "Finance"
    ) {
      rec.push("NIS2");
    }
    return [...new Set(rec)];
  }, [form.dataCategories, form.usesAI, form.industry]);

  // Auto-select recommended frameworks when entering step 2
  const applyRecommendations = useCallback(() => {
    const recommended = getRecommendedFrameworks();
    setForm((prev) => ({
      ...prev,
      selectedFrameworks: [
        ...new Set([...prev.selectedFrameworks, ...recommended]),
      ],
    }));
  }, [getRecommendedFrameworks]);

  // Submit to API on step 2 -> step 3 transition
  const createProject = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          industry: form.industry || undefined,
          companySize: form.companySize,
          usesAI: form.usesAI,
          aiDescription: form.aiDescription || undefined,
          aiPurposes: form.aiPurposes,
          dataCategories: form.dataCategories,
          usesThirdPartyAI: form.usesThirdPartyAI,
          thirdPartyProviders: form.usesThirdPartyAI
            ? form.thirdPartyProviders
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          trainsOwnModels: form.trainsOwnModels,
          hasPrivacyPolicy: form.hasPrivacyPolicy,
          selectedFrameworks: form.selectedFrameworks,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setError(j.error || "Project limit reached. Upgrade your plan.");
          return false;
        }
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setChecklist(result.checklist ?? []);
      setProjectId(result.project?.id ?? null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = async () => {
    // Step 2 (frameworks) -> Step 3 (checklist): create project via API
    if (step === 2) {
      if (form.selectedFrameworks.length === 0) {
        setError("Please select at least one framework.");
        return;
      }
      const ok = await createProject();
      if (!ok) return;
    }

    // Step 1 -> Step 2: apply framework recommendations
    if (step === 1) {
      applyRecommendations();
    }

    setError(null);
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError(null);
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const canContinue = (): boolean => {
    switch (step) {
      case 0:
        return form.name.trim().length > 0;
      case 1:
        return true;
      case 2:
        return form.selectedFrameworks.length > 0;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return true;
    }
  };

  const recommended = getRecommendedFrameworks();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold">Create New Project</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-card/50 border-b border-border">
        <div className="max-w-3xl mx-auto px-8 py-4">
          <div className="flex items-center gap-2 mb-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => {
                    if (i < step) {
                      setDirection(-1);
                      setStep(i);
                    }
                  }}
                  disabled={i > step}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all shrink-0 ${
                    i < step
                      ? "bg-blue-600 text-white cursor-pointer"
                      : i === step
                        ? "bg-blue-600 text-white ring-4 ring-blue-600/20"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 rounded-full transition-colors ${
                      i < step ? "bg-blue-600" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-3xl mx-auto px-8 py-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -60 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {step === 0 && (
              <StepProjectDetails form={form} updateForm={updateForm} />
            )}
            {step === 1 && (
              <StepAboutProduct
                form={form}
                updateForm={updateForm}
                toggleArrayItem={toggleArrayItem}
              />
            )}
            {step === 2 && (
              <StepChooseFrameworks
                form={form}
                recommended={recommended}
                toggleArrayItem={toggleArrayItem}
              />
            )}
            {step === 3 && <StepEvidenceChecklist checklist={checklist} />}
            {step === 4 && (
              <StepReadyToScan
                form={form}
                checklist={checklist}
                projectId={projectId}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <button
            onClick={step === 0 ? () => router.push("/projects") : goBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 0 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-3">
            {step === 3 && (
              <button
                onClick={goNext}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                I&apos;ll do this later
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                onClick={goNext}
                disabled={!canContinue() || submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating project...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => router.push(`/scan?projectId=${projectId}`)}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                <ScanSearch className="w-4 h-4" />
                Start Scan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Project Details ─────────────────────────────────────────────────

function StepProjectDetails({
  form,
  updateForm,
}: {
  form: FormData;
  updateForm: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">
          Project Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateForm("name", e.target.value)}
          placeholder="e.g. Customer Portal, Internal Tools, Mobile App"
          className="w-full p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          value={form.description}
          onChange={(e) => updateForm("description", e.target.value)}
          placeholder="Brief description of the project and its purpose"
          rows={3}
          className="w-full p-3 bg-card border border-border rounded-lg text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Industry</label>
        <select
          value={form.industry}
          onChange={(e) => updateForm("industry", e.target.value)}
          className="w-full p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
        >
          <option value="">Select an industry</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Company Size</label>
        <select
          value={form.companySize}
          onChange={(e) => updateForm("companySize", e.target.value)}
          className="w-full p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
        >
          {COMPANY_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} employees
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Step 2: About Your Product ──────────────────────────────────────────────

function StepAboutProduct({
  form,
  updateForm,
  toggleArrayItem,
}: {
  form: FormData;
  updateForm: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  toggleArrayItem: (key: "aiPurposes" | "dataCategories" | "selectedFrameworks", id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Uses AI toggle */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Does your product use AI?
        </label>
        <ToggleButton value={form.usesAI} onChange={(v) => updateForm("usesAI", v)} />
      </div>

      {/* AI details (conditional) */}
      {form.usesAI && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-4 pl-4 border-l-2 border-blue-600/30"
        >
          <div>
            <label className="block text-sm font-medium mb-2">
              Describe how you use AI
            </label>
            <textarea
              value={form.aiDescription}
              onChange={(e) => updateForm("aiDescription", e.target.value)}
              placeholder="e.g. We use AI to analyse customer support tickets and suggest responses"
              rows={3}
              className="w-full p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              AI purposes (select all that apply)
            </label>
            <div className="flex flex-wrap gap-2">
              {AI_PURPOSES.map((p) => {
                const on = form.aiPurposes.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleArrayItem("aiPurposes", p.id)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      on
                        ? "border-blue-600 bg-blue-600/5 text-blue-600 font-medium"
                        : "bg-card border-border hover:border-blue-600/30"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Data categories */}
      <div>
        <label className="block text-sm font-medium mb-2">
          What data categories do you process?
        </label>
        <div className="flex flex-wrap gap-2">
          {DATA_CATEGORIES.map((c) => {
            const on = form.dataCategories.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleArrayItem("dataCategories", c.id)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  on
                    ? "border-blue-600 bg-blue-600/5 text-blue-600 font-medium"
                    : "bg-card border-border hover:border-blue-600/30"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Third-party AI */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Do you use third-party AI providers?
        </label>
        <ToggleButton
          value={form.usesThirdPartyAI}
          onChange={(v) => updateForm("usesThirdPartyAI", v)}
        />
        {form.usesThirdPartyAI && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3"
          >
            <input
              type="text"
              value={form.thirdPartyProviders}
              onChange={(e) => updateForm("thirdPartyProviders", e.target.value)}
              placeholder="e.g. OpenAI, Anthropic, Google"
              className="w-full p-3 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
            />
          </motion.div>
        )}
      </div>

      {/* Train own models */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Do you train your own models?
        </label>
        <ToggleButton
          value={form.trainsOwnModels}
          onChange={(v) => updateForm("trainsOwnModels", v)}
        />
      </div>

      {/* Privacy policy */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Do you have a privacy policy?
        </label>
        <ToggleButton
          value={form.hasPrivacyPolicy}
          onChange={(v) => updateForm("hasPrivacyPolicy", v)}
        />
      </div>
    </div>
  );
}

// ─── Step 3: Choose Frameworks ───────────────────────────────────────────────

function StepChooseFrameworks({
  form,
  recommended,
  toggleArrayItem,
}: {
  form: FormData;
  recommended: string[];
  toggleArrayItem: (key: "aiPurposes" | "dataCategories" | "selectedFrameworks", id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-2">
        Based on your answers, we have pre-selected the frameworks most relevant
        to your project. You can add or remove any.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FRAMEWORKS.map((fw) => {
          const selected = form.selectedFrameworks.includes(fw.id);
          const isRecommended = recommended.includes(fw.id);
          return (
            <button
              key={fw.id}
              type="button"
              onClick={() => toggleArrayItem("selectedFrameworks", fw.id)}
              className={`relative text-left p-5 rounded-xl border-2 transition-all ${
                selected
                  ? "border-blue-600 bg-blue-600/5"
                  : "bg-card border-border hover:border-blue-600/30"
              }`}
            >
              {isRecommended && (
                <span className="absolute top-3 right-3 flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <Star className="w-3 h-3" />
                  Recommended
                </span>
              )}
              <div className="flex items-start gap-3">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                    selected
                      ? "bg-blue-600 border-blue-600"
                      : "border-border"
                  }`}
                >
                  {selected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-medium text-sm">{fw.name}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fw.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: Evidence Checklist ──────────────────────────────────────────────

function StepEvidenceChecklist({ checklist }: { checklist: ChecklistItem[] }) {
  // Group by framework
  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of checklist) {
    const key = item.framework;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Based on your selected frameworks, here are the documents you will need.
        You can handle these now or come back later.
      </p>

      {Object.entries(grouped).map(([fw, items]) => (
        <div key={fw}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {fw.replace(/_/g, " ")}
          </h3>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-sm">{item.title}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.why}
                    </p>
                  </div>
                  {item.required && (
                    <span className="text-xs text-orange-400 font-medium shrink-0 ml-3">
                      Required
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/10 text-blue-600 hover:bg-blue-600/20 transition-colors">
                    <Sparkles className="w-3 h-3" />
                    Generate with AI
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors">
                    <Upload className="w-3 h-3" />
                    Upload
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/80 transition-colors">
                    <Link2 className="w-3 h-3" />
                    Connect integration
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Integrations nudge */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-sm font-medium mb-1">
          Don&apos;t know where to start? Use our integrations
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Connect your existing tools and we will automatically pull in relevant
          evidence.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {INTEGRATION_CARDS.map((card) => (
            <a
              key={card.name}
              href="/settings/integrations"
              className="bg-card border border-border rounded-xl p-4 hover:border-blue-600/30 transition-colors text-center"
            >
              <card.icon className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <div className="text-xs font-medium">{card.name}</div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {card.description}
              </p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Ready to Scan ───────────────────────────────────────────────────

function StepReadyToScan({
  form,
  checklist,
  projectId,
}: {
  form: FormData;
  checklist: ChecklistItem[];
  projectId: string | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold text-lg mb-4">Project Summary</h3>
        <div className="space-y-3">
          <SummaryRow label="Project Name" value={form.name} />
          {form.description && (
            <SummaryRow label="Description" value={form.description} />
          )}
          {form.industry && (
            <SummaryRow label="Industry" value={form.industry} />
          )}
          <SummaryRow label="Company Size" value={`${form.companySize} employees`} />
          <SummaryRow label="Uses AI" value={form.usesAI ? "Yes" : "No"} />

          <div>
            <div className="text-xs text-muted-foreground mb-1.5">
              Frameworks
            </div>
            <div className="flex flex-wrap gap-2">
              {form.selectedFrameworks.map((fw) => (
                <span
                  key={fw}
                  className="px-3 py-1 rounded-full border border-blue-600/30 bg-blue-600/5 text-blue-600 text-xs font-medium"
                >
                  <Shield className="w-3 h-3 inline mr-1" />
                  {fw.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>

          <SummaryRow
            label="Evidence Documents"
            value={`${checklist.length} documents identified`}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pt-4">
        <button
          onClick={() => router.push("/scan")}
          className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl text-base font-semibold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
        >
          <ScanSearch className="w-5 h-5" />
          Start Scan
        </button>
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────

function ToggleButton({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
          value
            ? "bg-blue-600 border-blue-600 text-white"
            : "bg-card border-border hover:border-blue-600/30"
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
          !value
            ? "bg-blue-600 border-blue-600 text-white"
            : "bg-card border-border hover:border-blue-600/30"
        }`}
      >
        No
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
