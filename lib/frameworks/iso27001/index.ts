import type { FrameworkPlugin } from "../base";
import { iso27001Rules } from "./rules";

export const iso27001Plugin: FrameworkPlugin = {
  id: "ISO_27001",
  name: "ISO 27001",
  version: "2022",
  description: "ISO/IEC 27001:2022 — Information security management system requirements",
  rules: iso27001Rules,
};
