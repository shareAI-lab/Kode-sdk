import { Message, Timeline, Snapshot, AgentInfo, ToolCallRecord, Bookmark, AgentChannel } from '../core/types';
import { TodoSnapshot } from '../core/todo';

// ============================================================================
// Core Data Structures
// ============================================================================

export interface HistoryWindow {
  id: string;
  messages: Message[];
  events: Timeline[];
  stats: {
    messageCount: number;
    tokenCount: number;
    eventCount: number;
  };
  timestamp: number;
}

export interface CompressionRecord {
  id: string;
  windowId: string;
  config: {
    model: string;
    prompt: string;
    threshold: number;
  };
  summary: string;
  ratio: number;
  recoveredFiles: string[];
  timestamp: number;
}

export interface RecoveredFile {
  path: string;
  content: string;
  mtime: number;
  timestamp: number;
}

// ============================================================================
// Store Interface - 明确职责分离
// ============================================================================

/**
 * Store 接口定义 Agent 持久化的所有能力
 *
 * 设计原则：
 * 1. 所有方法都是必需的，不使用可选方法
 * 2. 职责清晰：运行时状态、历史管理、事件流、元数据管理
 * 3. 实现无关：接口不暴露存储细节（如 WAL、文件格式等）
 */
export interface Store {
  // ========== 运行时状态管理 ==========

  /** 保存对话消息 */
  saveMessages(agentId: string, messages: Message[]): Promise<void>;
  /** 加载对话消息 */
  loadMessages(agentId: string): Promise<Message[]>;

  /** 保存工具调用记录 */
  saveToolCallRecords(agentId: string, records: ToolCallRecord[]): Promise<void>;
  /** 加载工具调用记录 */
  loadToolCallRecords(agentId: string): Promise<ToolCallRecord[]>;

  /** 保存 Todo 快照 */
  saveTodos(agentId: string, snapshot: TodoSnapshot): Promise<void>;
  /** 加载 Todo 快照 */
  loadTodos(agentId: string): Promise<TodoSnapshot | undefined>;

  // ========== 事件流管理 ==========

  /** 追加事件到流中 */
  appendEvent(agentId: string, timeline: Timeline): Promise<void>;
  /** 读取事件流（支持 Bookmark 续读和 Channel 过滤） */
  readEvents(agentId: string, opts?: { since?: Bookmark; channel?: AgentChannel }): AsyncIterable<Timeline>;

  // ========== 历史与压缩管理 ==========

  /** 保存历史窗口（压缩前的完整快照） */
  saveHistoryWindow(agentId: string, window: HistoryWindow): Promise<void>;
  /** 加载所有历史窗口 */
  loadHistoryWindows(agentId: string): Promise<HistoryWindow[]>;

  /** 保存压缩记录 */
  saveCompressionRecord(agentId: string, record: CompressionRecord): Promise<void>;
  /** 加载所有压缩记录 */
  loadCompressionRecords(agentId: string): Promise<CompressionRecord[]>;

  /** 保存恢复文件快照 */
  saveRecoveredFile(agentId: string, file: RecoveredFile): Promise<void>;
  /** 加载所有恢复文件 */
  loadRecoveredFiles(agentId: string): Promise<RecoveredFile[]>;

  // ========== 快照管理 ==========

  /** 保存快照 */
  saveSnapshot(agentId: string, snapshot: Snapshot): Promise<void>;
  /** 加载指定快照 */
  loadSnapshot(agentId: string, snapshotId: string): Promise<Snapshot | undefined>;
  /** 列出所有快照 */
  listSnapshots(agentId: string): Promise<Snapshot[]>;

  // ========== 元数据管理 ==========

  /** 保存 Agent 元信息 */
  saveInfo(agentId: string, info: AgentInfo): Promise<void>;
  /** 加载 Agent 元信息 */
  loadInfo(agentId: string): Promise<AgentInfo | undefined>;

  // ========== 生命周期管理 ==========

  /** 检查 Agent 是否存在 */
  exists(agentId: string): Promise<boolean>;
  /** 删除 Agent 所有数据 */
  delete(agentId: string): Promise<void>;
  /** 列出所有 Agent ID */
  list(prefix?: string): Promise<string[]>;
}

// ============================================================================
// JSONStore Implementation - 统一 WAL 策略的本地存储实现
// ============================================================================

/**
 * 目录结构规范：
 *
 * {baseDir}/{agentId}/
 * ├── runtime/              # 运行时状态（带 WAL 保护）
 * │   ├── messages.json
 * │   ├── messages.wal
 * │   ├── tool-calls.json
 * │   ├── tool-calls.wal
 * │   └── todos.json
 * ├── events/              # 事件流（按通道分离，带 WAL）
 * │   ├── progress.log
 * │   ├── progress.wal
 * │   ├── control.log
 * │   ├── control.wal
 * │   ├── monitor.log
 * │   └── monitor.wal
 * ├── history/             # 历史归档
 * │   ├── windows/
 * │   │   └── {timestamp}.json
 * │   ├── compressions/
 * │   │   └── {timestamp}.json
 * │   └── recovered/
 * │       └── {filename}_{timestamp}.txt
 * ├── snapshots/           # 快照
 * │   └── {snapshotId}.json
 * └── meta.json           # 元信息
 */

interface BufferedWriter {
  timer?: NodeJS.Timeout;
  buffer: string[];
  flushing: string[];
  walWriting?: Promise<void>;
  recovered?: boolean;
}

interface ChannelWriters {
  progress: BufferedWriter;
  control: BufferedWriter;
  monitor: BufferedWriter;
}

export class JSONStore implements Store {
  private eventWriters = new Map<string, ChannelWriters>();
  private walQueue = new Map<string, Promise<void>>();
  private walRecovered = new Set<string>();

  constructor(private baseDir: string, private flushIntervalMs = 50) {
    // 启动时主动扫描并恢复所有 WAL
    void this.recoverAllWALs();
  }

  // ========== 路径管理 ==========

  private getAgentDir(agentId: string): string {
    const path = require('path');
    return path.join(this.baseDir, agentId);
  }

  private getRuntimePath(agentId: string, file: string): string {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(this.baseDir, agentId, 'runtime');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, file);
  }

  private getEventsPath(agentId: string, file: string): string {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(this.baseDir, agentId, 'events');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, file);
  }

  private getHistoryDir(agentId: string, subdir: string): string {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(this.baseDir, agentId, 'history', subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getSnapshotsDir(agentId: string): string {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(this.baseDir, agentId, 'snapshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getMetaPath(agentId: string): string {
    const path = require('path');
    return path.join(this.baseDir, agentId, 'meta.json');
  }

  // ========== 运行时状态管理（带 WAL） ==========

  async saveMessages(agentId: string, messages: Message[]): Promise<void> {
    await this.saveWithWal(agentId, 'messages', messages);
  }

  async loadMessages(agentId: string): Promise<Message[]> {
    return await this.loadWithWal(agentId, 'messages') || [];
  }

  async saveToolCallRecords(agentId: string, records: ToolCallRecord[]): Promise<void> {
    await this.saveWithWal(agentId, 'tool-calls', records);
  }

  async loadToolCallRecords(agentId: string): Promise<ToolCallRecord[]> {
    return await this.loadWithWal(agentId, 'tool-calls') || [];
  }

  async saveTodos(agentId: string, snapshot: TodoSnapshot): Promise<void> {
    const fs = require('fs').promises;
    const path = this.getRuntimePath(agentId, 'todos.json');
    await fs.writeFile(path, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  async loadTodos(agentId: string): Promise<TodoSnapshot | undefined> {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.getRuntimePath(agentId, 'todos.json'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  // ========== 统一的 WAL 读写策略 ==========

  private async saveWithWal<T>(agentId: string, name: string, data: T): Promise<void> {
    const fs = require('fs');
    const fsp = fs.promises;
    const path = this.getRuntimePath(agentId, `${name}.json`);
    const walPath = this.getRuntimePath(agentId, `${name}.wal`);

    // 1. Write to WAL first
    const walData = JSON.stringify({ data, timestamp: Date.now() });
    await this.queueWalWrite(agentId, name, async () => {
      await fsp.writeFile(walPath, walData, 'utf-8');
    });

    // 2. Write to main file (atomic: tmp + rename)
    const tmp = `${path}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fsp.rename(tmp, path);

    // 3. Remove WAL after successful write
    if (fs.existsSync(walPath)) {
      await fsp.unlink(walPath).catch(() => undefined);
    }
  }

  private async loadWithWal<T>(agentId: string, name: string): Promise<T | undefined> {
    const fs = require('fs');
    const fsp = fs.promises;
    const path = this.getRuntimePath(agentId, `${name}.json`);
    const walPath = this.getRuntimePath(agentId, `${name}.wal`);

    // 1. Check and recover from WAL if exists
    if (fs.existsSync(walPath)) {
      try {
        const walData = JSON.parse(await fsp.readFile(walPath, 'utf-8'));
        if (walData.data !== undefined) {
          // Recover from WAL
          const tmp = `${path}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(walData.data, null, 2), 'utf-8');
          await fsp.rename(tmp, path);
          await fsp.unlink(walPath).catch(() => undefined);
        }
      } catch (err) {
        console.error(`Failed to recover ${name} from WAL:`, err);
      }
    }

    // 2. Load from main file
    try {
      const data = await fsp.readFile(path, 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  private async queueWalWrite(agentId: string, name: string, write: () => Promise<void>): Promise<void> {
    const key = `${agentId}:${name}`;

    // 链式追加，确保顺序执行
    const previous = this.walQueue.get(key) || Promise.resolve();
    const next = previous
      .then(() => write())  // 前一个成功后执行
      .catch((err) => {
        // 即使前一个失败，也尝试当前写入
        console.error(`[WAL] Previous write failed for ${key}, attempting current write:`, err);
        return write();
      });

    this.walQueue.set(key, next);

    try {
      await next;
    } catch (err) {
      // 记录但不阻塞调用者
      console.error(`[WAL] Write failed for ${key}:`, err);
      throw err; // 重新抛出让调用者处理
    } finally {
      // 清理完成的 promise（避免内存泄漏）
      if (this.walQueue.get(key) === next) {
        this.walQueue.delete(key);
      }
    }
  }

  // ========== WAL 主动恢复 ==========

  /**
   * Store 初始化时主动恢复所有 WAL 文件
   */
  private async recoverAllWALs(): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const agentDirs = await fs.readdir(this.baseDir).catch(() => []);

      for (const agentId of agentDirs) {
        const agentDir = path.join(this.baseDir, agentId);
        const stat = await fs.stat(agentDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        // 恢复运行时 WAL
        await this.recoverRuntimeWAL(agentId, 'messages');
        await this.recoverRuntimeWAL(agentId, 'tool-calls');

        // 恢复事件 WAL
        await this.recoverEventWALFile(agentId, 'progress');
        await this.recoverEventWALFile(agentId, 'control');
        await this.recoverEventWALFile(agentId, 'monitor');
      }

      if (agentDirs.length > 0) {
        console.log(`[Store] WAL recovery completed for ${agentDirs.length} agents`);
      }
    } catch (err) {
      console.error('[Store] WAL recovery failed:', err);
    }
  }

  /**
   * 恢复运行时数据的 WAL
   */
  private async recoverRuntimeWAL(agentId: string, name: string): Promise<void> {
    const fs = require('fs');
    const fsp = fs.promises;
    const walKey = `${agentId}:${name}`;

    if (this.walRecovered.has(walKey)) return;
    this.walRecovered.add(walKey);

    const path = this.getRuntimePath(agentId, `${name}.json`);
    const walPath = this.getRuntimePath(agentId, `${name}.wal`);

    if (!fs.existsSync(walPath)) return;

    try {
      const walData = JSON.parse(await fsp.readFile(walPath, 'utf-8'));
      if (walData.data !== undefined) {
        const tmp = `${path}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(walData.data, null, 2), 'utf-8');
        await fsp.rename(tmp, path);
        await fsp.unlink(walPath);
        console.log(`[Store] Recovered ${name} from WAL for ${agentId}`);
      }
    } catch (err) {
      console.error(`[Store] Failed to recover ${name} WAL for ${agentId}:`, err);
      // 重命名损坏的 WAL 以便人工检查
      await fsp.rename(walPath, `${walPath}.corrupted`).catch(() => {});
    }
  }

  /**
   * 恢复事件流的 WAL
   */
  private async recoverEventWALFile(agentId: string, channel: AgentChannel): Promise<void> {
    const walKey = `${agentId}:${channel}`;
    if (this.walRecovered.has(walKey)) return;
    this.walRecovered.add(walKey);

    const fs = require('fs');
    const fsp = fs.promises;
    const walPath = this.getEventsPath(agentId, `${channel}.wal`);

    if (!fs.existsSync(walPath)) return;

    try {
      const data = await fsp.readFile(walPath, 'utf-8');
      const lines = data.split('\n').filter(Boolean);
      if (lines.length > 0) {
        const payload = lines.join('\n') + '\n';
        await fsp.appendFile(this.getEventsPath(agentId, `${channel}.log`), payload);
        await fsp.unlink(walPath);
        console.log(`[Store] Recovered ${lines.length} events from ${channel} WAL for ${agentId}`);
      }
    } catch (err) {
      console.error(`[Store] Failed to recover ${channel} WAL for ${agentId}:`, err);
      await fsp.rename(walPath, `${walPath}.corrupted`).catch(() => {});
    }
  }

  // ========== 事件流管理（按通道缓冲 + WAL） ==========

  async appendEvent(agentId: string, timeline: Timeline): Promise<void> {
    const entry = JSON.stringify(timeline);
    const channel = timeline.event.channel as AgentChannel;
    await this.recoverEventWal(agentId, channel);
    const writers = this.getEventWriters(agentId);
    const writer = writers[channel];
    writer.buffer.push(entry);
    await this.writeEventWal(agentId, channel, writer);
    if (!writer.timer) {
      writer.timer = setTimeout(() => {
        void this.flushEvents(agentId, channel);
      }, this.flushIntervalMs);
    }
  }

  async *readEvents(agentId: string, opts?: { since?: Bookmark; channel?: AgentChannel }): AsyncIterable<Timeline> {
    const channels = opts?.channel ? [opts.channel] : (['progress', 'control', 'monitor'] as AgentChannel[]);

    for (const channel of channels) {
      await this.recoverEventWal(agentId, channel);
      await this.flushEvents(agentId, channel);
      const fs = require('fs');
      const readline = require('readline');
      const path = this.getEventsPath(agentId, `${channel}.log`);
      if (!fs.existsSync(path)) continue;

      const stream = fs.createReadStream(path, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as Timeline;
          if (opts?.since && event.bookmark.seq <= opts.since.seq) continue;
          yield event;
        } catch {
          // skip corrupted lines
        }
      }
    }
  }

  private getEventWriters(agentId: string): ChannelWriters {
    let writers = this.eventWriters.get(agentId);
    if (!writers) {
      writers = {
        progress: { buffer: [], flushing: [] },
        control: { buffer: [], flushing: [] },
        monitor: { buffer: [], flushing: [] },
      };
      this.eventWriters.set(agentId, writers);
    }
    return writers;
  }

  private async flushEvents(agentId: string, channel: AgentChannel): Promise<void> {
    const writers = this.eventWriters.get(agentId);
    if (!writers) return;
    const writer = writers[channel];
    if (!writer) return;

    if (writer.timer) {
      clearTimeout(writer.timer);
      writer.timer = undefined;
    }

    if (writer.buffer.length > 0) {
      writer.flushing.push(...writer.buffer);
      writer.buffer = [];
    }

    if (writer.flushing.length === 0) {
      await this.writeEventWal(agentId, channel, writer);
      return;
    }

    const fsp = require('fs').promises;
    const payload = writer.flushing.join('\n') + '\n';
    await fsp.appendFile(this.getEventsPath(agentId, `${channel}.log`), payload);
    writer.flushing = [];
    await this.writeEventWal(agentId, channel, writer);
  }

  private async recoverEventWal(agentId: string, channel: AgentChannel): Promise<void> {
    const walKey = `${agentId}:${channel}`;
    if (this.walRecovered.has(walKey)) return;

    const writers = this.getEventWriters(agentId);
    const writer = writers[channel];
    writer.recovered = true;
    this.walRecovered.add(walKey);

    const fs = require('fs');
    const fsp = fs.promises;
    const walPath = this.getEventsPath(agentId, `${channel}.wal`);
    if (!fs.existsSync(walPath)) return;

    try {
      const data = await fsp.readFile(walPath, 'utf-8');
      const lines = data.split('\n').filter(Boolean);
      if (lines.length > 0) {
        const payload = lines.join('\n') + '\n';
        await fsp.appendFile(this.getEventsPath(agentId, `${channel}.log`), payload);
      }
      await fsp.unlink(walPath);
    } catch {
      // WAL corrupted, keep it for manual inspection
    }
  }

  private async writeEventWal(agentId: string, channel: AgentChannel, writer: BufferedWriter): Promise<void> {
    const fs = require('fs');
    const fsp = fs.promises;
    const walPath = this.getEventsPath(agentId, `${channel}.wal`);
    const schedule = async () => {
      const entries = [...writer.flushing, ...writer.buffer];
      if (entries.length > 0) {
        await fsp.writeFile(walPath, entries.join('\n') + '\n', 'utf-8');
      } else if (fs.existsSync(walPath)) {
        await fsp.unlink(walPath).catch(() => undefined);
      }
    };
    writer.walWriting = (writer.walWriting || Promise.resolve()).then(schedule, schedule);
    await writer.walWriting;
  }

  // ========== 历史与压缩管理 ==========

  async saveHistoryWindow(agentId: string, window: HistoryWindow): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    const dir = this.getHistoryDir(agentId, 'windows');
    const filePath = path.join(dir, `${window.timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(window, null, 2), 'utf-8');
  }

  async loadHistoryWindows(agentId: string): Promise<HistoryWindow[]> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dir = this.getHistoryDir(agentId, 'windows');
      const files = await fs.readdir(dir);
      const windows: HistoryWindow[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(dir, file), 'utf-8');
          windows.push(JSON.parse(data));
        }
      }
      return windows.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
  }

  async saveCompressionRecord(agentId: string, record: CompressionRecord): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    const dir = this.getHistoryDir(agentId, 'compressions');
    const filePath = path.join(dir, `${record.timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  async loadCompressionRecords(agentId: string): Promise<CompressionRecord[]> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dir = this.getHistoryDir(agentId, 'compressions');
      const files = await fs.readdir(dir);
      const records: CompressionRecord[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(dir, file), 'utf-8');
          records.push(JSON.parse(data));
        }
      }
      return records.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
  }

  async saveRecoveredFile(agentId: string, file: RecoveredFile): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    const dir = this.getHistoryDir(agentId, 'recovered');
    const safePath = file.path.replace(/[\/\\]/g, '_');
    const filePath = path.join(dir, `${safePath}_${file.timestamp}.txt`);
    const header = `# Recovered: ${file.path}\n# Timestamp: ${file.timestamp}\n# Mtime: ${file.mtime}\n\n`;
    await fs.writeFile(filePath, header + file.content, 'utf-8');
  }

  async loadRecoveredFiles(agentId: string): Promise<RecoveredFile[]> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dir = this.getHistoryDir(agentId, 'recovered');
      const files = await fs.readdir(dir);
      const recovered: RecoveredFile[] = [];
      for (const file of files) {
        const data = await fs.readFile(path.join(dir, file), 'utf-8');
        const lines = data.split('\n');
        const pathMatch = lines[0]?.match(/# Recovered: (.+)/);
        const tsMatch = lines[1]?.match(/# Timestamp: (\d+)/);
        const mtimeMatch = lines[2]?.match(/# Mtime: (\d+)/);
        if (pathMatch && tsMatch && mtimeMatch) {
          recovered.push({
            path: pathMatch[1],
            content: lines.slice(4).join('\n'),
            mtime: parseInt(mtimeMatch[1]),
            timestamp: parseInt(tsMatch[1]),
          });
        }
      }
      return recovered.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
  }

  // ========== 快照管理 ==========

  async saveSnapshot(agentId: string, snapshot: Snapshot): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    const dir = this.getSnapshotsDir(agentId);
    const filePath = path.join(dir, `${snapshot.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  async loadSnapshot(agentId: string, snapshotId: string): Promise<Snapshot | undefined> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dir = this.getSnapshotsDir(agentId);
      const data = await fs.readFile(path.join(dir, `${snapshotId}.json`), 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async listSnapshots(agentId: string): Promise<Snapshot[]> {
    const fs = require('fs').promises;
    const path = require('path');
    try {
      const dir = this.getSnapshotsDir(agentId);
      const files = await fs.readdir(dir);
      const snapshots: Snapshot[] = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(dir, file), 'utf-8');
          snapshots.push(JSON.parse(data));
        }
      }
      return snapshots;
    } catch {
      return [];
    }
  }

  // ========== 元数据管理 ==========

  async saveInfo(agentId: string, info: AgentInfo): Promise<void> {
    const fs = require('fs').promises;
    await fs.writeFile(this.getMetaPath(agentId), JSON.stringify(info, null, 2), 'utf-8');
  }

  async loadInfo(agentId: string): Promise<AgentInfo | undefined> {
    const fs = require('fs').promises;
    try {
      const data = await fs.readFile(this.getMetaPath(agentId), 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  // ========== 生命周期管理 ==========

  async exists(agentId: string): Promise<boolean> {
    const fs = require('fs').promises;
    try {
      await fs.access(this.getAgentDir(agentId));
      return true;
    } catch {
      return false;
    }
  }

  async delete(agentId: string): Promise<void> {
    const fs = require('fs').promises;
    await fs.rm(this.getAgentDir(agentId), { recursive: true, force: true });
  }

  async list(prefix?: string): Promise<string[]> {
    const fs = require('fs').promises;
    try {
      const dirs = await fs.readdir(this.baseDir);
      return prefix ? dirs.filter((d: string) => d.startsWith(prefix)) : dirs;
    } catch {
      return [];
    }
  }
}
