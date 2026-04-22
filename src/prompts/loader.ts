import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OrgConfig } from "../schemas/orgConfig.js";

const here = dirname(fileURLToPath(import.meta.url));

function renderTemplateCatalog(config: OrgConfig): string {
  return config.templates
    .map((t) => {
      const fields = t.fields
        .map((f) => {
          const limit = f.maxChars ? ` (max ${f.maxChars} chars)` : "";
          return `    - ${f.name} [${f.type}]${limit}: ${f.description}`;
        })
        .join("\n");
      return `- id: ${t.id}\n  name: ${t.name}\n  when to pick: ${t.description}\n  fields:\n${fields}`;
    })
    .join("\n\n");
}

function tokensFor(config: OrgConfig): Record<string, string> {
  return {
    orgName: config.orgName,
    orgDescription: config.orgDescription,
    brandTone: config.brandVoice.tone,
    brandDo: config.brandVoice.do.join("; "),
    brandDont: config.brandVoice.dont.join("; "),
    brandTaglines: config.brandVoice.taglines.join("; "),
    templateCatalog: renderTemplateCatalog(config),
  };
}

function interpolate(body: string, tokens: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = tokens[key];
    if (val === undefined) {
      throw new Error(`prompt token {{${key}}} has no value`);
    }
    return val;
  });
}

export function loadPrompt(name: "generateFlyer" | "reviseFlyer", config: OrgConfig): string {
  const path = resolve(here, `${name}.md`);
  const body = readFileSync(path, "utf8");
  return interpolate(body, tokensFor(config));
}
