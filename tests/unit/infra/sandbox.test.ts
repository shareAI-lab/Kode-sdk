import fs from 'fs';
import path from 'path';
import { LocalSandbox } from '../../../src/infra/sandbox';
import { TestRunner, expect } from '../../helpers/utils';
import { TEST_ROOT } from '../../helpers/fixtures';

const runner = new TestRunner('LocalSandbox');

function tempDir(name: string) {
  const dir = path.join(TEST_ROOT, 'sandbox', `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

runner
  .test('读写文件并强制边界', async () => {
    const dir = tempDir('fs');
    const sandbox = new LocalSandbox({ workDir: dir, enforceBoundary: true });

    await sandbox.fs.write('notes.txt', 'hello');
    const content = await sandbox.fs.read('notes.txt');
    expect.toEqual(content, 'hello');

    await expect.toThrow(async () => {
      await sandbox.fs.read('../outside.txt');
    });
  })

  .test('exec 阻止危险命令并允许安全命令', async () => {
    const dir = tempDir('exec');
    const sandbox = new LocalSandbox({ workDir: dir });

    const safe = await sandbox.exec('echo test');
    expect.toContain(safe.stdout.trim(), 'test');
    expect.toEqual(safe.code, 0);

    const blocked = await sandbox.exec('rm -rf /');
    expect.toEqual(blocked.code, 1);
    expect.toContain(blocked.stderr, 'Dangerous command');
  })

  .test('watchFiles 返回ID并可取消', async () => {
    const dir = tempDir('watch');
    const sandbox = new LocalSandbox({ workDir: dir, watchFiles: true });
    const file = path.join(dir, 'file.txt');
    fs.writeFileSync(file, 'content');

    const events: number[] = [];
    const id = await sandbox.watchFiles(['file.txt'], (evt) => {
      events.push(evt.mtimeMs);
    });

    fs.writeFileSync(file, 'updated');
    await new Promise((resolve) => setTimeout(resolve, 20));
    sandbox.unwatchFiles?.(id);
    expect.toBeGreaterThan(events.length, 0);

    await sandbox.dispose?.();
  });

export async function run() {
  return await runner.run();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
