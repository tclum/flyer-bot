import type { AnthropicClient } from "../clients/anthropic.js";
import type { BannerbearClient } from "../clients/bannerbear.js";
import type { OrgConfig } from "../schemas/orgConfig.js";
import type { GenerateResult } from "./generate.js";

export interface ReviseDeps {
  anthropic: AnthropicClient;
  bannerbear: BannerbearClient;
  orgConfig: OrgConfig;
}

export interface ReviseInput {
  recordId: string;
  previousDraft: Pick<GenerateResult, "templateId" | "fields" | "rationale">;
  revisionNotes: string;
}

export async function revise(
  _input: ReviseInput,
  _deps: ReviseDeps,
): Promise<GenerateResult> {
  // TODO: load reviseFlyer.md via prompts/loader, feed previousDraft + notes,
  //       validate with buildFlyerOutputSchema, render via bannerbear,
  //       update Slack message, write new draft URL to Airtable.
  throw new Error("revise handler not yet implemented");
}
