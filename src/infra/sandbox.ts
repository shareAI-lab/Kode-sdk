export type SandboxKind = 'local' | 'docker' | 'k8s' | 'remote' | 'vfs';

export interface SandboxFS {
  resolve(path: string): string;
  isInside(path: string): boolean;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  temp(name?: string): string;
}

export interface SandboxExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Sandbox {
  kind: SandboxKind;
  workDir?: string;
  fs: SandboxFS;
  exec(cmd: string, opts?: { timeoutMs?: number }): Promise<SandboxExecResult>;
}

export class LocalSandbox implements Sandbox {
  kind: SandboxKind = 'local';
  workDir: string;
  fs: SandboxFS;

  constructor(opts: { workDir?: string; baseDir?: string; pwd?: string }) {
    // Support workDir, baseDir (deprecated), and pwd (alias) for backward compatibility
    this.workDir = require('path').resolve(opts.workDir || opts.baseDir || opts.pwd || process.cwd());
    this.fs = new LocalFS(this.workDir);
  }

  async exec(cmd: string, opts?: { timeoutMs?: number }): Promise<SandboxExecResult> {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    const timeout = opts?.timeoutMs || 120000;

    try {
      const { stdout, stderr } = await execPromise(cmd, {
        cwd: this.workDir,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { code: 0, stdout: stdout || '', stderr: stderr || '' };
    } catch (error: any) {
      return {
        code: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
      };
    }
  }

  static local(opts: { workDir?: string; baseDir?: string; pwd?: string }): LocalSandbox {
    return new LocalSandbox(opts);
  }
}

class LocalFS implements SandboxFS {
  constructor(private workDir: string) {}

  resolve(p: string): string {
    const path = require('path');
    if (path.isAbsolute(p)) return p;
    return path.resolve(this.workDir, p);
  }

  isInside(p: string): boolean {
    const path = require('path');
    const resolved = this.resolve(p);
    const relative = path.relative(this.workDir, resolved);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  async read(p: string): Promise<string> {
    const fs = require('fs').promises;
    const resolved = this.resolve(p);
    if (!this.isInside(resolved)) {
      throw new Error(`Path outside sandbox: ${p}`);
    }
    return await fs.readFile(resolved, 'utf-8');
  }

  async write(p: string, content: string): Promise<void> {
    const fs = require('fs').promises;
    const path = require('path');
    const resolved = this.resolve(p);
    if (!this.isInside(resolved)) {
      throw new Error(`Path outside sandbox: ${p}`);
    }
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  temp(name?: string): string {
    const path = require('path');
    const tempName = name || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return path.relative(this.workDir, path.join(this.workDir, '.temp', tempName));
  }
}
