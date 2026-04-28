import type { FrameworkPlugin } from "../base";
import { cyberResilienceActRules } from "./rules";

export const cyberResilienceActPlugin: FrameworkPlugin = {
  id: "CYBER_RESILIENCE_ACT",
  name: "EU Cyber Resilience Act",
  version: "2024",
  description: "EU Cyber Resilience Act (2024) — cybersecurity requirements for products with digital elements",
  rules: cyberResilienceActRules,
};
