import { describe, expect, it } from "vitest";
import { buildFlyerOutputSchema } from "../../src/schemas/flyer.js";
import type { OrgConfig } from "../../src/schemas/orgConfig.js";

const fakeOrgConfig: OrgConfig = {
  orgName: "Test Org",
  orgDescription: "A test org for unit tests.",
  brandVoice: {
    tone: "friendly",
    do: ["be clear"],
    dont: ["use emoji"],
    taglines: ["Ship it."],
  },
  airtable: {
    tableName: "Flyer Requests",
    fields: {
      eventTitle: "Event Title",
      eventDate: "Event Date",
      eventTime: "Event Time",
      location: "Location",
      description: "Description",
      templateHint: "Template Hint",
      status: "Status",
      draftImageUrl: "Draft Image URL",
      finalImageUrl: "Final Image URL",
      revisionNotes: "Revision Notes",
      audience: "Audience",
      requesterEmail: "Requester Email",
      generatedJson: "Generated JSON",
      revisionCount: "Revision Count",
    },
  },
  templates: [
    {
      id: "tpl_poster",
      name: "Poster",
      description: "Default poster",
      fields: [
        { name: "headline", type: "text", description: "Title", maxChars: 10 },
        { name: "bg", type: "image", description: "Background" },
      ],
    },
  ],
  slack: { draftChannelId: "C123" },
  timezone: "Pacific/Honolulu",
  maxRevisions: 5,
};

describe("buildFlyerOutputSchema", () => {
  it("accepts a valid flyer output", () => {
    const schema = buildFlyerOutputSchema(fakeOrgConfig);
    const parsed = schema.parse({
      templateId: "tpl_poster",
      fields: { headline: "Pitch!", bg: "https://example.com/bg.png" },
    });
    expect(parsed.templateId).toBe("tpl_poster");
  });

  it("rejects unknown templateId", () => {
    const schema = buildFlyerOutputSchema(fakeOrgConfig);
    expect(() =>
      schema.parse({
        templateId: "tpl_unknown",
        fields: { headline: "x", bg: "https://example.com/bg.png" },
      }),
    ).toThrow();
  });

  it("rejects text fields over maxChars", () => {
    const schema = buildFlyerOutputSchema(fakeOrgConfig);
    expect(() =>
      schema.parse({
        templateId: "tpl_poster",
        fields: {
          headline: "way too long for the limit",
          bg: "https://example.com/bg.png",
        },
      }),
    ).toThrow();
  });

  it("rejects image fields that aren't URLs", () => {
    const schema = buildFlyerOutputSchema(fakeOrgConfig);
    expect(() =>
      schema.parse({
        templateId: "tpl_poster",
        fields: { headline: "ok", bg: "not-a-url" },
      }),
    ).toThrow();
  });
});
