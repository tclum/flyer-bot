import type { OrgConfig, Template } from "../schemas/orgConfig.js";

export function listTemplates(config: OrgConfig): Template[] {
  return config.templates;
}

export function findTemplate(config: OrgConfig, id: string): Template | undefined {
  return config.templates.find((t) => t.id === id);
}

export function requireTemplate(config: OrgConfig, id: string): Template {
  const t = findTemplate(config, id);
  if (!t) {
    throw new Error(`unknown templateId=${id}; not in org config`);
  }
  return t;
}
