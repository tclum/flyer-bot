export type Block = Record<string, unknown>;

export interface DraftMessageParams {
  recordId: string;
  eventTitle: string;
  imageUrl: string;
  revisionNumber: number;
  rationale?: string;
  dateLine?: string;
  locationLine?: string;
}

export interface BuiltMessage {
  text: string;
  blocks: Block[];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Active review message: image + buttons. Used for both the first-draft
 * root post (revisionNumber === 0) and subsequent threaded revision
 * replies (revisionNumber > 0). Action handlers in slack/actions.ts listen
 * for flyer_approve and flyer_revise.
 */
export function buildDraftMessage(params: DraftMessageParams): BuiltMessage {
  const isRevision = params.revisionNumber > 0;
  const readyLabel = isRevision
    ? `Revision ${params.revisionNumber} — ready for review`
    : "Draft — ready for review";
  const text = isRevision
    ? `Revision ${params.revisionNumber} for: ${params.eventTitle}`
    : `Draft flyer for: ${params.eventTitle}`;

  const blocks: Block[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(params.eventTitle, 150) },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*${readyLabel}*` }],
    },
    {
      type: "image",
      image_url: params.imageUrl,
      alt_text: `Flyer for ${params.eventTitle}`,
    },
  ];

  if (params.dateLine || params.locationLine) {
    const lines: string[] = [];
    if (params.dateLine) lines.push(`*When:* ${params.dateLine}`);
    if (params.locationLine) lines.push(`*Where:* ${params.locationLine}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    });
  }

  if (params.rationale) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${params.rationale}_` }],
    });
  }

  blocks.push({
    type: "actions",
    block_id: "flyer_review",
    elements: [
      {
        type: "button",
        action_id: "flyer_approve",
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
        value: params.recordId,
      },
      {
        type: "button",
        action_id: "flyer_revise",
        text: { type: "plain_text", text: "Request revision" },
        value: params.recordId,
      },
    ],
  });

  return { text, blocks };
}

/**
 * Minimal "this draft has been superseded" state for the previous active
 * message when a new revision reply is posted. Drops the image (we don't
 * have the old URL handy at supersede time) — users scroll up in the
 * thread to see prior renders.
 */
export function buildSupersededMessage(args: {
  eventTitle: string;
  supersededByRevision: number;
}): BuiltMessage {
  return {
    text: `Superseded by revision ${args.supersededByRevision}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `~_Draft for *${args.eventTitle}*_~`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Superseded by revision ${args.supersededByRevision} — see the thread reply below.`,
          },
        ],
      },
    ],
  };
}

/**
 * Replaces the action block on an existing message with a terminal-state
 * context line. Used by the approve / revise click handlers — they read
 * the existing message blocks from the click payload, filter out the
 * actions block, and append the footer this function returns.
 */
export function buildStatusFooterBlock(args: {
  kind: "approved" | "revision_requested";
  userId: string;
  at: Date;
}): Block {
  const when = formatWhen(args.at);
  const text =
    args.kind === "approved"
      ? `:white_check_mark: Approved by <@${args.userId}> at ${when}`
      : `:pencil2: Revision requested by <@${args.userId}> at ${when} — generating new draft…`;
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  };
}

function formatWhen(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}
