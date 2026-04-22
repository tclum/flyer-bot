import { webApi } from "@slack/bolt";

type Block = Record<string, unknown>;

export interface PostMessageParams {
  channel: string;
  text: string;
  blocks?: Block[];
}

export class SlackClient {
  private readonly web: webApi.WebClient;

  constructor(botToken: string) {
    this.web = new webApi.WebClient(botToken);
  }

  async postMessage(
    params: PostMessageParams,
  ): Promise<{ ts: string; channel: string }> {
    const res = await this.web.chat.postMessage({
      channel: params.channel,
      text: params.text,
      ...(params.blocks ? { blocks: params.blocks } : {}),
    });
    if (!res.ok || !res.ts || !res.channel) {
      throw new Error(`slack postMessage failed: ${res.error ?? "unknown"}`);
    }
    return { ts: res.ts, channel: res.channel };
  }

  async updateMessage(
    params: PostMessageParams & { ts: string },
  ): Promise<void> {
    const res = await this.web.chat.update({
      channel: params.channel,
      ts: params.ts,
      text: params.text,
      ...(params.blocks ? { blocks: params.blocks } : {}),
    });
    if (!res.ok) {
      throw new Error(`slack update failed: ${res.error ?? "unknown"}`);
    }
  }
}
