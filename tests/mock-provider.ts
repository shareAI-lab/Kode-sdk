import { ModelProvider, ModelResponse, ModelStreamChunk, ModelConfig } from '../src/infra/provider';
import { Message } from '../src/core/types';

interface MockScript {
  text: string;
}

export class MockProvider implements ModelProvider {
  readonly model = 'mock-model';
  readonly maxWindowSize = 200_000;
  readonly maxOutputTokens = 4096;
  readonly temperature = 0.1;

  constructor(private readonly script: MockScript[] = [{ text: 'mock-response' }]) {}

  async complete(messages: Message[]): Promise<ModelResponse> {
    return {
      role: 'assistant',
      content: [{ type: 'text', text: this.script[0]?.text ?? 'mock-response' }],
    };
  }

  async *stream(messages: Message[]): AsyncIterable<ModelStreamChunk> {
    for (const step of this.script) {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      };
      yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: step.text } };
      yield { type: 'content_block_stop', index: 0 };
    }
    yield { type: 'message_stop' };
  }

  toConfig(): ModelConfig {
    return { provider: 'mock', model: this.model };
  }
}
