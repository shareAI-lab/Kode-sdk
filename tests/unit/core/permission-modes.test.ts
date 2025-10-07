import { permissionModes, PermissionModeRegistry } from '../../../src/core/permission-modes';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('Permission Modes');

runner
  .test('可注册自定义模式并序列化', async () => {
    const registry = new PermissionModeRegistry();
    registry.register('auto', () => 'allow', true);
    registry.register('custom', () => 'deny');

    const serialized = registry.serialize();
    expect.toEqual(serialized.length, 2);
    const custom = serialized.find((mode) => mode.name === 'custom');
    expect.toEqual(custom?.builtIn, false);
  })

  .test('validateRestore 可检测缺失模式', async () => {
    const registry = new PermissionModeRegistry();
    registry.register('auto', () => 'allow', true);
    const missing = registry.validateRestore([
      { name: 'auto', builtIn: true },
      { name: 'custom', builtIn: false },
    ]);
    expect.toDeepEqual(missing, ['custom']);
  })

  .test('全局registry包含内置模式', async () => {
    const list = permissionModes.list();
    expect.toContain(list.join(','), 'auto');
    expect.toContain(list.join(','), 'readonly');
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
