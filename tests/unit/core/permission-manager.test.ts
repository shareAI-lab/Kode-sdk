import { PermissionManager } from '../../../src/core/agent/permission-manager';
import { permissionModes } from '../../../src/core/permission-modes';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('PermissionManager');

runner
  .beforeAll(() => {
    permissionModes.register('unit-test-mode', () => 'deny');
  })

  .test('deny列表优先生效', async () => {
    const manager = new PermissionManager({ mode: 'auto', denyTools: ['fs_write'] }, new Map());
    expect.toEqual(manager.evaluate('fs_write'), 'deny');
  })

  .test('allow列表会限制其他工具', async () => {
    const manager = new PermissionManager({ mode: 'auto', allowTools: ['fs_read'] }, new Map());
    expect.toEqual(manager.evaluate('fs_read'), 'allow');
    expect.toEqual(manager.evaluate('fs_write'), 'deny');
  })

  .test('requireApproval优先生效', async () => {
    const manager = new PermissionManager({ mode: 'auto', requireApprovalTools: ['fs_edit'] }, new Map());
    expect.toEqual(manager.evaluate('fs_edit'), 'ask');
  })

  .test('自定义模式可覆盖默认行为', async () => {
    const descriptors = new Map([
      ['dangerous', { name: 'dangerous', metadata: { mutates: true } } as any],
      ['readonly', { name: 'readonly', metadata: { mutates: false } } as any],
    ]);

    const manager = new PermissionManager({ mode: 'unit-test-mode' }, descriptors);
    expect.toEqual(manager.evaluate('dangerous'), 'deny');
    expect.toEqual(manager.evaluate('readonly'), 'deny');
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
