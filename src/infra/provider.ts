import { Message, ContentBlock } from '../core/types';
import { Configurable } from '../core/config';

export interface ModelResponse {
  role: 'assistant';
  content: ContentBlock[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string;
}

export interface ModelStreamChunk {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

export interface ModelConfig {
  provider: 'anthropic' | string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelProvider extends Configurable<ModelConfig> {
  readonly model: string;
  readonly maxWindowSize: number;
  readonly maxOutputTokens: number;
  readonly temperature: number;

  complete(
    messages: Message[],
    opts?: {
      tools?: any[];
      maxTokens?: number;
      temperature?: number;
      system?: string;
      stream?: boolean;
    }
  ): Promise<ModelResponse>;

  stream(
    messages: Message[],
    opts?: {
      tools?: any[];
      maxTokens?: number;
      temperature?: number;
      system?: string;
    }
  ): AsyncIterable<ModelStreamChunk>;

}

export class AnthropicProvider implements ModelProvider {
  readonly maxWindowSize = 200_000;
  readonly maxOutputTokens = 4096;
  readonly temperature = 0.7;
  readonly model: string;

  constructor(
    private apiKey: string,
    model: string = 'claude-3-5-sonnet-20241022',
    private baseUrl: string = 'https://api.anthropic.com'
  ) {
    this.model = model;
  }

  async complete(
    messages: Message[],
    opts?: {
      tools?: any[];
      maxTokens?: number;
      temperature?: number;
      system?: string;
      stream?: boolean;
    }
  ): Promise<ModelResponse> {
    const body: any = {
      model: this.model,
      messages: this.formatMessages(messages),
      max_tokens: opts?.maxTokens || 4096,
    };

    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.system) body.system = opts.system;
    if (opts?.tools && opts.tools.length > 0) body.tools = opts.tools;

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data: any = await response.json();
    return {
      role: 'assistant',
      content: data.content,
      usage: data.usage,
      stop_reason: data.stop_reason,
    };
  }

  async *stream(
    messages: Message[],
    opts?: {
      tools?: any[];
      maxTokens?: number;
      temperature?: number;
      system?: string;
    }
  ): AsyncIterable<ModelStreamChunk> {
    const body: any = {
      model: this.model,
      messages: this.formatMessages(messages),
      max_tokens: opts?.maxTokens || 4096,
      stream: true,
    };

    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.system) body.system = opts.system;
    if (opts?.tools && opts.tools.length > 0) body.tools = opts.tools;

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_start') {
            yield { type: 'content_block_start', index: event.index, content_block: event.content_block };
          } else if (event.type === 'content_block_delta') {
            yield { type: 'content_block_delta', index: event.index, delta: event.delta };
          } else if (event.type === 'content_block_stop') {
            yield { type: 'content_block_stop', index: event.index };
          } else if (event.type === 'message_delta') {
            yield { type: 'message_delta', delta: event.delta, usage: event.usage };
          } else if (event.type === 'message_stop') {
            yield { type: 'message_stop' };
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  private formatMessages(messages: Message[]): any[] {
    return messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content,
    }));
  }

  toConfig(): ModelConfig {
    return {
      provider: 'anthropic',
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      maxTokens: this.maxOutputTokens,
      temperature: this.temperature,
    };
  }
}
