import type { FrameworkPlugin } from "../base";
import { gdprRules } from "./rules";

export const gdprPlugin: FrameworkPlugin = {
  id: "GDPR",
  name: "GDPR",
  version: "2018",
  description: "General Data Protection Regulation — EU data protection and privacy regulation",
  rules: gdprRules,
};
