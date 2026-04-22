import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { airtableWebhookRouter } from "../../src/webhooks/airtable.js";

const SECRET = "test-secret-abc123";

const onSubmission = vi.fn<(recordId: string) => Promise<void>>();

let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(airtableWebhookRouter({ secret: SECRET, onSubmission }));

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address() as AddressInfo;
  url = `http://127.0.0.1:${address.port}/webhooks/airtable`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  onSubmission.mockReset();
  onSubmission.mockResolvedValue(undefined);
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe("POST /webhooks/airtable", () => {
  it("returns 401 when the secret header is missing", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordId: "recABC" }),
    });
    expect(res.status).toBe(401);
    expect(onSubmission).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret header is wrong", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flyer-bot-secret": "nope",
      },
      body: JSON.stringify({ recordId: "recABC" }),
    });
    expect(res.status).toBe(401);
    expect(onSubmission).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is missing recordId", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flyer-bot-secret": SECRET,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(onSubmission).not.toHaveBeenCalled();
  });

  it("returns 400 when the body has unexpected extra keys", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flyer-bot-secret": SECRET,
      },
      body: JSON.stringify({ recordId: "recABC", extra: "nope" }),
    });
    expect(res.status).toBe(400);
    expect(onSubmission).not.toHaveBeenCalled();
  });

  it("returns 202 and invokes onSubmission exactly once on valid input", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flyer-bot-secret": SECRET,
      },
      body: JSON.stringify({ recordId: "recABC" }),
    });
    expect(res.status).toBe(202);
    const json = (await res.json()) as { accepted: boolean; recordId: string };
    expect(json).toEqual({ accepted: true, recordId: "recABC" });

    await flushMicrotasks();
    expect(onSubmission).toHaveBeenCalledTimes(1);
    expect(onSubmission).toHaveBeenCalledWith("recABC");
  });

  it("still returns 202 when onSubmission rejects (errors are swallowed into logs)", async () => {
    onSubmission.mockRejectedValueOnce(new Error("boom"));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flyer-bot-secret": SECRET,
      },
      body: JSON.stringify({ recordId: "recXYZ" }),
    });
    expect(res.status).toBe(202);
    await flushMicrotasks();
    expect(onSubmission).toHaveBeenCalledWith("recXYZ");
  });
});
