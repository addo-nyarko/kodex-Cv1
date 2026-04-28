import type { FrameworkPlugin } from "../base";
import { productLiabilityRules } from "./rules";

export const productLiabilityPlugin: FrameworkPlugin = {
  id: "PRODUCT_LIABILITY",
  name: "EU Product Liability Directive",
  version: "2024",
  description: "EU Product Liability Directive (2024/2853) — liability for defective products including software and AI systems",
  rules: productLiabilityRules,
};
