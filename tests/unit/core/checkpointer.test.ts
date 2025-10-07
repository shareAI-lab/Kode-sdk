import { MemoryCheckpointer, Checkpoint } from '../../../src/core/checkpointer';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('Checkpointer');

const baseCheckpoint: Checkpoint = {
  id: 'cp-1',
  agentId: 'agent-1',
  timestamp: Date.now(),
  version: '1',
  state: { status: 'ready', stepCount: 0, lastSfpIndex: -1 },
  messages: [],
  toolRecords: [],
  tools: [],
  config: { model: 'mock' },
  metadata: {},
};

runner
  .test('保存、加载、列出和删除', async () => {
    const cp = new MemoryCheckpointer();
    await cp.save(baseCheckpoint);

    const loaded = await cp.load('cp-1');
    expect.toBeTruthy(loaded);

    const list = await cp.list('agent-1');
    expect.toEqual(list.length, 1);

    await cp.delete('cp-1');
    expect.toBeTruthy(await cp.load('cp-1') === null);
  })

  .test('fork 创建新快照', async () => {
    const cp = new MemoryCheckpointer();
    await cp.save(baseCheckpoint);

    const forkId = await cp.fork('cp-1', 'agent-2');
    expect.toBeTruthy(forkId);

    const list = await cp.list('agent-2');
    expect.toEqual(list.length, 1);
    expect.toContain(list[0].id, 'agent-2');
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
