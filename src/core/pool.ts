import { Agent, AgentConfig, AgentDependencies } from './agent';
import { AgentStatus, SnapshotId } from './types';

export interface AgentPoolOptions {
  dependencies: AgentDependencies;
  maxAgents?: number;
}

export class AgentPool {
  private agents = new Map<string, Agent>();
  private deps: AgentDependencies;
  private maxAgents: number;

  constructor(opts: AgentPoolOptions) {
    this.deps = opts.dependencies;
    this.maxAgents = opts.maxAgents || 50;
  }

  async create(agentId: string, config: AgentConfig): Promise<Agent> {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent already exists: ${agentId}`);
    }

    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Pool is full (max ${this.maxAgents} agents)`);
    }

    const agent = await Agent.create({ ...config, agentId }, this.deps);
    this.agents.set(agentId, agent);
    return agent;
  }

  get(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  list(opts?: { prefix?: string }): string[] {
    const ids = Array.from(this.agents.keys());
    return opts?.prefix ? ids.filter((id) => id.startsWith(opts.prefix!)) : ids;
  }

  async status(agentId: string): Promise<AgentStatus | undefined> {
    const agent = this.agents.get(agentId);
    return agent ? await agent.status() : undefined;
  }

  async fork(agentId: string, snapshotSel?: SnapshotId | { at?: string }): Promise<Agent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return agent.fork(snapshotSel);
  }

  async resume(agentId: string, config: AgentConfig, opts?: { autoRun?: boolean; strategy?: 'crash' | 'manual' }): Promise<Agent> {
    // 1. Check if already in pool
    if (this.agents.has(agentId)) {
      return this.agents.get(agentId)!;
    }

    // 2. Check pool capacity
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Pool is full (max ${this.maxAgents} agents)`);
    }

    // 3. Verify session exists
    const exists = await this.deps.store.exists(agentId);
    if (!exists) {
      throw new Error(`Agent not found in store: ${agentId}`);
    }

    // 4. Use Agent.resume() to restore
    const agent = await Agent.resume(agentId, { ...config, agentId }, this.deps, opts);

    // 5. Add to pool
    this.agents.set(agentId, agent);

    return agent;
  }

  async resumeAll(
    configFactory: (agentId: string) => AgentConfig,
    opts?: { autoRun?: boolean; strategy?: 'crash' | 'manual' }
  ): Promise<Agent[]> {
    const agentIds = await this.deps.store.list();
    const resumed: Agent[] = [];

    for (const agentId of agentIds) {
      if (this.agents.size >= this.maxAgents) break;
      if (this.agents.has(agentId)) continue;

      try {
        const config = configFactory(agentId);
        const agent = await this.resume(agentId, config, opts);
        resumed.push(agent);
      } catch (error) {
        console.error(`Failed to resume ${agentId}:`, error);
      }
    }

    return resumed;
  }

  async delete(agentId: string): Promise<void> {
    this.agents.delete(agentId);
    await this.deps.store.delete(agentId);
  }

  size(): number {
    return this.agents.size;
  }
}
