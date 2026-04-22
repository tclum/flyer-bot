import Anthropic from "@anthropic-ai/sdk";

export interface GenerateJsonParams {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export class AnthropicClient {
  private readonly sdk: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.sdk = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateJson(params: GenerateJsonParams): Promise<string> {
    const res = await this.sdk.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 2048,
      system: params.systemPrompt,
      messages: [{ role: "user", content: params.userPrompt }],
    });

    const firstBlock = res.content[0];
    if (!firstBlock || firstBlock.type !== "text") {
      throw new Error("anthropic response had no text block");
    }
    return firstBlock.text;
  }
}
