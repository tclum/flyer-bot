import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { orgConfigSchema, type OrgConfig } from "./schemas/orgConfig.js";
import { logger } from "./util/logger.js";

loadDotenv();

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  AIRTABLE_PAT: z.string().min(1),
  AIRTABLE_BASE_ID: z.string().min(1),
  AIRTABLE_WEBHOOK_SECRET: z.string().min(32),
  BANNERBEAR_API_KEY: z.string().min(1),
  BANNERBEAR_PROJECT_ID: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_DRAFT_CHANNEL_ID: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.string().default("info"),
  ORG_CONFIG_PATH: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
});

export type Env = z.infer<typeof envSchema>;

function failStartup(msg: string, detail: unknown): never {
  logger.fatal({ detail }, msg);
  process.exit(1);
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    failStartup("invalid environment variables", parsed.error.format());
  }
  return parsed.data;
}

function loadOrgConfig(path: string): OrgConfig {
  const absolute = resolve(path);
  let raw: string;
  try {
    raw = readFileSync(absolute, "utf8");
  } catch (err) {
    failStartup(`cannot read ORG_CONFIG_PATH=${absolute}`, err);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    failStartup(`ORG_CONFIG_PATH is not valid JSON: ${absolute}`, err);
  }
  const result = orgConfigSchema.safeParse(parsed);
  if (!result.success) {
    failStartup(`org config failed validation: ${absolute}`, result.error.format());
  }
  return result.data;
}

export const env: Env = loadEnv();
export const orgConfig: OrgConfig = loadOrgConfig(env.ORG_CONFIG_PATH);

export const appConfig = {
  env,
  org: orgConfig,
} as const;

export type AppConfig = typeof appConfig;
