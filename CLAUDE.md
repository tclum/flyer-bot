# Flyer Bot

A general-purpose service that automates flyer generation for any
organization with an Airtable intake form, Bannerbear template library,
and Slack-based approval flow. Org-specific details live in config files
under config/.

## Pipeline

Airtable submission → webhook → Claude generates template JSON →
Bannerbear renders flyer → Slack message with Approve / Request Revision
buttons → on revision, loop back to Claude with notes → on approve,
write final to Airtable.

## Stack

- Node.js 20 + TypeScript, strict mode
- Express for webhooks
- Slack Bolt for Slack interactivity (signature verification, button routing)
- Anthropic SDK (model: claude-sonnet-4-6)
- Airtable SDK, Bannerbear SDK
- Zod for all runtime validation, including config files and LLM outputs
- Vitest for tests, pino for structured logs
- pnpm for package management

## Conventions

- No `any`. Use Zod inferred types everywhere.
- Every external API call goes through a thin client in src/clients/.
- Prompts live in src/prompts/ as .md files, loaded at runtime, with
  org-specific values interpolated from the loaded config.
- Handlers in src/handlers/ are pure orchestration — they call clients,
  never SDKs directly.
- Nothing org-specific in code. All org details come from the config
  file referenced by ORG_CONFIG_PATH.
- Fail loudly with structured logs; never swallow errors.
- Validate all LLM JSON output with Zod before using it.

## Org config format

Each org has a single JSON file in config/. Schema is defined in
src/schemas/orgConfig.ts. Includes: org name, brand voice rules,
Airtable table name + field name mapping, list of available
Bannerbear templates with their field schemas, and Slack channel ID.

See config/example.json for the canonical template and config/pace.json
for the first real org.

## First test org

PACE (Pacific Asian Center for Entrepreneurship), a student
entrepreneurship center at UH Mānoa's Shidler College of Business.

## Out of scope for v1

- Multiple concurrent revisions per flyer
- Auto-publishing to social media
- Video or animated output
- Multi-tenancy in a single running instance (one config per process)

flyer-bot/
├── CLAUDE.md # Project brief — Claude Code reads this every session
├── README.md
├── package.json # "name": "flyer-bot"
├── tsconfig.json
├── .env.example # committed; real .env is gitignored
├── .gitignore
├── config/
│ ├── README.md # explains the org config format
│ ├── pace.json # PACE's specific config
│ └── example.json # committed template for new orgs
├── src/
│ ├── index.ts # Express + Slack Bolt entry point
│ ├── config.ts # Loads .env AND the org config file, validates with Zod
│ ├── clients/
│ │ ├── airtable.ts
│ │ ├── anthropic.ts
│ │ ├── bannerbear.ts
│ │ └── slack.ts
│ ├── webhooks/
│ │ └── airtable.ts # POST /webhooks/airtable
│ ├── handlers/
│ │ ├── generate.ts # New submission → draft
│ │ ├── revise.ts # Revision notes → new draft
│ │ └── approve.ts # Approved → finalize + store
│ ├── slack/
│ │ ├── draftMessage.ts # Block Kit for the review message
│ │ └── actions.ts # Button handlers: approve / request revision
│ ├── prompts/
│ │ ├── generateFlyer.md # System prompt, with {{placeholders}} from config
│ │ └── reviseFlyer.md
│ ├── schemas/
│ │ ├── flyer.ts # Zod schemas for template field JSON
│ │ └── orgConfig.ts # Zod schema for the org config file
│ ├── templates/
│ │ └── catalog.ts # Reads templates from loaded config
│ └── util/
│ └── logger.ts # pino
├── scripts/
│ ├── test-pipeline.ts # End-to-end with fixture data, no Airtable
│ └── test-slack.ts # Post a sample draft message
└── tests/
└── handlers/
└── generate.test.ts
