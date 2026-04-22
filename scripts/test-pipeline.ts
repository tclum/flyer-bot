/**
 * End-to-end smoke test for the Anthropic -> Bannerbear path.
 *
 * Uses a hardcoded fake submission so it does NOT need Airtable or Slack.
 * It prints (a) the validated LLM JSON and (b) the Bannerbear image URL.
 * Fails loudly (nonzero exit) on any error.
 *
 * Requires real ANTHROPIC_API_KEY, BANNERBEAR_API_KEY, and a real
 * template UID in the org config pointed at by ORG_CONFIG_PATH.
 */
import { appConfig } from "../src/config.js";
import { AnthropicClient } from "../src/clients/anthropic.js";
import { BannerbearClient } from "../src/clients/bannerbear.js";
import { generate, type Submission } from "../src/handlers/generate.js";
import { logger } from "../src/util/logger.js";

const fakeSubmission: Submission = {
  recordId: "recFAKE000000000",
  eventTitle: "PACE Pitch Night — Spring Finals",
  eventDate: "2026-05-03",
  eventTime: "6:00 PM",
  location: "Shidler BusAd C-201",
  description:
    "Ten student teams pitch to a panel of local founders and investors. Prizes, food, and networking. Open to all UH Mānoa students.",
  audience: "UH Mānoa undergrads interested in entrepreneurship",
  requesterEmail: "pace-events@hawaii.edu",
};

async function main(): Promise<void> {
  const { env, org } = appConfig;

  const anthropic = new AnthropicClient(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  const bannerbear = new BannerbearClient(env.BANNERBEAR_API_KEY);

  const placeholderTemplate = org.templates.find((t) =>
    t.id.startsWith("REPLACE_WITH_"),
  );
  if (placeholderTemplate) {
    logger.warn(
      { templateId: placeholderTemplate.id },
      "org config still has a placeholder Bannerbear template UID — Bannerbear will reject the render",
    );
  }

  const result = await generate(fakeSubmission, {
    anthropic,
    bannerbear,
    orgConfig: org,
  });

  logger.info({ llmOutput: { templateId: result.templateId, fields: result.fields, rationale: result.rationale } }, "LLM output");
  logger.info({ imageUrl: result.imageUrl }, "Bannerbear render URL");

  // Also print plain to stdout for easy copy/paste.
  process.stdout.write(
    `\nLLM output:\n${JSON.stringify({ templateId: result.templateId, fields: result.fields, rationale: result.rationale }, null, 2)}\n`,
  );
  process.stdout.write(`\nImage URL: ${result.imageUrl}\n`);
}

main().catch((err) => {
  logger.fatal({ err }, "test-pipeline failed");
  process.exit(1);
});
