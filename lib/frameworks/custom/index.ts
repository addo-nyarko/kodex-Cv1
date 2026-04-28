import type { FrameworkPlugin } from "../base";
import { customRules } from "./rules";

export const customPlugin: FrameworkPlugin = {
  id: "CUSTOM",
  name: "Custom Security Baseline",
  version: "1.0",
  description: "Generic security baseline controls applicable to any software product",
  rules: customRules,
};
