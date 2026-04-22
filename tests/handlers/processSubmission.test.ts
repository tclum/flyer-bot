import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRecord, Submission } from "../../src/clients/airtable.js";
import {
  processSubmission,
  type AirtablePort,
  type AnthropicPort,
  type BannerbearPort,
  type ProcessDeps,
} from "../../src/handlers/processSubmission.js";
import type { OrgConfig } from "../../src/schemas/orgConfig.js";

const orgConfig: OrgConfig = {
  orgName: "Test Org",
  orgDescription: "Testing only.",
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
      id: "tpl_poster",
      name: "Poster",
      description: "Default poster",
      fields: [
        { name: "headline", type: "text", description: "Title", maxChars: 48 },
        { name: "body", type: "text", description: "Body", maxChars: 180 },
      ],
    },
  ],
  slack: { draftChannelId: "C123" },
  timezone: "Pacific/Honolulu",
};

const goodSubmission: Submission = {
  recordId: "recTEST",
  eventTitle: "Pitch Night",
  eventDate: "2026-05-03",
  eventTime: "6pm",
  location: "Shidler BusAd C-201",
  description: "Ten teams pitch.",
  audience: "UH students",
  requesterEmail: "pace@hawaii.edu",
};

const goodLlmJson = JSON.stringify({
  templateId: "tpl_poster",
  fields: { headline: "Pitch Night", body: "Ten teams pitch before local founders." },
  rationale: "Default poster for a pitch night announcement.",
});

function makeRecord(status: string): RawRecord {
  return { id: "recTEST", fields: { Status: status } };
}

function makeDeps(overrides: {
  record?: RawRecord;
  submission?: Submission;
  llmResponses?: string[];
  renderMock?: ReturnType<typeof vi.fn>;
}): {
  deps: ProcessDeps;
  airtable: {
    getRecord: ReturnType<typeof vi.fn>;
    recordToSubmission: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    attachImage: ReturnType<typeof vi.fn>;
    saveGeneratedJson: ReturnType<typeof vi.fn>;
    appendRevisionNotes: ReturnType<typeof vi.fn>;
  };
  anthropic: { generateJson: ReturnType<typeof vi.fn> };
  bannerbear: { render: ReturnType<typeof vi.fn> };
} {
  const record = overrides.record ?? makeRecord("Submitted");
  const submission = overrides.submission ?? goodSubmission;
  const responses = overrides.llmResponses ?? [goodLlmJson];

  const generateJson = vi.fn(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error("no more mocked LLM responses");
    return next;
  });

  const render =
    overrides.renderMock ??
    vi.fn(async () => ({
      image_url: "https://bannerbear.example/final.png",
    }));

  const airtable = {
    getRecord: vi.fn(async () => record),
    recordToSubmission: vi.fn(() => submission),
    updateStatus: vi.fn(async () => undefined),
    attachImage: vi.fn(async () => undefined),
    saveGeneratedJson: vi.fn(async () => undefined),
    appendRevisionNotes: vi.fn(async () => undefined),
  };

  const anthropic = { generateJson };
  const bannerbear = { render };

  const deps: ProcessDeps = {
    airtable: airtable as unknown as AirtablePort,
    anthropic: anthropic as unknown as AnthropicPort,
    bannerbear: bannerbear as unknown as BannerbearPort,
    orgConfig,
  };

  return { deps, airtable, anthropic, bannerbear };
}

describe("processSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: runs the pipeline in the right order with the right args", async () => {
    const { deps, airtable, anthropic, bannerbear } = makeDeps({});

    await processSubmission("recTEST", deps);

    expect(airtable.getRecord).toHaveBeenCalledWith("recTEST");
    expect(airtable.updateStatus).toHaveBeenNthCalledWith(1, "recTEST", "Generating");
    expect(anthropic.generateJson).toHaveBeenCalledTimes(1);
    expect(bannerbear.render).toHaveBeenCalledTimes(1);
    expect(airtable.saveGeneratedJson).toHaveBeenCalledWith("recTEST", {
      templateId: "tpl_poster",
      fields: { headline: "Pitch Night", body: "Ten teams pitch before local founders." },
      rationale: "Default poster for a pitch night announcement.",
    });
    expect(airtable.attachImage).toHaveBeenCalledWith(
      "recTEST",
      "draftImageUrl",
      "https://bannerbear.example/final.png",
    );
    expect(airtable.updateStatus).toHaveBeenNthCalledWith(2, "recTEST", "Draft Ready");
    expect(airtable.appendRevisionNotes).not.toHaveBeenCalled();
  });

  it("is a no-op when status is already Generating", async () => {
    const { deps, airtable, anthropic, bannerbear } = makeDeps({
      record: makeRecord("Generating"),
    });

    await processSubmission("recTEST", deps);

    expect(airtable.updateStatus).not.toHaveBeenCalled();
    expect(anthropic.generateJson).not.toHaveBeenCalled();
    expect(bannerbear.render).not.toHaveBeenCalled();
    expect(airtable.saveGeneratedJson).not.toHaveBeenCalled();
    expect(airtable.attachImage).not.toHaveBeenCalled();
    expect(airtable.appendRevisionNotes).not.toHaveBeenCalled();
  });

  it("is a no-op when status is Draft Ready", async () => {
    const { deps, airtable, anthropic } = makeDeps({
      record: makeRecord("Draft Ready"),
    });

    await processSubmission("recTEST", deps);

    expect(anthropic.generateJson).not.toHaveBeenCalled();
    expect(airtable.updateStatus).not.toHaveBeenCalled();
  });

  it("proceeds when status is In Revision", async () => {
    const { deps, airtable, anthropic } = makeDeps({
      record: makeRecord("In Revision"),
    });

    await processSubmission("recTEST", deps);

    expect(anthropic.generateJson).toHaveBeenCalledTimes(1);
    expect(airtable.updateStatus).toHaveBeenNthCalledWith(2, "recTEST", "Draft Ready");
  });

  it("retries once when the first LLM response fails Zod validation", async () => {
    const bad = JSON.stringify({
      templateId: "tpl_poster",
      fields: { headline: "ok", body: "missing body? no wait — extra field" , extra: "x" },
    });
    const { deps, airtable, anthropic, bannerbear } = makeDeps({
      llmResponses: [bad, goodLlmJson],
    });

    await processSubmission("recTEST", deps);

    expect(anthropic.generateJson).toHaveBeenCalledTimes(2);
    const secondCallArgs = anthropic.generateJson.mock.calls[1]?.[0] as { userPrompt: string };
    expect(secondCallArgs.userPrompt).toContain("failed validation");
    expect(bannerbear.render).toHaveBeenCalledTimes(1);
    expect(airtable.updateStatus).toHaveBeenNthCalledWith(2, "recTEST", "Draft Ready");
  });

  it("marks Error when both LLM attempts fail validation", async () => {
    const bad = JSON.stringify({ templateId: "tpl_poster", fields: {} });
    const { deps, airtable, bannerbear } = makeDeps({
      llmResponses: [bad, bad],
    });

    await processSubmission("recTEST", deps);

    expect(bannerbear.render).not.toHaveBeenCalled();
    expect(airtable.saveGeneratedJson).not.toHaveBeenCalled();
    expect(airtable.attachImage).not.toHaveBeenCalled();
    expect(airtable.updateStatus).toHaveBeenNthCalledWith(2, "recTEST", "Error");
    expect(airtable.appendRevisionNotes).toHaveBeenCalledTimes(1);
    const noteArg = airtable.appendRevisionNotes.mock.calls[0]?.[1] as string;
    expect(noteArg).toContain("pipeline failed");
  });

  it("marks Error when Bannerbear throws, leaves JSON unsaved", async () => {
    const render = vi.fn(async () => {
      throw new Error("bannerbear 422");
    });
    const { deps, airtable } = makeDeps({ renderMock: render });

    await processSubmission("recTEST", deps);

    expect(render).toHaveBeenCalledTimes(1);
    expect(airtable.saveGeneratedJson).not.toHaveBeenCalled();
    expect(airtable.attachImage).not.toHaveBeenCalled();
    expect(airtable.updateStatus).toHaveBeenNthCalledWith(2, "recTEST", "Error");
    expect(airtable.appendRevisionNotes).toHaveBeenCalledTimes(1);
    const noteArg = airtable.appendRevisionNotes.mock.calls[0]?.[1] as string;
    expect(noteArg).toContain("bannerbear 422");
  });
});
