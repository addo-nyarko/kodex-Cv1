import type { FrameworkPlugin } from "../base";
import { euAiActRules } from "./rules";

export const euAiActPlugin: FrameworkPlugin = {
  id: "EU_AI_ACT",
  name: "EU AI Act",
  version: "2024",
  description: "European Union Artificial Intelligence Act — risk classification and conformity requirements",
  rules: euAiActRules,
};
