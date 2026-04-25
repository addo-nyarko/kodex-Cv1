import type { FrameworkPlugin } from "./base";
import { euAiActPlugin } from "./eu-ai-act";
import { gdprPlugin } from "./gdpr";

const registry = new Map<string, FrameworkPlugin>();

function registerPlugin(plugin: FrameworkPlugin) {
  registry.set(plugin.id, plugin);
}

registerPlugin(euAiActPlugin);
registerPlugin(gdprPlugin);

export const frameworkRegistry = registry;
