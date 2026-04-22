# flyer-bot

Automated flyer generation for orgs with an Airtable intake form, a Bannerbear template library, and a Slack review channel. One running instance serves one org; all org-specific details live in a config file under `config/` pointed at by `ORG_CONFIG_PATH`.

## Pipeline

```
Airtable submission
      │
      ▼  POST /webhooks/airtable
┌─────────────────┐    ┌─────────┐    ┌────────────┐    ┌──────────────┐
│ Airtable record │ ─► │ Claude  │ ─► │ Bannerbear │ ─► │ Slack review │
│  (webhook)      │    │ (JSON)  │    │  (render)  │    │  (buttons)   │
└─────────────────┘    └─────────┘    └────────────┘    └──────┬───────┘
                                                               │
                                          ┌────────────────────┴────────────────────┐
                                          ▼                                         ▼
                                 Approve → Airtable final            Request revision → Claude (loop)
```

## Setup

Requires Node 20+ and pnpm.

```sh
pnpm install
cp .env.example .env          # then fill in real keys; .env is gitignored
cp config/example.json config/<yourorg>.json
# edit config/<yourorg>.json and set ORG_CONFIG_PATH in .env
```

All API keys and config paths are validated at startup via Zod. The process exits with a structured error if anything is missing or malformed.

## Running

```sh
pnpm dev              # start the server with tsx watch
pnpm build && pnpm start   # production build
pnpm test             # vitest
pnpm typecheck        # tsc --noEmit
```

## Smoke tests

- **`pnpm test-pipeline`** — runs a hardcoded fake submission through Claude and Bannerbear, prints the validated LLM JSON and the rendered image URL. No Airtable or Slack needed. Requires real `ANTHROPIC_API_KEY`, `BANNERBEAR_API_KEY`, and a real Bannerbear template UID in the loaded config.
- **`pnpm test-slack`** — posts a sample Block Kit draft message to `slack.draftChannelId`. No Anthropic or Bannerbear calls; uses a placeholder image.

## Adding a new org

1. Copy `config/example.json` to `config/<yourorg>.json`.
2. Fill in `orgName`, `orgDescription`, `brandVoice`, the Airtable column mapping, the Bannerbear templates, and the Slack channel ID. See [`config/README.md`](./config/README.md) for a field-by-field reference.
3. Point `ORG_CONFIG_PATH` at the new file.
4. Restart. The server fails loudly if anything is missing.

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the full project brief. Highlights:

- No `any`. Zod inferred types everywhere.
- Every external API call goes through a thin client in `src/clients/`.
- Handlers in `src/handlers/` are pure orchestration — they call clients, never SDKs directly.
- Prompts live in `src/prompts/` as `.md` files with `{{placeholder}}` tokens; org-specific values are interpolated at runtime by `src/prompts/loader.ts`.
- Nothing org-specific in code. All org details come from the loaded config.
- Fail loudly with structured logs; never swallow errors.

## Layout

```
src/
  index.ts              # Express + Bolt entry
  config.ts             # loads .env + ORG_CONFIG_PATH, Zod-validates
  clients/              # anthropic, bannerbear, airtable, slack
  webhooks/airtable.ts  # POST /webhooks/airtable
  handlers/             # generate (full), revise + approve (stubs)
  slack/                # draftMessage (Block Kit) + actions (button handlers)
  prompts/              # generateFlyer.md, reviseFlyer.md, loader.ts
  schemas/              # orgConfig + flyer (LLM output, runtime-built)
  templates/catalog.ts  # selectors over config.templates
  util/logger.ts        # pino
config/                 # per-org JSON; example.json + pace.json committed
scripts/                # test-pipeline.ts, test-slack.ts
tests/handlers/         # vitest
```
