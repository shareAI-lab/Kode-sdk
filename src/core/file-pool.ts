import { Sandbox } from '../infra/sandbox';

export interface FileRecord {
  path: string;
  lastRead?: number;
  lastEdit?: number;
  lastReadMtime?: number;
  lastKnownMtime?: number;
}

export interface FileFreshness {
  isFresh: boolean;
  lastRead?: number;
  lastEdit?: number;
  currentMtime?: number;
}

interface FilePoolOptions {
  watch?: boolean;
  onChange?: (event: { path: string; mtime: number }) => void;
}

export class FilePool {
  private records = new Map<string, FileRecord>();
  private watchers = new Map<string, string>();
  private readonly watchEnabled: boolean;
  private readonly onChange?: (event: { path: string; mtime: number }) => void;

  constructor(private readonly sandbox: Sandbox, opts?: FilePoolOptions) {
    this.watchEnabled = opts?.watch ?? true;
    this.onChange = opts?.onChange;
  }

  private async getMtime(path: string): Promise<number | undefined> {
    try {
      const stat = await this.sandbox.fs.stat(path);
      return stat.mtimeMs;
    } catch {
      return undefined;
    }
  }

  async recordRead(path: string): Promise<void> {
    const resolved = this.sandbox.fs.resolve(path);
    const record = this.records.get(resolved) || { path: resolved };
    record.lastRead = Date.now();
    record.lastReadMtime = await this.getMtime(resolved);
    record.lastKnownMtime = record.lastReadMtime;
    this.records.set(resolved, record);
    await this.ensureWatch(resolved);
  }

  async recordEdit(path: string): Promise<void> {
    const resolved = this.sandbox.fs.resolve(path);
    const record = this.records.get(resolved) || { path: resolved };
    record.lastEdit = Date.now();
    record.lastKnownMtime = await this.getMtime(resolved);
    this.records.set(resolved, record);
    await this.ensureWatch(resolved);
  }

  async validateWrite(path: string): Promise<FileFreshness> {
    const resolved = this.sandbox.fs.resolve(path);
    const record = this.records.get(resolved);
    const currentMtime = await this.getMtime(resolved);

    if (!record) {
      return { isFresh: true, currentMtime };
    }

    const isFresh =
      record.lastRead !== undefined &&
      (currentMtime === undefined || record.lastReadMtime === undefined || currentMtime === record.lastReadMtime);

    return {
      isFresh,
      lastRead: record.lastRead,
      lastEdit: record.lastEdit,
      currentMtime,
    };
  }

  async checkFreshness(path: string): Promise<FileFreshness> {
    const resolved = this.sandbox.fs.resolve(path);
    const record = this.records.get(resolved);
    const currentMtime = await this.getMtime(resolved);

    if (!record) {
      return { isFresh: false, currentMtime };
    }

    const isFresh =
      record.lastRead !== undefined &&
      (currentMtime === undefined || record.lastKnownMtime === undefined || currentMtime === record.lastKnownMtime);

    return {
      isFresh,
      lastRead: record.lastRead,
      lastEdit: record.lastEdit,
      currentMtime,
    };
  }

  getTrackedFiles(): string[] {
    return Array.from(this.records.keys());
  }

  private async ensureWatch(path: string) {
    if (!this.watchEnabled) return;
    if (!this.sandbox.watchFiles) return;
    if (this.watchers.has(path)) return;
    try {
      const id = await this.sandbox.watchFiles([path], (event) => {
        const record = this.records.get(path);
        if (record) {
          record.lastKnownMtime = event.mtimeMs;
        }
        this.onChange?.({ path, mtime: event.mtimeMs });
      });
      this.watchers.set(path, id);
    } catch (err) {
      // 记录 watch 失败，但不中断流程
      console.warn(`[FilePool] Failed to watch file: ${path}`, err);
    }
  }

  getAccessedFiles(): Array<{ path: string; mtime: number }> {
    return Array.from(this.records.values())
      .filter((r) => r.lastKnownMtime !== undefined)
      .map((r) => ({ path: r.path, mtime: r.lastKnownMtime! }));
  }
}
