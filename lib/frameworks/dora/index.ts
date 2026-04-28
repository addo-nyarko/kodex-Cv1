import type { FrameworkPlugin } from "../base";
import { doraRules } from "./rules";

export const doraPlugin: FrameworkPlugin = {
  id: "DORA",
  name: "DORA",
  version: "2022",
  description: "EU Digital Operational Resilience Act (2022/2554) — ICT risk management and operational resilience for financial entities",
  rules: doraRules,
};
