import { collectEvents } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';
import { IntegrationHarness } from '../../helpers/integration-harness';

const runner = new TestRunner('集成测试 - 事件系统');

runner.test('订阅 progress 与 monitor 事件', async () => {
  console.log('\n[事件测试] 测试目标:');
  console.log('  1) 验证 progress 流中包含 text_chunk 与 done 事件');
  console.log('  2) 验证 monitor 信道会广播 state_changed');

  const harness = await IntegrationHarness.create();

  const monitorEventsPromise = collectEvents(harness.getAgent(), ['monitor'], (event) => event.type === 'state_changed');

  const { events } = await harness.chatStep({
    label: '事件测试',
    prompt: '请简单自我介绍',
  });

  const progressTypes = events
    .filter((entry) => entry.channel === 'progress')
    .map((entry) => entry.event.type);

  expect.toBeGreaterThan(progressTypes.length, 0);
  expect.toBeTruthy(progressTypes.includes('text_chunk'));
  expect.toBeTruthy(progressTypes.includes('done'));

  const monitorEvents = await monitorEventsPromise;
  expect.toBeGreaterThan(monitorEvents.length, 0);

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
