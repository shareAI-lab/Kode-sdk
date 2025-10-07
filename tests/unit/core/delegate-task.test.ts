import { builtin } from '../../../src';
import { createUnitTestAgent } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('Agent 子任务委派');

runner
  .test('delegateTask 使用 task_run 工具创建子 agent', async () => {
    const templates = [
      {
        id: 'unit-sub-writer',
        systemPrompt: '你是一个子代理，只需原样复述 prompt。',
      },
    ];

    const taskTool = builtin.task(templates);
    if (!taskTool) {
      throw new Error('无法创建 task_run 工具');
    }

    const { agent, deps, cleanup } = await createUnitTestAgent({
      customTemplate: {
        id: 'unit-main-agent',
        systemPrompt: '你可以通过 task_run 委派任务。',
        tools: ['task_run'],
      },
      registerTools: (registry) => {
        registry.register(taskTool.name, () => taskTool);
      },
      registerTemplates: (registry) => {
        registry.register(templates[0]);
      },
      mockResponses: ['主代理响应', '子代理输出'],
    });

    const result = await agent.delegateTask({
      templateId: 'unit-sub-writer',
      prompt: '请返回“子代理响应成功”',
    });

    expect.toEqual(result.status, 'ok');
    expect.toBeTruthy(result.text?.includes('子代理输出'));
    expect.toEqual(result.permissionIds?.length ?? 0, 0);

    expect.toBeTruthy(deps.templateRegistry.has('unit-sub-writer'));

    await cleanup();
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
