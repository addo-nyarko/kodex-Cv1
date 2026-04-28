import type { FrameworkPlugin } from "./base";
import { euAiActPlugin } from "./eu-ai-act";
import { gdprPlugin } from "./gdpr";
import { soc2Plugin } from "./soc2";
import { iso27001Plugin } from "./iso27001";
import { nis2Plugin } from "./nis2";
import { doraPlugin } from "./dora";
import { cyberResilienceActPlugin } from "./cyber-resilience-act";
import { productLiabilityPlugin } from "./product-liability";
import { customPlugin } from "./custom";

const registry = new Map<string, FrameworkPlugin>();

function registerPlugin(plugin: FrameworkPlugin) {
  registry.set(plugin.id, plugin);
}

registerPlugin(euAiActPlugin);
registerPlugin(gdprPlugin);
registerPlugin(soc2Plugin);
registerPlugin(iso27001Plugin);
registerPlugin(nis2Plugin);
registerPlugin(doraPlugin);
registerPlugin(cyberResilienceActPlugin);
registerPlugin(productLiabilityPlugin);
registerPlugin(customPlugin);

export const frameworkRegistry = registry;
