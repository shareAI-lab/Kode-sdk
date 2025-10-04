import { Message, Timeline, Snapshot, AgentInfo } from '../core/types';

export interface Store {
  saveMessages(sessionId: string, messages: Message[]): Promise<void>;
  loadMessages(sessionId: string): Promise<Message[]>;

  appendEvent(sessionId: string, timeline: Timeline): Promise<void>;
  readEvents(sessionId: string, since?: number): AsyncIterable<Timeline>;

  saveSnapshot(sessionId: string, snapshot: Snapshot): Promise<void>;
  loadSnapshot(sessionId: string, snapshotId: string): Promise<Snapshot | undefined>;
  listSnapshots(sessionId: string): Promise<Snapshot[]>;

  saveInfo(sessionId: string, info: AgentInfo): Promise<void>;
  loadInfo(sessionId: string): Promise<AgentInfo | undefined>;

  exists(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export class JSONStore implements Store {
  constructor(private baseDir: string) {}

  private getPath(sessionId: string, file: string): string {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(this.baseDir, sessionId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, file);
  }

  async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    const fs = require('fs').promises;
    await fs.writeFile(this.getPath(sessionId, 'messages.json'), JSON.stringify(messages, null, 2));
  }

  async loadMessages(sessionId: string): Promise<Message[]> {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.getPath(sessionId, 'messages.json'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async appendEvent(sessionId: string, timeline: Timeline): Promise<void> {
    const fs = require('fs').promises;
    const path = this.getPath(sessionId, 'events.jsonl');
    await fs.appendFile(path, JSON.stringify(timeline) + '\n');
  }

  async *readEvents(sessionId: string, since?: number): AsyncIterable<Timeline> {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.getPath(sessionId, 'events.jsonl'), 'utf-8');
      const events = data
        .trim()
        .split('\n')
        .filter((line: string) => line)
        .map((line: string) => JSON.parse(line) as Timeline);

      const filtered = since !== undefined ? events.filter((e: Timeline) => e.cursor >= since) : events;
      for (const event of filtered) {
        yield event;
      }
    } catch {
      // No events file, return empty
      return;
    }
  }

  async saveSnapshot(sessionId: string, snapshot: Snapshot): Promise<void> {
    const fs = require('fs').promises;
    const path = this.getPath(sessionId, `snapshot-${snapshot.id}.json`);
    await fs.writeFile(path, JSON.stringify(snapshot, null, 2));
  }

  async loadSnapshot(sessionId: string, snapshotId: string): Promise<Snapshot | undefined> {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.getPath(sessionId, `snapshot-${snapshotId}.json`), 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async listSnapshots(sessionId: string): Promise<Snapshot[]> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dir = path.join(this.baseDir, sessionId);
      const files = await fs.readdir(dir);
      const snapshots: Snapshot[] = [];
      for (const file of files) {
        if (file.startsWith('snapshot-') && file.endsWith('.json')) {
          const data = await fs.readFile(path.join(dir, file), 'utf-8');
          snapshots.push(JSON.parse(data));
        }
      }
      return snapshots;
    } catch {
      return [];
    }
  }

  async saveInfo(sessionId: string, info: AgentInfo): Promise<void> {
    const fs = require('fs').promises;
    await fs.writeFile(this.getPath(sessionId, 'info.json'), JSON.stringify(info, null, 2));
  }

  async loadInfo(sessionId: string): Promise<AgentInfo | undefined> {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.getPath(sessionId, 'info.json'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      await fs.access(path.join(this.baseDir, sessionId));
      return true;
    } catch {
      return false;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    const dir = path.join(this.baseDir, sessionId);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async list(prefix?: string): Promise<string[]> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dirs = await fs.readdir(this.baseDir);
      return prefix ? dirs.filter((d: string) => d.startsWith(prefix)) : dirs;
    } catch {
      return [];
    }
  }
}
