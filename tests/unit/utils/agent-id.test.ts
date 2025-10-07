import { generateAgentId } from '../../../src/utils/agent-id';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('AgentId');

runner
  .test('生成的AgentId唯一且包含时间戳', async () => {
    const id1 = generateAgentId();
    const id2 = generateAgentId();
    expect.toEqual(id1 !== id2, true);
    expect.toContain(id1, ':');
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
