import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveDraft } from "../../src/handlers/approve.js";

describe("approveDraft", () => {
  const airtable = {
    copyDraftToFinal: vi.fn<(id: string) => Promise<void>>(),
    updateStatus: vi.fn<(id: string, status: string) => Promise<void>>(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    airtable.copyDraftToFinal.mockResolvedValue(undefined);
    airtable.updateStatus.mockResolvedValue(undefined);
  });

  it("copies Draft Flyer → Final Flyer and sets Status to Approved", async () => {
    await approveDraft("recTEST", { airtable });

    expect(airtable.copyDraftToFinal).toHaveBeenCalledWith("recTEST");
    expect(airtable.updateStatus).toHaveBeenCalledWith("recTEST", "Approved");
  });

  it("propagates Airtable errors so the caller can surface an ephemeral", async () => {
    airtable.copyDraftToFinal.mockRejectedValueOnce(new Error("airtable down"));
    await expect(approveDraft("recTEST", { airtable })).rejects.toThrow("airtable down");
    expect(airtable.updateStatus).not.toHaveBeenCalled();
  });
});
