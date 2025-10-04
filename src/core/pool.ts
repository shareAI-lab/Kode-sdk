import { Agent, AgentOptions } from '../core/agent';
import { Store } from '../infra/store';
import { AgentTemplate } from '../tools/task';
import { AgentStatus, SnapshotId } from '../core/types';

export interface AgentPoolOptions {
  store: Store;
  maxAgents?: number;
}

export class AgentPool {
  private agents = new Map<string, Agent>();
  private store: Store;
  private maxAgents: number;

  constructor(opts: AgentPoolOptions) {
    this.store = opts.store;
    this.maxAgents = opts.maxAgents || 50;
  }

  create(sessionId: string, templateOrOpts: AgentTemplate | AgentOptions, overrides?: Partial<AgentOptions>): Agent {
    if (this.agents.has(sessionId)) {
      throw new Error(`Agent already exists: ${sessionId}`);
    }

    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Pool is full (max ${this.maxAgents} agents)`);
    }

    const agent = new Agent(templateOrOpts, overrides);
    this.agents.set(sessionId, agent);
    return agent;
  }

  get(sessionId: string): Agent | undefined {
    return this.agents.get(sessionId);
  }

  list(opts?: { prefix?: string }): string[] {
    const ids = Array.from(this.agents.keys());
    return opts?.prefix ? ids.filter((id) => id.startsWith(opts.prefix!)) : ids;
  }

  async status(sessionId: string): Promise<AgentStatus | undefined> {
    const agent = this.agents.get(sessionId);
    return agent ? await agent.status() : undefined;
  }

  async fork(sessionId: string, snapshotSel?: SnapshotId | { at?: string }): Promise<Agent> {
    const agent = this.agents.get(sessionId);
    if (!agent) {
      throw new Error(`Agent not found: ${sessionId}`);
    }

    return agent.fork(snapshotSel);
  }

  async resume(
    sessionId: string,
    opts: Omit<AgentOptions, 'sessionId' | 'store'> & { autoRun?: boolean; strategy?: 'crash' | 'manual' }
  ): Promise<Agent> {
    // 1. Check if already in pool
    if (this.agents.has(sessionId)) {
      return this.agents.get(sessionId)!;
    }

    // 2. Check pool capacity
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Pool is full (max ${this.maxAgents} agents)`);
    }

    // 3. Verify session exists
    const exists = await this.store.exists(sessionId);
    if (!exists) {
      throw new Error(`Session not found in store: ${sessionId}`);
    }

    // 4. Use Agent.resume() to restore
    const agent = await Agent.resume(sessionId, {
      ...opts,
      sessionId,
      store: this.store,
    });

    // 5. Add to pool
    this.agents.set(sessionId, agent);

    return agent;
  }

  async resumeAll(
    configFactory: (sessionId: string) => Omit<AgentOptions, 'sessionId' | 'store'>,
    opts?: { autoRun?: boolean; strategy?: 'crash' | 'manual' }
  ): Promise<Agent[]> {
    const sessionIds = await this.store.list();
    const resumed: Agent[] = [];

    for (const sessionId of sessionIds) {
      if (this.agents.size >= this.maxAgents) break;
      if (this.agents.has(sessionId)) continue;

      try {
        const config = configFactory(sessionId);
        const agent = await this.resume(sessionId, { ...config, ...opts });
        resumed.push(agent);
      } catch (error) {
        console.error(`Failed to resume ${sessionId}:`, error);
      }
    }

    return resumed;
  }

  async delete(sessionId: string): Promise<void> {
    this.agents.delete(sessionId);
    await this.store.delete(sessionId);
  }

  size(): number {
    return this.agents.size;
  }
}
