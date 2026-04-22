import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVE_ACTION_ID,
  REVISE_ACTION_ID,
  REVISE_MODAL_CALLBACK_ID,
  REVISE_NOTES_ACTION_ID,
  REVISE_NOTES_BLOCK_ID,
  makeApproveHandler,
  makeReviseClickHandler,
  makeReviseSubmitHandler,
} from "../../src/slack/actions.js";
import type { OrgConfig } from "../../src/schemas/orgConfig.js";
import type { AirtableClient } from "../../src/clients/airtable.js";

const orgConfig: OrgConfig = {
  orgName: "Test",
  orgDescription: "Testing.",
  brandVoice: { tone: "x", do: ["a"], dont: ["b"], taglines: ["c"] },
  airtable: {
    tableName: "t",
    fields: {
      eventTitle: "Event Title",
      eventDate: "Event Date",
      eventTime: "Event Time",
      location: "Location",
      description: "Description",
      templateHint: "Template Hint",
      status: "Status",
      draftImageUrl: "Draft Flyer",
      finalImageUrl: "Final Flyer",
      revisionNotes: "Revision Notes",
      audience: "Audience",
      requesterEmail: "Requester Email",
      generatedJson: "Generated JSON",
      revisionCount: "Revision Count",
    },
  },
  templates: [
    {
      id: "tpl",
      name: "Tpl",
      description: "Test",
      fields: [{ name: "h", type: "text", description: "h", maxChars: 10 }],
    },
  ],
  slack: { draftChannelId: "C1" },
  timezone: "UTC",
  maxRevisions: 5,
};

function makeAirtable(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    copyDraftToFinal: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    updateStatus: vi.fn<(id: string, s: string) => Promise<void>>().mockResolvedValue(undefined),
    getRevisionCount: vi.fn<(id: string) => Promise<number>>().mockResolvedValue(0),
    appendRevisionNotes: vi.fn<(id: string, n: string) => Promise<void>>().mockResolvedValue(undefined),
    incrementRevisionCount: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AirtableClient & {
    copyDraftToFinal: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    getRevisionCount: ReturnType<typeof vi.fn>;
    appendRevisionNotes: ReturnType<typeof vi.fn>;
    incrementRevisionCount: ReturnType<typeof vi.fn>;
  };
}

function makeClient() {
  return {
    chat: {
      update: vi.fn<(p: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue(undefined),
      postMessage: vi.fn<(p: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue(undefined),
      postEphemeral: vi.fn<(p: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue(undefined),
    },
    views: {
      open: vi.fn<(p: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue(undefined),
    },
  };
}

function approveClickBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    actions: [{ action_id: APPROVE_ACTION_ID, value: "recXYZ" }],
    user: { id: "U100", name: "reviewer" },
    channel: { id: "C1" },
    message: {
      ts: "1712345678.000100",
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Pitch Night" } },
        { type: "image", image_url: "https://cdn.example/x.png", alt_text: "x" },
        {
          type: "actions",
          elements: [
            { type: "button", action_id: APPROVE_ACTION_ID, value: "recXYZ" },
          ],
        },
      ],
    },
    trigger_id: "trig-1",
    ...overrides,
  };
}

function reviseClickBody() {
  return approveClickBody({
    actions: [{ action_id: REVISE_ACTION_ID, value: "recXYZ" }],
  });
}

describe("makeApproveHandler", () => {
  let airtable: ReturnType<typeof makeAirtable>;
  let client: ReturnType<typeof makeClient>;
  const ack = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    airtable = makeAirtable();
    client = makeClient();
  });

  it("acks, runs approveDraft, updates the message and posts a thread reply", async () => {
    const handler = makeApproveHandler({ airtable, orgConfig });
    await handler({ ack, body: approveClickBody(), client });

    expect(ack).toHaveBeenCalledTimes(1);
    expect(airtable.copyDraftToFinal).toHaveBeenCalledWith("recXYZ");
    expect(airtable.updateStatus).toHaveBeenCalledWith("recXYZ", "Approved");

    expect(client.chat.update).toHaveBeenCalledTimes(1);
    const updateArgs = client.chat.update.mock.calls[0]?.[0] as {
      channel: string;
      ts: string;
      blocks: Array<{ type: string }>;
    };
    expect(updateArgs.channel).toBe("C1");
    expect(updateArgs.ts).toBe("1712345678.000100");
    expect(updateArgs.blocks.some((b) => b.type === "actions")).toBe(false);
    expect(JSON.stringify(updateArgs.blocks)).toContain("Approved by <@U100>");

    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);
    const reply = client.chat.postMessage.mock.calls[0]?.[0] as { thread_ts: string };
    expect(reply.thread_ts).toBe("1712345678.000100");
  });

  it("sends an ephemeral error when approveDraft fails and does not chat.update", async () => {
    airtable.copyDraftToFinal.mockRejectedValueOnce(new Error("airtable down"));
    const handler = makeApproveHandler({ airtable, orgConfig });
    await handler({ ack, body: approveClickBody(), client });

    expect(client.chat.postEphemeral).toHaveBeenCalledTimes(1);
    const ephemeral = client.chat.postEphemeral.mock.calls[0]?.[0] as {
      user: string;
      channel: string;
    };
    expect(ephemeral.user).toBe("U100");
    expect(ephemeral.channel).toBe("C1");
    expect(client.chat.update).not.toHaveBeenCalled();
  });
});

describe("makeReviseClickHandler", () => {
  let client: ReturnType<typeof makeClient>;
  const ack = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
  });

  it("opens a modal with recordId + channel + ts stuffed into private_metadata", async () => {
    const handler = makeReviseClickHandler();
    await handler({ ack, body: reviseClickBody(), client });

    expect(ack).toHaveBeenCalledTimes(1);
    expect(client.views.open).toHaveBeenCalledTimes(1);
    const view = (client.views.open.mock.calls[0]?.[0] as { view: Record<string, unknown> }).view;
    expect(view["callback_id"]).toBe(REVISE_MODAL_CALLBACK_ID);

    const meta = JSON.parse(view["private_metadata"] as string) as {
      recordId: string;
      channel: string;
      ts: string;
      imageUrl: string;
      eventTitle: string;
    };
    expect(meta.recordId).toBe("recXYZ");
    expect(meta.channel).toBe("C1");
    expect(meta.ts).toBe("1712345678.000100");
    expect(meta.imageUrl).toBe("https://cdn.example/x.png");
    expect(meta.eventTitle).toBe("Pitch Night");

    const blocks = view["blocks"] as Array<Record<string, unknown>>;
    const input = blocks.find((b) => b["block_id"] === REVISE_NOTES_BLOCK_ID);
    expect(input).toBeDefined();
    const element = input?.["element"] as Record<string, unknown>;
    expect(element["type"]).toBe("plain_text_input");
    expect(element["multiline"]).toBe(true);
    expect(element["max_length"]).toBe(2000);
    expect(element["action_id"]).toBe(REVISE_NOTES_ACTION_ID);
  });
});

describe("makeReviseSubmitHandler", () => {
  let airtable: ReturnType<typeof makeAirtable>;
  let client: ReturnType<typeof makeClient>;
  const ack = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  function submitPayload(opts: {
    recordId: string;
    notes: string;
    userId?: string;
    userName?: string;
    imageUrl?: string;
    eventTitle?: string;
  }) {
    const meta = {
      recordId: opts.recordId,
      channel: "C1",
      ts: "1712345678.000100",
      imageUrl: opts.imageUrl ?? "https://cdn.example/x.png",
      eventTitle: opts.eventTitle ?? "Pitch Night",
    };
    return {
      body: {
        user: { id: opts.userId ?? "U200", name: opts.userName ?? "alice" },
      },
      view: {
        private_metadata: JSON.stringify(meta),
        state: {
          values: {
            [REVISE_NOTES_BLOCK_ID]: {
              [REVISE_NOTES_ACTION_ID]: { value: opts.notes },
            },
          },
        },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    airtable = makeAirtable();
    client = makeClient();
  });

  it("appends notes, increments count, sets In Revision, and disables the clicked message", async () => {
    airtable.getRevisionCount.mockResolvedValueOnce(1);
    const handler = makeReviseSubmitHandler({ airtable, orgConfig });
    const { body, view } = submitPayload({
      recordId: "recXYZ",
      notes: "Make the headline smaller.",
    });

    await handler({ ack, body, view, client });

    expect(ack).toHaveBeenCalledTimes(1);
    expect(airtable.appendRevisionNotes).toHaveBeenCalledTimes(1);
    const note = airtable.appendRevisionNotes.mock.calls[0]?.[1] as string;
    expect(note).toContain("alice");
    expect(note).toContain("Make the headline smaller.");

    expect(airtable.incrementRevisionCount).toHaveBeenCalledWith("recXYZ");
    expect(airtable.updateStatus).toHaveBeenCalledWith("recXYZ", "In Revision");

    expect(client.chat.update).toHaveBeenCalledTimes(1);
    const updateArgs = client.chat.update.mock.calls[0]?.[0] as {
      channel: string;
      ts: string;
      blocks: Array<{ type: string }>;
    };
    expect(updateArgs.channel).toBe("C1");
    expect(updateArgs.ts).toBe("1712345678.000100");
    expect(updateArgs.blocks.some((b) => b.type === "actions")).toBe(false);
    expect(JSON.stringify(updateArgs.blocks)).toContain("Revision requested");
    expect(JSON.stringify(updateArgs.blocks)).toContain("<@U200>");

    expect(client.chat.postEphemeral).not.toHaveBeenCalled();
  });

  it("sends an ephemeral limit message and writes nothing when at the limit", async () => {
    airtable.getRevisionCount.mockResolvedValueOnce(orgConfig.maxRevisions);
    const handler = makeReviseSubmitHandler({ airtable, orgConfig });
    const { body, view } = submitPayload({
      recordId: "recXYZ",
      notes: "one more please",
    });

    await handler({ ack, body, view, client });

    expect(airtable.appendRevisionNotes).not.toHaveBeenCalled();
    expect(airtable.incrementRevisionCount).not.toHaveBeenCalled();
    expect(airtable.updateStatus).not.toHaveBeenCalled();

    expect(client.chat.postEphemeral).toHaveBeenCalledTimes(1);
    const ephemeral = client.chat.postEphemeral.mock.calls[0]?.[0] as {
      channel: string;
      user: string;
      text: string;
    };
    expect(ephemeral.channel).toBe("C1");
    expect(ephemeral.user).toBe("U200");
    expect(ephemeral.text).toContain(String(orgConfig.maxRevisions));
    expect(ephemeral.text.toLowerCase()).toContain("limit");
    expect(client.chat.update).not.toHaveBeenCalled();
  });

  it("sends a generic ephemeral when a non-limit error is thrown and does not update the message", async () => {
    airtable.appendRevisionNotes.mockRejectedValueOnce(new Error("airtable boom"));
    airtable.getRevisionCount.mockResolvedValueOnce(0);
    const handler = makeReviseSubmitHandler({ airtable, orgConfig });
    const { body, view } = submitPayload({ recordId: "recXYZ", notes: "x" });

    await handler({ ack, body, view, client });

    expect(client.chat.postEphemeral).toHaveBeenCalledTimes(1);
    expect(client.chat.update).not.toHaveBeenCalled();
    expect(airtable.updateStatus).not.toHaveBeenCalled();
  });
});
