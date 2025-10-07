import fs from 'fs';
import path from 'path';

import { collectEvents } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';
import { IntegrationHarness } from '../../helpers/integration-harness';

const runner = new TestRunner('集成测试 - Progress 事件');

runner.test('工具执行产生 tool:start / tool:end 事件', async () => {
  console.log('\n[Progress事件测试] 测试目标:');
  console.log('  1) 验证文件写入工具会触发 tool:start / tool:end');
  console.log('  2) 确认实际文件内容被修改');

  const harness = await IntegrationHarness.create({
    customTemplate: {
      id: 'integration-progress-events',
      systemPrompt: 'When editing files, always call the appropriate filesystem tools and confirm completion.',
      tools: ['fs_write', 'fs_edit'],
    },
  });

  const workDir = harness.getWorkDir();
  expect.toBeTruthy(workDir, '工作目录未初始化');
  const filePath = path.join(workDir!, 'progress-test.txt');
  fs.writeFileSync(filePath, '初始内容');

  const progressEventsPromise = collectEvents(harness.getAgent(), ['progress'], (event) => event.type === 'done');

  await harness.chatStep({
    label: 'Progress事件测试',
    prompt: '请把 progress-test.txt 的内容替换为 “已通过工具编辑”。只使用工具，不要直接回答。',
    expectation: {
      includes: ['已通过工具编辑'],
    },
  });

  const events = await progressEventsPromise as any[];
  const types = events.map((e: any) => e.type);

  expect.toBeTruthy(types.includes('tool:start'));
  expect.toBeTruthy(types.includes('tool:end'));

  const content = fs.readFileSync(filePath, 'utf-8');
  expect.toContain(content, '已通过工具编辑');

  await harness.cleanup();
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
