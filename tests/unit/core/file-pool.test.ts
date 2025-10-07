import fs from 'fs';
import path from 'path';
import { FilePool } from '../../../src/core/file-pool';
import { LocalSandbox } from '../../../src/infra/sandbox';
import { TestRunner, expect } from '../../helpers/utils';
import { TEST_ROOT } from '../../helpers/fixtures';

const runner = new TestRunner('FilePool');

function createTempDir(name: string): string {
  const dir = path.join(TEST_ROOT, 'file-pool', `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

runner
  .test('记录读写并追踪新鲜度', async () => {
    const dir = createTempDir('freshness');
    const filePath = path.join(dir, 'note.txt');
    fs.writeFileSync(filePath, 'initial');

    const sandbox = new LocalSandbox({ workDir: dir, enforceBoundary: true, watchFiles: false });
    const pool = new FilePool(sandbox, { watch: false });

    await pool.recordRead('note.txt');
    const firstCheck = await pool.validateWrite('note.txt');
    expect.toEqual(firstCheck.isFresh, true);

    fs.writeFileSync(filePath, 'updated');
    const freshness = await pool.validateWrite('note.txt');
    expect.toEqual(freshness.isFresh, false);

    await pool.recordEdit('note.txt');
    const tracked = pool.getTrackedFiles();
    expect.toHaveLength(tracked, 1);

    const summary = pool.getAccessedFiles();
    expect.toHaveLength(summary, 1);
  })

  .test('记录后若无访问返回默认新鲜度', async () => {
    const dir = createTempDir('default');
    const sandbox = new LocalSandbox({ workDir: dir, enforceBoundary: true, watchFiles: false });
    const pool = new FilePool(sandbox, { watch: false });

    const status = await pool.checkFreshness('missing.txt');
    expect.toEqual(status.isFresh, false);
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
