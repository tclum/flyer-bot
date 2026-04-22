# Org config format

One JSON file per org. The running service loads exactly one, pointed at by the `ORG_CONFIG_PATH` env var. Schema lives in [`src/schemas/orgConfig.ts`](../src/schemas/orgConfig.ts) and is validated at startup — if a field is missing or malformed, the process exits.

See [`example.json`](./example.json) for a canonical template and [`pace.json`](./pace.json) for the first real org (PACE).

## Fields

- **`orgName`** — Short display name. Used in Slack messages and in the LLM system prompt.
- **`orgDescription`** — 1–2 sentences describing the org. Interpolated into the LLM system prompt so the model understands the audience.
- **`brandVoice`**
  - `tone` — One-line description of the overall voice.
  - `do` — Bullet list of do's the LLM should follow.
  - `dont` — Bullet list of don'ts the LLM should avoid.
  - `taglines` — Approved slogans. The LLM is instructed not to invent taglines.
- **`airtable`**
  - `tableName` — Exact Airtable table name.
  - `fields` — Map from the app's logical field names (keys, fixed) to the org's actual Airtable column names (values). Required keys: `eventTitle`, `eventDate`, `eventTime`, `location`, `description`, `templateHint`, `status`, `draftImageUrl`, `finalImageUrl`, `revisionNotes`, `audience`, `requesterEmail`, `generatedJson`, `revisionCount`. Optional writable: `deadline`, `supportingAttachments`, `slackMessageTs`. Optional read-only (Airtable auto / formula / AI fields): `createdAt`, `daysUntilDeadline`, `isOverdue`, `shortDescriptionSummary`, `suggestedFlyerImprovements`.
- **`templates`** — Nonempty array of Bannerbear templates the LLM may choose from.
  - `id` — Bannerbear template UID.
  - `name` — Human-readable name (for logs / Slack).
  - `description` — When the LLM should prefer this template over the others.
  - `fields` — Nonempty list of Bannerbear layer overrides:
    - `name` — Exact Bannerbear layer name.
    - `type` — `"text"`, `"image"`, or `"color"`.
    - `description` — Tells the LLM what to put there.
    - `maxChars` — Optional character limit (text only; enforced by Zod).
- **`slack.draftChannelId`** — Channel where draft flyers are posted for review.
- **`timezone`** — IANA timezone (e.g., `"Pacific/Honolulu"`, `"America/Los_Angeles"`) used to derive weekday/month/day labels from each submission's `eventDate` so the LLM never does calendar math. Optional; defaults to `Pacific/Honolulu`.

## Adding a new org

1. Copy `example.json` to `config/<yourorg>.json`.
2. Replace every placeholder (template UIDs, Airtable column names, Slack channel ID).
3. Update your `.env` to point `ORG_CONFIG_PATH` at the new file.
4. Start the service — it will fail loudly if anything is missing.
