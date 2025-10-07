import path from 'path';
import fs from 'fs';
import { createUnitTestAgent, collectEvents } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('E2E - 长时运行流程');

runner
  .test('Todo、事件与快照协同工作', async () => {
    const { agent, cleanup, storeDir } = await createUnitTestAgent({
      enableTodo: true,
      mockResponses: ['First turn', 'Second turn', 'Final response'],
    });

    const monitorEventsPromise = collectEvents(agent, ['monitor'], (event) => event.type === 'todo_reminder');

    await agent.setTodos([{ id: 't1', title: '撰写测试', status: 'pending' }]);
    await agent.chat('开始任务');
    await agent.chat('继续执行');

    const todos = agent.getTodos();
    expect.toEqual(todos.length, 1);

    const reminderEvents = await monitorEventsPromise;
    expect.toBeGreaterThan(reminderEvents.length, 0);

    await agent.updateTodo({ id: 't1', title: '撰写测试', status: 'completed' });
    await agent.deleteTodo('t1');

    const snapshotId = await agent.snapshot();
    expect.toBeTruthy(snapshotId);

    const snapshotPath = path.join(storeDir, agent.agentId, 'snapshots', `${snapshotId}.json`);
    expect.toEqual(fs.existsSync(snapshotPath), true);

    await cleanup();
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
