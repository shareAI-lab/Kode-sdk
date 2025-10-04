import {
  Message,
  ContentBlock,
  AgentState,
  AgentStatus,
  AgentInfo,
  AgentEvent,
  AgentEventKind,
  SubscribeOptions,
  ToolCall,
  ToolOutcome,
  ToolContext,
  SnapshotId,
  Snapshot,
} from './types';
import { EventBus } from './events';
import { HookManager, Hooks } from './hooks';
import { Scheduler } from './scheduler';
import { Provider } from '../infra/provider';
import { Store } from '../infra/store';
import { Sandbox } from '../infra/sandbox';
import { Tool } from '../tools/fs';
import { AgentTemplate } from '../tools/task';

export interface AgentOptions {
  sessionId: string;
  provider: Provider;
  store: Store;
  sandbox: Sandbox;
  tools?: Tool[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  maxConcurrency?: number;
  templateId?: string;
}

export class Agent {
  private sessionId: string;
  private provider: Provider;
  private store: Store;
  private sandbox: Sandbox;
  private tools: Map<string, Tool> = new Map();
  private system?: string;
  private maxTokens: number;
  private temperature: number;
  private maxConcurrency: number;
  private templateId: string;

  private messages: Message[] = [];
  private state: AgentState = 'READY';
  private lastSfpIndex = -1;
  private stepCount = 0;

  private events: EventBus = new EventBus();
  private hooks: HookManager = new HookManager();
  private scheduler?: Scheduler;

  private pendingPermissions = new Map<string, (decision: 'allow' | 'deny', note?: string) => void>();
  private interrupted = false;

  constructor(templateOrOpts: AgentTemplate | AgentOptions, overrides?: Partial<AgentOptions>) {
    let opts: AgentOptions;

    if ('sessionId' in templateOrOpts) {
      opts = templateOrOpts;
    } else {
      if (!overrides) throw new Error('overrides required when using template');
      opts = {
        sessionId: overrides.sessionId!,
        provider: overrides.provider!,
        store: overrides.store!,
        sandbox: overrides.sandbox!,
        tools: templateOrOpts.tools || [],
        system: templateOrOpts.system,
        templateId: templateOrOpts.id,
        ...overrides,
      };
    }

    this.sessionId = opts.sessionId;
    this.provider = opts.provider;
    this.store = opts.store;
    this.sandbox = opts.sandbox;
    this.system = opts.system;
    this.maxTokens = opts.maxTokens || 4096;
    this.temperature = opts.temperature ?? 0.7;
    this.maxConcurrency = opts.maxConcurrency || 3;
    this.templateId = opts.templateId || 'default';

    // Connect EventBus to Store for event persistence
    this.events.setStore(this.store, this.sessionId);

    if (opts.tools) {
      for (const tool of opts.tools) {
        this.tools.set(tool.name, tool);
        if (tool.hooks) {
          this.hooks.register(tool.hooks);
        }
      }
    }
  }

  async send(text: string): Promise<string> {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text }],
    });

    this.stepCount++;
    await this.persistMessages();
    this.events.emitEvent({
      type: 'messages_update',
      messageCount: this.messages.length,
      lastSfpIndex: this.lastSfpIndex,
      added: 1,
    });

    // Start processing in background (non-blocking)
    this.step().catch((err) => {
      this.events.emitEvent({
        type: 'error',
        kind: 'ProviderError',
        message: err.message,
        hint: err.stack,
      });
    });

    return messageId;
  }

  subscribe(opts?: SubscribeOptions): AsyncIterable<AgentEvent> {
    return this.events.subscribe(opts);
  }

  async *chat(text: string): AsyncIterable<AgentEvent> {
    const since = this.events.getCursor();
    await this.send(text);

    for await (const event of this.subscribe({ since })) {
      yield event;
      if (event.type === 'state' && event.state === 'READY') break;
    }
  }

  async reply(text: string): Promise<string> {
    let fullText = '';
    for await (const event of this.chat(text)) {
      if (event.type === 'text') {
        fullText = event.text;
      }
    }
    return fullText;
  }

  async askLLM(
    text: string,
    opts?: { sessionId?: string; provider?: Provider; useTools?: boolean; system?: string }
  ): Promise<{ text: string; sessionId: string }> {
    const provider = opts?.provider || this.provider;
    const messages: Message[] = [{ role: 'user', content: [{ type: 'text', text }] }];

    const response = await provider.complete(messages, {
      tools: opts?.useTools ? this.getToolSchemas() : undefined,
      system: opts?.system || this.system,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    return {
      text: textBlock ? (textBlock as any).text : '',
      sessionId: opts?.sessionId || this.sessionId,
    };
  }

  async interrupt(opts?: { note?: string }): Promise<void> {
    this.interrupted = true;

    // Find pending tool_use blocks that haven't received results yet
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      const toolUses = lastMsg.content.filter(c => c.type === 'tool_use') as any[];

      if (toolUses.length > 0) {
        // Collect all existing tool_result IDs
        const resultIds = new Set<string>();
        for (const msg of this.messages) {
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              resultIds.add((block as any).tool_use_id);
            }
          }
        }

        // Generate cancelled results for pending tools
        const cancelledResults: ContentBlock[] = [];
        for (const tu of toolUses) {
          if (!resultIds.has(tu.id)) {
            cancelledResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: { error: opts?.note || 'Interrupted by user' },
              is_error: true,
            });

            this.events.emitEvent({
              type: 'tool_result',
              id: tu.id,
              name: tu.name,
              ok: false,
              content: { error: opts?.note || 'Interrupted by user' },
            });
          }
        }

        // Add cancelled results to message history
        if (cancelledResults.length > 0) {
          this.messages.push({
            role: 'user',
            content: cancelledResults,
          });

          this.stepCount++;
          this.lastSfpIndex = this.messages.length - 1;

          await this.persistMessages();

          this.events.emitEvent({
            type: 'messages_update',
            messageCount: this.messages.length,
            lastSfpIndex: this.lastSfpIndex,
            added: 1,
          });

          this.events.emitEvent({
            type: 'commit',
            sfpIndex: this.lastSfpIndex,
          });
        }
      }
    }

    this.state = 'READY';
    this.events.emitEvent({ type: 'state', state: 'READY' });

    // Note is only for events/audit, not written to message stream
    if (opts?.note) {
      this.events.emitEvent({
        type: 'error',
        kind: 'PolicyViolation',
        message: `Interrupted: ${opts.note}`,
      });
    }
  }

  async decide(permId: string, decision: 'allow' | 'deny', note?: string): Promise<void> {
    const resolver = this.pendingPermissions.get(permId);
    if (!resolver) {
      throw new Error(`Permission not found: ${permId}`);
    }

    resolver(decision, note);
    this.pendingPermissions.delete(permId);

    this.events.emitEvent({ type: 'permission_decision', id: permId, decision, by: 'api' });

    if (decision === 'allow') {
      this.state = 'BUSY';
      this.step().catch((err) => {
        this.events.emitEvent({
          type: 'error',
          kind: 'ProviderError',
          message: err.message,
        });
      });
    }
  }

  async snapshot(label?: string): Promise<SnapshotId> {
    const id = label || `sfp:${this.lastSfpIndex}`;
    const snapshot: Snapshot = {
      id,
      messages: JSON.parse(JSON.stringify(this.messages)),
      lastSfpIndex: this.lastSfpIndex,
      createdAt: new Date().toISOString(),
    };

    await this.store.saveSnapshot(this.sessionId, snapshot);
    return id;
  }

  async fork(sel?: SnapshotId | { at?: string }): Promise<Agent> {
    // 1. Load snapshot (or use current state if no selector)
    let snapshot: Snapshot;

    if (!sel) {
      // Fork from current state
      snapshot = {
        id: `sfp:${this.lastSfpIndex}`,
        messages: JSON.parse(JSON.stringify(this.messages)),
        lastSfpIndex: this.lastSfpIndex,
        createdAt: new Date().toISOString(),
      };
    } else if (typeof sel === 'string') {
      // Load snapshot by ID
      const loaded = await this.store.loadSnapshot(this.sessionId, sel);
      if (!loaded) {
        throw new Error(`Snapshot not found: ${sel}`);
      }
      snapshot = loaded;
    } else {
      // Load snapshot by selector
      const snapshotId = sel.at || `sfp:${this.lastSfpIndex}`;
      const loaded = await this.store.loadSnapshot(this.sessionId, snapshotId);
      if (!loaded) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }
      snapshot = loaded;
    }

    // 2. Generate new sessionId for forked agent
    const forkId = `fork:${Date.now()}`;
    const newSessionId = `${this.sessionId}/${forkId}`;

    // 3. Create new agent with same configuration
    const forked = new Agent({
      sessionId: newSessionId,
      provider: this.provider,
      store: this.store,
      sandbox: this.sandbox,
      tools: Array.from(this.tools.values()),
      system: this.system,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      maxConcurrency: this.maxConcurrency,
      templateId: this.templateId,
    });

    // 4. Restore messages from snapshot
    forked.messages = snapshot.messages;
    forked.lastSfpIndex = snapshot.lastSfpIndex;
    forked.stepCount = snapshot.messages.filter(m => m.role === 'user').length;

    // 5. Persist forked state
    await forked.persistMessages();

    // 6. Emit forked event
    this.events.emitEvent({
      type: 'forked',
      childSessionId: newSessionId,
      from: snapshot.id,
    });

    return forked;
  }

  static async resume(
    sessionId: string,
    opts: AgentOptions & { autoRun?: boolean; strategy?: 'crash' | 'manual' }
  ): Promise<Agent> {
    const { autoRun = false, strategy = 'manual', store, ...agentOpts } = opts;

    // Load messages from store
    const messages = await store.loadMessages(sessionId);
    if (messages.length === 0) {
      throw new Error(`Session has no messages: ${sessionId}`);
    }

    // Create agent instance
    const agent = new Agent({
      ...agentOpts,
      sessionId,
      store,
    });

    // Restore messages
    agent.messages = messages;

    // Find last SFP
    agent.lastSfpIndex = agent.findLastSfp();

    // Restore step count
    agent.stepCount = messages.filter((m) => m.role === 'user').length;

    // Handle crash recovery: generate sealed results for pending tools
    if (strategy === 'crash') {
      const sealedTools = agent.findSealedTools();

      if (sealedTools.length > 0) {
        const sealedResults: ContentBlock[] = sealedTools.map((tool) => ({
          type: 'tool_result',
          tool_use_id: tool.tool_use_id,
          content: {
            error: `Sealed due to crash: ${tool.note}`,
            sealed: true,
          },
          is_error: true,
        }));

        agent.messages.push({
          role: 'user',
          content: sealedResults,
        });

        agent.stepCount++;
        agent.lastSfpIndex = agent.messages.length - 1;

        await agent.persistMessages();

        agent.events.emitEvent({
          type: 'resume',
          from: 'crash',
          sealed: sealedTools,
        });
      }
    } else {
      agent.events.emitEvent({
        type: 'resume',
        from: 'manual',
        sealed: [],
      });
    }

    // AutoRun: continue execution if there are pending tools
    if (autoRun) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        const pendingTools = lastMessage.content.filter((c) => c.type === 'tool_use');
        if (pendingTools.length > 0) {
          agent.step().catch((err) => {
            agent.events.emitEvent({
              type: 'error',
              kind: 'ProviderError',
              message: err.message,
            });
          });
        }
      }
    }

    agent.state = 'READY';
    agent.events.emitEvent({ type: 'state', state: 'READY' });

    return agent;
  }

  private findLastSfp(): number {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];

      // User message is SFP
      if (msg.role === 'user') {
        return i;
      }

      // Assistant text-only message is SFP
      if (msg.role === 'assistant') {
        const hasToolUse = msg.content.some((c) => c.type === 'tool_use');
        if (!hasToolUse) {
          return i;
        }
      }
    }

    return -1;
  }

  private findSealedTools(): Array<{
    tool_use_id: string;
    name: string;
    args: any;
    note: string;
  }> {
    const sealed: Array<any> = [];
    const toolUseMap = new Map<string, { name: string; args: any }>();
    const toolResultSet = new Set<string>();

    // Collect all tool_use and tool_result
    for (const msg of this.messages) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          const tu = block as any;
          toolUseMap.set(tu.id, { name: tu.name, args: tu.input });
        } else if (block.type === 'tool_result') {
          const tr = block as any;
          toolResultSet.add(tr.tool_use_id);
        }
      }
    }

    // Find tool_use without results
    for (const [toolId, tool] of toolUseMap.entries()) {
      if (!toolResultSet.has(toolId)) {
        sealed.push({
          tool_use_id: toolId,
          name: tool.name,
          args: tool.args,
          note: 'No result found, likely crashed during execution',
        });
      }
    }

    return sealed;
  }

  async history(opts?: { since?: number; limit?: number }): Promise<AgentEvent[]> {
    const timeline = this.events.getTimeline(opts?.since);
    const limited = opts?.limit ? timeline.slice(0, opts.limit) : timeline;
    return limited.map((t) => t.event);
  }

  async status(): Promise<AgentStatus> {
    return {
      state: this.state,
      sessionId: this.sessionId,
      messageCount: this.messages.length,
      lastSfpIndex: this.lastSfpIndex,
      cursor: this.events.getCursor(),
    };
  }

  async info(): Promise<AgentInfo> {
    return {
      sessionId: this.sessionId,
      templateId: this.templateId,
      createdAt: new Date().toISOString(),
      lineage: [],
      messageCount: this.messages.length,
      lastSfpIndex: this.lastSfpIndex,
    };
  }

  use(hooks: Hooks): this {
    this.hooks.register(hooks, 'agent');
    return this;
  }

  getHooks(): ReadonlyArray<import('./hooks').RegisteredHook> {
    return this.hooks.getRegistered();
  }

  registerTools(tools: Tool[]): this {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
      if (tool.hooks) {
        this.hooks.register(tool.hooks, 'toolTune');
      }
    }
    return this;
  }

  schedule(): Scheduler {
    if (!this.scheduler) {
      this.scheduler = new Scheduler();

      // Connect step events to scheduler
      this.on('messages_update', (event: any) => {
        if (event.added && event.added > 0) {
          this.scheduler!.notifyStep();
        }
      });
    }

    return this.scheduler;
  }

  on(event: 'permission_ask' | 'error' | 'messages_update', handler: (...args: any[]) => void): this {
    this.events.on(event, handler);
    return this;
  }

  private async step(): Promise<void> {
    if (this.state !== 'READY') return;
    if (this.interrupted) {
      this.interrupted = false;
      return;
    }

    this.state = 'BUSY';
    this.events.emitEvent({ type: 'state', state: 'BUSY' });

    try {
      await this.hooks.runPreModel(this.messages);

      const response = await this.provider.complete(this.messages, {
        tools: this.getToolSchemas(),
        system: this.system,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
      });

      await this.hooks.runPostModel(response);

      this.messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Emit text events
      const textBlocks = response.content.filter((c) => c.type === 'text');
      for (const block of textBlocks) {
        this.events.emitEvent({ type: 'text', text: (block as any).text });
      }

      // Emit usage
      if (response.usage) {
        this.events.emitEvent({
          type: 'usage',
          data: {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            total_tokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        });
      }

      const toolUses = response.content.filter((c) => c.type === 'tool_use');

      if (toolUses.length > 0) {
        const results = await this.executeTools(toolUses);
        this.messages.push({
          role: 'user',
          content: results,
        });

        this.stepCount++;
        this.lastSfpIndex = this.messages.length - 1;
        this.events.emitEvent({ type: 'commit', sfpIndex: this.lastSfpIndex });

        await this.persistMessages();
        this.events.emitEvent({
          type: 'messages_update',
          messageCount: this.messages.length,
          lastSfpIndex: this.lastSfpIndex,
          added: 1,
        });

        // Continue next step
        this.state = 'READY';
        return this.step();
      } else {
        // No tools, this is SFP
        this.lastSfpIndex = this.messages.length - 1;
        this.events.emitEvent({ type: 'commit', sfpIndex: this.lastSfpIndex });
        await this.persistMessages();
        this.events.emitEvent({
          type: 'messages_update',
          messageCount: this.messages.length,
          lastSfpIndex: this.lastSfpIndex,
        });
      }
    } catch (error: any) {
      this.events.emitEvent({
        type: 'error',
        kind: 'ProviderError',
        message: error.message,
        hint: error.stack,
      });
    } finally {
      this.state = 'READY';
      this.events.emitEvent({ type: 'state', state: 'READY' });
    }
  }

  private async executeTools(toolUses: ContentBlock[]): Promise<ContentBlock[]> {
    const results: ContentBlock[] = [];

    for (const use of toolUses) {
      if (use.type !== 'tool_use') continue;

      const tu = use as any;
      const tool = this.tools.get(tu.name);

      this.events.emitEvent({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });

      if (!tool) {
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: { error: `Tool not found: ${tu.name}` },
          is_error: true,
        });
        continue;
      }

      const call: ToolCall = {
        id: tu.id,
        name: tu.name,
        args: tu.input,
        sessionId: this.sessionId,
      };

      const ctx: ToolContext = {
        sessionId: this.sessionId,
        sandbox: this.sandbox,
        agent: this,
      };

      // Run preToolUse hooks
      const hookDecision = await this.hooks.runPreToolUse(call, ctx);

      if (hookDecision) {
        if ('decision' in hookDecision) {
          if (hookDecision.decision === 'ask') {
            // Pause and wait for permission
            await this.requestPermission(call, hookDecision.meta);
            // After permission granted, continue
          } else if (hookDecision.decision === 'deny') {
            const result: ContentBlock = {
              type: 'tool_result',
              tool_use_id: tu.id,
              content: hookDecision.toolResult || { error: hookDecision.reason || 'Denied by policy' },
              is_error: true,
            };
            results.push(result);
            this.events.emitEvent({
              type: 'tool_result',
              id: tu.id,
              name: tu.name,
              ok: false,
              content: result.content,
            });
            continue;
          }
        } else if ('result' in hookDecision) {
          // Pre-computed result
          const result: ContentBlock = {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: hookDecision.result,
          };
          results.push(result);
          this.events.emitEvent({
            type: 'tool_result',
            id: tu.id,
            name: tu.name,
            ok: true,
            content: result.content,
          });
          continue;
        }
      }

      // Execute tool
      try {
        const startTime = Date.now();
        const res = await tool.exec(call.args, ctx);
        const duration = Date.now() - startTime;

        let outcome: ToolOutcome = {
          id: tu.id,
          name: tu.name,
          ok: true,
          content: res,
          duration_ms: duration,
        };

        // Run postToolUse hooks
        outcome = await this.hooks.runPostToolUse(outcome, ctx);

        const result: ContentBlock = {
          type: 'tool_result',
          tool_use_id: tu.id,
          content: outcome.content,
        };

        results.push(result);
        this.events.emitEvent({
          type: 'tool_result',
          id: tu.id,
          name: tu.name,
          ok: true,
          content: outcome.content,
          duration_ms: outcome.duration_ms,
        });
      } catch (error: any) {
        const result: ContentBlock = {
          type: 'tool_result',
          tool_use_id: tu.id,
          content: { error: error.message },
          is_error: true,
        };
        results.push(result);
        this.events.emitEvent({
          type: 'tool_result',
          id: tu.id,
          name: tu.name,
          ok: false,
          content: result.content,
        });
      }
    }

    return results;
  }

  private async requestPermission(call: ToolCall, meta?: any): Promise<void> {
    return new Promise((resolve) => {
      const respondFn = async (decision: 'allow' | 'deny', note?: string) => {
        this.events.emitEvent({ type: 'permission_decision', id: call.id, decision, by: 'respond' });
        resolve();
      };

      this.pendingPermissions.set(call.id, (decision, note) => {
        respondFn(decision, note);
      });

      this.state = 'PAUSED';
      this.events.emitEvent({
        type: 'permission_ask',
        id: call.id,
        tool: call.name,
        args: call.args,
        meta,
        respond: respondFn,
      });
      this.events.emitEvent({ type: 'state', state: 'PAUSED' });
    });
  }

  private getToolSchemas(): any[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  private async persistMessages(): Promise<void> {
    await this.store.saveMessages(this.sessionId, this.messages);
  }
}
