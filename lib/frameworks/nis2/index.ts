import type { FrameworkPlugin } from "../base";
import { nis2Rules } from "./rules";

export const nis2Plugin: FrameworkPlugin = {
  id: "NIS2",
  name: "NIS2",
  version: "2022",
  description: "EU Network and Information Security Directive 2 (2022/2555) — cybersecurity obligations for essential and important entities",
  rules: nis2Rules,
};
