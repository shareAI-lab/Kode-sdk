import { AgentPool } from '../core/pool';

export interface RoomMember {
  name: string;
  agentId: string;
}

export class Room {
  private members = new Map<string, string>();

  constructor(private pool: AgentPool) {}

  join(name: string, agentId: string): void {
    if (this.members.has(name)) {
      throw new Error(`Member already exists: ${name}`);
    }
    this.members.set(name, agentId);
  }

  leave(name: string): void {
    this.members.delete(name);
  }

  async say(from: string, text: string): Promise<void> {
    const mentions = this.extractMentions(text);

    if (mentions.length > 0) {
      // Directed message
      for (const mention of mentions) {
        const agentId = this.members.get(mention);
        if (agentId) {
          const agent = this.pool.get(agentId);
          if (agent) {
            await agent.complete(`[from:${from}] ${text}`);
          }
        }
      }
    } else {
      // Broadcast to all except sender
      for (const [name, agentId] of this.members) {
        if (name !== from) {
          const agent = this.pool.get(agentId);
          if (agent) {
            await agent.complete(`[from:${from}] ${text}`);
          }
        }
      }
    }
  }

  getMembers(): RoomMember[] {
    return Array.from(this.members.entries()).map(([name, agentId]) => ({ name, agentId }));
  }

  private extractMentions(text: string): string[] {
    const regex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }
}
