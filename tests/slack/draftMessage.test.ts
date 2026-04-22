import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDraftMessage,
  buildStatusFooterBlock,
  buildSupersededMessage,
  type Block,
} from "../../src/slack/draftMessage.js";

const fixtureRaw = readFileSync(
  resolve(__dirname, "../fixtures/pitch-night-output.json"),
  "utf8",
);
const fixture = JSON.parse(fixtureRaw) as {
  templateId: string;
  fields: Record<string, string>;
  rationale: string;
};

const IMAGE_URL = "https://cdn.bannerbear.example/renders/abc.png";
const RECORD_ID = "recTEST01234567";

function byType(blocks: Block[], type: string): Block | undefined {
  return blocks.find((b) => b["type"] === type);
}

function actionsBlock(blocks: Block[]): Block | undefined {
  return byType(blocks, "actions");
}

describe("buildDraftMessage", () => {
  it("builds the first-draft message with both buttons and Record-ID values", () => {
    const dateLine = fixture.fields["date_line"] ?? "";
    const locationLine = fixture.fields["location_line"] ?? "";
    const msg = buildDraftMessage({
      recordId: RECORD_ID,
      eventTitle: "PACE Pitch Night — Spring Finals",
      imageUrl: IMAGE_URL,
      revisionNumber: 0,
      rationale: fixture.rationale,
      dateLine,
      locationLine,
    });

    expect(msg.text).toContain("Draft flyer for:");
    expect(msg.text).toContain("PACE Pitch Night");

    const header = byType(msg.blocks, "header") as
      | { text?: { text?: string } }
      | undefined;
    expect(header?.text?.text).toContain("PACE Pitch Night");

    const image = byType(msg.blocks, "image") as { image_url?: string } | undefined;
    expect(image?.image_url).toBe(IMAGE_URL);

    const readyContext = msg.blocks.find(
      (b) =>
        b["type"] === "context" &&
        JSON.stringify(b["elements"]).includes("Draft — ready for review"),
    );
    expect(readyContext).toBeDefined();

    const actions = actionsBlock(msg.blocks) as
      | { elements?: Array<{ action_id?: string; value?: string; style?: string; text?: { text?: string } }> }
      | undefined;
    expect(actions?.elements?.length).toBe(2);
    const approve = actions?.elements?.find((e) => e.action_id === "flyer_approve");
    const revise = actions?.elements?.find((e) => e.action_id === "flyer_revise");
    expect(approve?.value).toBe(RECORD_ID);
    expect(approve?.style).toBe("primary");
    expect(revise?.value).toBe(RECORD_ID);
    expect(revise?.style).toBeUndefined();
  });

  it("builds a revision-reply message with revision number in header context", () => {
    const msg = buildDraftMessage({
      recordId: RECORD_ID,
      eventTitle: "PACE Pitch Night — Spring Finals",
      imageUrl: IMAGE_URL,
      revisionNumber: 2,
      rationale: "Shortened headline; kept date/location.",
    });

    expect(msg.text).toContain("Revision 2 for:");

    const readyContext = msg.blocks.find(
      (b) =>
        b["type"] === "context" &&
        JSON.stringify(b["elements"]).includes("Revision 2 — ready for review"),
    );
    expect(readyContext).toBeDefined();

    const actions = actionsBlock(msg.blocks) as
      | { elements?: Array<{ action_id?: string; value?: string }> }
      | undefined;
    expect(actions?.elements?.map((e) => e.action_id)).toEqual([
      "flyer_approve",
      "flyer_revise",
    ]);
    expect(actions?.elements?.[0]?.value).toBe(RECORD_ID);
  });

  it("truncates very long event titles for the Slack header limit", () => {
    const longTitle = "A".repeat(300);
    const msg = buildDraftMessage({
      recordId: RECORD_ID,
      eventTitle: longTitle,
      imageUrl: IMAGE_URL,
      revisionNumber: 0,
    });
    const header = byType(msg.blocks, "header") as
      | { text?: { text?: string } }
      | undefined;
    expect((header?.text?.text ?? "").length).toBeLessThanOrEqual(150);
  });
});

describe("buildSupersededMessage", () => {
  it("drops actions and references the superseding revision", () => {
    const msg = buildSupersededMessage({
      eventTitle: "PACE Pitch Night",
      supersededByRevision: 3,
    });
    expect(msg.text).toContain("revision 3");
    expect(actionsBlock(msg.blocks)).toBeUndefined();
    expect(JSON.stringify(msg.blocks)).toContain("Superseded by revision 3");
  });
});

describe("buildStatusFooterBlock", () => {
  it("renders an approved footer with the user mention", () => {
    const footer = buildStatusFooterBlock({
      kind: "approved",
      userId: "U123",
      at: new Date("2026-05-01T10:00:00Z"),
    });
    expect(footer["type"]).toBe("context");
    expect(JSON.stringify(footer)).toContain("<@U123>");
    expect(JSON.stringify(footer)).toContain("Approved");
  });

  it("renders a revision-requested footer", () => {
    const footer = buildStatusFooterBlock({
      kind: "revision_requested",
      userId: "U456",
      at: new Date("2026-05-01T10:00:00Z"),
    });
    expect(JSON.stringify(footer)).toContain("Revision requested");
    expect(JSON.stringify(footer)).toContain("<@U456>");
  });
});
