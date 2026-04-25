"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AI_PURPOSES = [
  { id: "chatbot", label: "Chatbot / assistant" },
  { id: "recommendations", label: "Recommendations / personalisation" },
  { id: "autonomous", label: "Autonomous actions (runs scripts, takes actions)" },
  { id: "hiring", label: "Hiring / HR screening" },
  { id: "scoring", label: "Credit / insurance / behavioural scoring" },
  { id: "content", label: "Content generation" },
  { id: "other", label: "Other" },
];

const DATA_CATEGORIES = [
  { id: "names_emails", label: "Names / emails" },
  { id: "payments", label: "Payments / billing" },
  { id: "health", label: "Health data" },
  { id: "children", label: "Data about children" },
  { id: "location", label: "Location" },
  { id: "biometric", label: "Biometric / face / voice" },
  { id: "behavioural", label: "Behavioural / analytics" },
  { id: "none", label: "None" },
];

const USER_TYPES = [
  { id: "eu_consumers", label: "EU consumers" },
  { id: "businesses", label: "Businesses" },
  { id: "employees", label: "Employees only" },
];

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic / Claude" },
  { id: "google", label: "Google Gemini" },
  { id: "mistral", label: "Mistral" },
  { id: "huggingface", label: "HuggingFace" },
  { id: "other", label: "Other" },
];

type Result = {
  riskTier: string;
  applicableFrameworks: string[];
  summary: string;
  plainEnglishExplainer: string;
  documentChecklist: { id: string; title: string; why: string; required: boolean }[];
};

export default function QuestionnairePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [productDescription, setProductDescription] = useState("");
  const [usesAI, setUsesAI] = useState(true);
  const [aiPurposes, setAiPurposes] = useState<string[]>([]);
  const [dataCategories, setDataCategories] = useState<string[]>([]);
  const [userTypes, setUserTypes] = useState<string[]>([]);
  const [size, setSize] = useState("1-10");
  const [country, setCountry] = useState("DE");
  const [hasPrivacyPolicy, setHasPrivacyPolicy] = useState(false);
  const [usesThirdPartyAI, setUsesThirdPartyAI] = useState(true);
  const [thirdPartyProviders, setThirdPartyProviders] = useState<string[]>([]);
  const [trainsOwnModels, setTrainsOwnModels] = useState(false);

  const toggle = (setter: (v: string[]) => void, current: string[], id: string) => {
    setter(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription,
          usesAI,
          aiPurposes,
          dataCategories,
          userTypes,
          size,
          country,
          hasPrivacyPolicy,
          usesThirdPartyAI,
          thirdPartyProviders,
          trainsOwnModels,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Here&apos;s what Kodex found</h1>
        <p className="text-muted-foreground mb-6">{result.plainEnglishExplainer}</p>

        <div className="mb-6 p-4 bg-card border border-border rounded-xl">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">EU AI Act risk tier</div>
          <div className="text-xl font-semibold">{result.riskTier}</div>
        </div>

        <div className="mb-6">
          <h2 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">Frameworks that apply</h2>
          <div className="flex flex-wrap gap-2">
            {result.applicableFrameworks.map((f) => (
              <span key={f} className="px-3 py-1 rounded-full border border-border bg-card text-sm">
                {f.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">Upload these documents</h2>
          <div className="space-y-2">
            {result.documentChecklist.map((d) => (
              <div key={d.id} className="p-4 bg-card border border-border rounded-xl">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-medium">{d.title}</div>
                  <span className={`text-xs ${d.required ? "text-orange-400" : "text-muted-foreground"}`}>
                    {d.required ? "Required" : "Optional"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{d.why}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => router.push("/evidence")}
          className="px-6 py-3 bg-primary rounded-lg hover:bg-primary/90 font-medium"
        >
          Upload documents →
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Tell us about your product</h1>
      <p className="text-muted-foreground text-sm mb-8">
        8 quick questions. No jargon. We&apos;ll figure out which EU rules apply to you.
      </p>

      <div className="space-y-6">
        <Field label="1. What does your product do? (one sentence)">
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="e.g. Bob is a local autonomous AI that troubleshoots PC issues by running scripts"
            className="w-full p-3 bg-card border border-border rounded-lg text-sm min-h-[80px]"
          />
        </Field>

        <Field label="2. Do you use AI?">
          <Toggle value={usesAI} onChange={setUsesAI} />
        </Field>

        {usesAI && (
          <Field label="3. What do you use AI for? (pick all that apply)">
            <CheckGroup
              options={AI_PURPOSES}
              selected={aiPurposes}
              onToggle={(id) => toggle(setAiPurposes, aiPurposes, id)}
            />
          </Field>
        )}

        <Field label="4. What kind of data do you handle?">
          <CheckGroup
            options={DATA_CATEGORIES}
            selected={dataCategories}
            onToggle={(id) => toggle(setDataCategories, dataCategories, id)}
          />
        </Field>

        <Field label="5. Who are your users?">
          <CheckGroup options={USER_TYPES} selected={userTypes} onToggle={(id) => toggle(setUserTypes, userTypes, id)} />
        </Field>

        <Field label="6. Team size">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="p-3 bg-card border border-border rounded-lg text-sm"
          >
            <option>1-10</option>
            <option>11-50</option>
            <option>51-200</option>
            <option>200+</option>
          </select>
        </Field>

        <Field label="7. Do you have a privacy policy live on your site?">
          <Toggle value={hasPrivacyPolicy} onChange={setHasPrivacyPolicy} />
        </Field>

        <Field label="8. Do you use third-party AI APIs (OpenAI, Anthropic, etc)?">
          <Toggle value={usesThirdPartyAI} onChange={setUsesThirdPartyAI} />
          {usesThirdPartyAI && (
            <div className="mt-3">
              <CheckGroup
                options={PROVIDERS}
                selected={thirdPartyProviders}
                onToggle={(id) => toggle(setThirdPartyProviders, thirdPartyProviders, id)}
              />
            </div>
          )}
        </Field>

        <Field label="Bonus — do you train your own AI models?">
          <Toggle value={trainsOwnModels} onChange={setTrainsOwnModels} />
        </Field>

        {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || productDescription.length < 5}
          className="px-6 py-3 bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          {submitting ? "Classifying…" : "See what applies to me →"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-4 py-2 rounded-lg text-sm border ${value ? "bg-primary border-primary" : "bg-card border-border"}`}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-4 py-2 rounded-lg text-sm border ${!value ? "bg-primary border-primary" : "bg-card border-border"}`}
      >
        No
      </button>
    </div>
  );
}

function CheckGroup({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={`px-3 py-2 rounded-lg text-sm border ${on ? "bg-primary border-primary" : "bg-card border-border hover:border-primary/30"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
