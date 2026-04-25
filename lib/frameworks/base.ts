import type { ControlRule } from "@/types/scan";

export interface FrameworkPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  rules: ControlRule[];
}
