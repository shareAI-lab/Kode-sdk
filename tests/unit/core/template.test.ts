import { AgentTemplateRegistry } from '../../../src/core/template';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('模板系统');

const SAMPLE_TEMPLATE = {
  id: 'unit-template',
  systemPrompt: 'You are a tester.',
  tools: ['fs_read'],
};

runner
  .test('注册与读取模板', async () => {
    const registry = new AgentTemplateRegistry();
    registry.register(SAMPLE_TEMPLATE);

    expect.toEqual(registry.has('unit-template'), true);
    const fetched = registry.get('unit-template');
    expect.toEqual(fetched.systemPrompt, 'You are a tester.');

    const listed = registry.list();
    expect.toEqual(listed.length, 1);
  })

  .test('批量注册并校验空Prompt会报错', async () => {
    const registry = new AgentTemplateRegistry();
    await expect.toThrow(async () => {
      registry.register({ id: 'invalid', systemPrompt: '   ' });
    });

    registry.bulkRegister([
      { id: 'a', systemPrompt: 'Prompt A' },
      { id: 'b', systemPrompt: 'Prompt B' },
    ]);

    expect.toEqual(registry.list().length, 2);
  })

  .test('获取不存在模板时抛出错误', async () => {
    const registry = new AgentTemplateRegistry();
    await expect.toThrow(async () => {
      registry.get('missing');
    });
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
