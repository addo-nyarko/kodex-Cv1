import type { FrameworkPlugin } from "../base";
import { soc2Rules } from "./rules";

export const soc2Plugin: FrameworkPlugin = {
  id: "SOC2",
  name: "SOC 2",
  version: "2017",
  description: "AICPA SOC 2 — Trust Services Criteria for security, availability, processing integrity, confidentiality, and privacy",
  rules: soc2Rules,
};
