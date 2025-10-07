import { Agent, AgentConfig, AgentDependencies, ResumeStrategy } from '../../src';
import { createIntegrationTestAgent, IntegrationTestAgentOptions } from './setup';
import { expect } from './utils';

export interface ChatStepExpectation {
  includes?: string[];
  notIncludes?: string[];
}

export interface ChatStepOptions {
  label: string;
  prompt: string;
  expectation?: ChatStepExpectation;
}

export interface DelegateTaskOptions {
  label: string;
  templateId: string;
  prompt: string;
  tools?: string[];
}

interface SubscriptionEvent {
  channel: 'progress' | 'monitor' | 'control';
  event: any;
}

export class IntegrationHarness {
  static async create(options: IntegrationTestAgentOptions = {}) {
    const context = await createIntegrationTestAgent(options);
    return new IntegrationHarness(
      context.agent,
      context.deps,
      context.config,
      context.cleanup,
      context.workDir,
      context.storeDir
    );
  }

  private constructor(
    private agent: Agent,
    private readonly deps: AgentDependencies,
    private readonly config: AgentConfig,
    private readonly cleanupFn: () => Promise<void>,
    private readonly workDir?: string,
    private readonly storeDir?: string
  ) {}

  log(message: string) {
    console.log(message);
  }

  async chatStep(opts: ChatStepOptions) {
    const { label, prompt, expectation } = opts;
    this.log(`\n[${label}] >>> 用户指令`);
    this.log(`[${label}] ${prompt}`);

    const iterator = this.agent.subscribe(['progress', 'monitor', 'control'])[Symbol.asyncIterator]();
    const events: SubscriptionEvent[] = [];
    const pendingReply = this.agent.chat(prompt);

    const delay = (ms: number) =>
      new Promise<{ kind: 'idle' }>((resolve) => setTimeout(() => resolve({ kind: 'idle' }), ms));

    let replyResolved = false;
    let replyResult: Awaited<ReturnType<Agent['chat']>> | undefined;

    while (true) {
      const contenders: Array<Promise<any>> = [
        iterator
          .next()
          .then((res) => ({ kind: 'event' as const, res }))
          .catch((error) => ({ kind: 'error' as const, error })),
      ];

      if (!replyResolved) {
        contenders.push(
          pendingReply.then((reply) => ({ kind: 'reply' as const, reply }))
        );
      } else {
        contenders.push(delay(750));
      }

      const outcome = await Promise.race(contenders);

      if (outcome.kind === 'error') {
        throw outcome.error;
      }

      if (outcome.kind === 'reply') {
        replyResult = outcome.reply;
        replyResolved = true;
        continue;
      }

      if (outcome.kind === 'idle') {
        // 已经获得模型回复，且事件流在空闲后无更多数据
        break;
      }

      const { value, done } = outcome.res;
      if (!value) {
        if (done && replyResolved) {
          break;
        }
        if (done) {
          continue;
        }
        // 无事件但未标记完成，继续等待
        continue;
      }

      const envelope = value as any;
      const event = (envelope.event ?? envelope) as any;
      const channel = (event.channel ?? envelope.channel) as SubscriptionEvent['channel'];
      events.push({ channel, event });
      this.log(
        `[${label}] [事件#${events.length}] channel=${channel ?? 'unknown'}, type=${event.type}` +
          (event.delta ? `, delta=${event.delta.slice?.(0, 120)}` : '')
      );

      if (channel === 'progress' && event.type === 'done') {
        if (!replyResolved) {
          replyResult = await pendingReply;
          replyResolved = true;
        }
        break;
      }
    }

    if (iterator.return) {
      await iterator.return();
    }

    if (!replyResolved) {
      replyResult = await pendingReply;
      replyResolved = true;
    }

    const reply = replyResult!;
    this.log(`[${label}] <<< 模型响应`);
    this.log(`[${label}] ${reply.text ?? '(无文本响应)'}`);

    if (expectation?.includes) {
      for (const fragment of expectation.includes) {
        expect.toBeTruthy(
          reply.text?.includes(fragment),
          `[${label}] 期望响应包含: ${fragment}`
        );
      }
    }

    if (expectation?.notIncludes) {
      for (const fragment of expectation.notIncludes) {
        expect.toBeFalsy(
          reply.text?.includes(fragment),
          `[${label}] 不应包含: ${fragment}`
        );
      }
    }

    return { reply, events };
  }

  async delegateTask(opts: DelegateTaskOptions) {
    const { label, templateId, prompt, tools } = opts;
    this.log(`\n[${label}] >>> task_run 子代理请求`);
    this.log(`[${label}] 模板: ${templateId}`);
    this.log(`[${label}] Prompt: ${prompt}`);
    const result = await this.agent.delegateTask({ templateId, prompt, tools });
    this.log(`[${label}] <<< 子代理返回 status=${result.status}`);
    this.log(`[${label}] 子代理内容: ${result.text ?? '(无文本响应)'}`);
    return result;
  }

  async resume(label: string, opts?: { strategy?: ResumeStrategy; autoRun?: boolean }) {
    this.log(`\n[${label}] 执行 Agent.resume 以继续对话.`);
    this.agent = await Agent.resume(this.agent.agentId, this.config, this.deps, opts);
  }

  getAgent(): Agent {
    return this.agent;
  }

  getConfig(): AgentConfig {
    return this.config;
  }

  getDependencies(): AgentDependencies {
    return this.deps;
  }

  async cleanup() {
    await this.cleanupFn();
  }

  getWorkDir(): string | undefined {
    return this.workDir;
  }

  getStoreDir(): string | undefined {
    return this.storeDir;
  }
}
