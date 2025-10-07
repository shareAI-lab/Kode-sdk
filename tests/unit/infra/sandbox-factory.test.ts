import { SandboxFactory } from '../../../src/infra/sandbox-factory';
import { LocalSandbox } from '../../../src/infra/sandbox';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('SandboxFactory');

runner
  .test('默认创建 local sandbox', async () => {
    const factory = new SandboxFactory();
    const sandbox = factory.create({ kind: 'local', workDir: process.cwd() });
    expect.toBeTruthy(sandbox instanceof LocalSandbox);
    expect.toEqual(sandbox.kind, 'local');
  })

  .test('注册自定义 sandbox', async () => {
    const factory = new SandboxFactory();
    const dummy = { kind: 'vfs' } as any;

    factory.register('vfs', () => dummy);

    const sandbox = factory.create({ kind: 'vfs' });
    expect.toEqual(sandbox, dummy);
  })

  .test('未注册类型会抛出错误', async () => {
    const factory = new SandboxFactory();

    await expect.toThrow(async () => {
      factory.create({ kind: 'k8s' } as any);
    }, 'Sandbox factory not registered: k8s');
  });

export async function run() {
  return runner.run();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
