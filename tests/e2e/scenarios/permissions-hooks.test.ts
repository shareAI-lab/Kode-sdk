import fs from 'fs';
import path from 'path';
import { PermissionManager } from '../../../src/core/agent/permission-manager';
import { HookManager } from '../../../src/core/hooks';
import { LocalSandbox } from '../../../src/infra/sandbox';
import { FilePool } from '../../../src/core/file-pool';
import { FsWrite } from '../../../src/tools/fs_write';
import { ToolContext } from '../../../src/core/types';
import { TestRunner, expect } from '../../helpers/utils';
import { TEST_ROOT } from '../../helpers/fixtures';

const runner = new TestRunner('E2E - 权限与Hook');

function tempDir(name: string) {
  const dir = path.join(TEST_ROOT, 'e2e-permissions', `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

runner
  .test('权限审批与hook阻断写入', async () => {
    const dir = tempDir('hooks');
    const sandbox = new LocalSandbox({ workDir: dir, watchFiles: false });
    const filePool = new FilePool(sandbox, { watch: false });

    const permissionManager = new PermissionManager(
      { mode: 'auto', requireApprovalTools: ['fs_write'] },
      new Map([
        ['fs_write', FsWrite.toDescriptor()],
      ])
    );

    const hookManager = new HookManager();
    hookManager.register({
      preToolUse: async (call) => {
        if (call.args?.path?.includes('blocked')) {
          return { decision: 'deny', reason: '路径受保护' };
        }
      },
    });

    const baseContext: ToolContext = {
      agentId: 'agent-e2e',
      agent: {},
      sandbox,
      services: { filePool },
    };

    const permissionDecision = permissionManager.evaluate('fs_write');
    expect.toEqual(permissionDecision, 'ask');

    const allowedDecision = await hookManager.runPreToolUse(
      { id: 'call-1', name: 'fs_write', args: { path: 'note.txt' }, agentId: 'agent-e2e' } as any,
      baseContext
    );
    expect.toEqual(allowedDecision, undefined);

    const result = await FsWrite.exec({ path: 'note.txt', content: 'hello' }, baseContext);
    expect.toEqual(result.ok, true);

    const blockedDecision = await hookManager.runPreToolUse(
      { id: 'call-2', name: 'fs_write', args: { path: 'blocked.txt' }, agentId: 'agent-e2e' } as any,
      baseContext
    );
    expect.toEqual(blockedDecision && 'decision' in blockedDecision ? blockedDecision.decision : undefined, 'deny');

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
