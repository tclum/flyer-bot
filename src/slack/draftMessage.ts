export interface DraftMessageParams {
  recordId: string;
  eventTitle: string;
  imageUrl: string;
  rationale?: string;
}

export interface DraftMessage {
  text: string;
  blocks: Record<string, unknown>[];
}

/**
 * Builds the Block Kit message for the review channel: image preview plus
 * Approve / Request Revision buttons. The action_id values are what
 * slack/actions.ts listens for.
 */
export function buildDraftMessage(params: DraftMessageParams): DraftMessage {
  const text = `Draft flyer for: ${params.eventTitle}`;
  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Draft flyer:* ${params.eventTitle}` },
    },
    {
      type: "image",
      image_url: params.imageUrl,
      alt_text: `Draft flyer for ${params.eventTitle}`,
    },
  ];
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
        action_id: "approve_flyer",
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
        value: params.recordId,
      },
      {
        type: "button",
        action_id: "request_revision",
        text: { type: "plain_text", text: "Request revision" },
        value: params.recordId,
      },
    ],
  });
  return { text, blocks };
}
