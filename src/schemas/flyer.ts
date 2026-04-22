import { z } from "zod";
import type { OrgConfig, Template, TemplateField } from "./orgConfig.js";

function fieldSchema(field: TemplateField): z.ZodString {
  if (field.type === "image") {
    return z.string().url();
  }
  let s = z.string().min(1);
  if (field.maxChars !== undefined) {
    s = s.max(field.maxChars);
  }
  return s;
}

function branchSchemaFor(template: Template) {
  const shape: Record<string, z.ZodString> = {};
  for (const f of template.fields) {
    shape[f.name] = fieldSchema(f);
  }
  return z.object({
    templateId: z.literal(template.id),
    fields: z.object(shape).strict(),
    rationale: z.string().optional(),
  });
}

export function buildFlyerOutputSchema(config: OrgConfig) {
  const [first, ...rest] = config.templates;
  if (!first) {
    throw new Error("org config must contain at least one template");
  }
  const branches = [branchSchemaFor(first), ...rest.map(branchSchemaFor)] as [
    ReturnType<typeof branchSchemaFor>,
    ...ReturnType<typeof branchSchemaFor>[],
  ];
  return z.discriminatedUnion("templateId", branches);
}

export type FlyerOutput = {
  templateId: string;
  fields: Record<string, string>;
  rationale?: string;
};
