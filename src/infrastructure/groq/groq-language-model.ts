import Groq from "groq-sdk";
import type { ChatMessage, LanguageModel } from "../../application/ports/language-model.js";

export interface GroqLanguageModelOptions {
  readonly model: string;
  readonly maxCompletionTokens: number;
  readonly temperature: number;
  /** Only for reasoning models (gpt-oss, qwen3); keeps hidden thinking short so speech starts sooner. */
  readonly reasoningEffort: "low" | "medium" | "high" | undefined;
}

export class GroqLanguageModel implements LanguageModel {
  constructor(
    private readonly groq: Groq,
    private readonly options: GroqLanguageModelOptions,
  ) {}

  async *streamChat(messages: readonly ChatMessage[], signal: AbortSignal): AsyncIterable<string> {
    const stream = await this.groq.chat.completions.create(
      {
        model: this.options.model,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
        max_completion_tokens: this.options.maxCompletionTokens,
        temperature: this.options.temperature,
        ...(this.options.reasoningEffort
          ? { reasoning_effort: this.options.reasoningEffort, include_reasoning: false }
          : {}),
      },
      { signal },
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
