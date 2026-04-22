import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RevisionLimitExceeded,
  requestRevision,
} from "../../src/handlers/revise.js";
import type { OrgConfig } from "../../src/schemas/orgConfig.js";

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
  maxRevisions: 3,
};

describe("requestRevision", () => {
  const airtable = {
    getRevisionCount: vi.fn<(id: string) => Promise<number>>(),
    appendRevisionNotes: vi.fn<(id: string, note: string) => Promise<void>>(),
    incrementRevisionCount: vi.fn<(id: string) => Promise<void>>(),
    updateStatus: vi.fn<(id: string, status: string) => Promise<void>>(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    airtable.appendRevisionNotes.mockResolvedValue(undefined);
    airtable.incrementRevisionCount.mockResolvedValue(undefined);
    airtable.updateStatus.mockResolvedValue(undefined);
  });

  it("appends a timestamped note, increments count, sets In Revision", async () => {
    airtable.getRevisionCount.mockResolvedValueOnce(1);

    await requestRevision(
      {
        recordId: "recXYZ",
        notes: "Make the headline smaller.",
        userId: "U1",
        userName: "Alice",
      },
      { airtable, orgConfig },
    );

    expect(airtable.appendRevisionNotes).toHaveBeenCalledTimes(1);
    const note = airtable.appendRevisionNotes.mock.calls[0]?.[1] ?? "";
    expect(note).toContain("Alice");
    expect(note).toContain("U1");
    expect(note).toContain("Make the headline smaller.");
    expect(note).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);

    expect(airtable.incrementRevisionCount).toHaveBeenCalledWith("recXYZ");
    expect(airtable.updateStatus).toHaveBeenCalledWith("recXYZ", "In Revision");
  });

  it("throws RevisionLimitExceeded without mutating state when at the limit", async () => {
    airtable.getRevisionCount.mockResolvedValueOnce(3);

    await expect(
      requestRevision(
        { recordId: "recXYZ", notes: "too late", userId: "U1", userName: "Alice" },
        { airtable, orgConfig },
      ),
    ).rejects.toBeInstanceOf(RevisionLimitExceeded);

    expect(airtable.appendRevisionNotes).not.toHaveBeenCalled();
    expect(airtable.incrementRevisionCount).not.toHaveBeenCalled();
    expect(airtable.updateStatus).not.toHaveBeenCalled();
  });
});
