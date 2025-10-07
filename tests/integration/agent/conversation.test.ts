/**
 * Agent对话流程集成测试
 */

import { Agent } from '../../../src/core/agent';
import { createIntegrationTestAgent, wait } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('集成测试 - Agent对话流程');

runner
  .test('多轮对话', async () => {
    const { agent, cleanup } = await createIntegrationTestAgent();

    const r1 = await agent.chat('你好，请用一句话介绍自己');
    expect.toBeTruthy(r1.text);
    console.log(`    响应1: ${r1.text?.slice(0, 60)}...`);

    const r2 = await agent.chat('2+2等于几？');
    expect.toBeTruthy(r2.text);
    console.log(`    响应2: ${r2.text?.slice(0, 60)}...`);

    const status = await agent.status();
    expect.toBeGreaterThan(status.stepCount, 1);

    await cleanup();
  })

  .test('流式响应', async () => {
    const { agent, cleanup } = await createIntegrationTestAgent();

    let chunks = 0;
    let fullText = '';

    for await (const envelope of agent.chatStream('请简单回复OK')) {
      if (envelope.event.type === 'text_chunk') {
        fullText += envelope.event.delta;
        chunks++;
      }
      if (envelope.event.type === 'done') {
        break;
      }
    }

    expect.toBeGreaterThan(chunks, 0);
    expect.toBeTruthy(fullText);
    console.log(`    收到 ${chunks} 个文本块`);

    await cleanup();
  });

runner
  .test('Resume existing agent from store', async () => {
    const { agent, cleanup, config, deps } = await createIntegrationTestAgent();

    await agent.chat('请告诉我一个随机事实');
    await wait(500);

    const resumed = await Agent.resume(agent.agentId, config, deps, { strategy: 'manual' });
    const status = await resumed.status();
    expect.toBeGreaterThan(status.stepCount, 0);

    await cleanup();
  });

export async function run() {
  return await runner.run();
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
