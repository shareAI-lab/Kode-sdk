import { BreakpointManager } from '../../../src/core/agent/breakpoint-manager';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('BreakpointManager');

runner
  .test('记录状态变更历史并触发回调', async () => {
    const transitions: Array<{ from: string; to: string }> = [];
    const manager = new BreakpointManager((from, to) => {
      transitions.push({ from, to });
    });

    expect.toEqual(manager.getCurrent(), 'READY');

    manager.set('PRE_MODEL', 'Preparing model');
    manager.set('TOOL_EXECUTING');
    manager.set('TOOL_EXECUTING'); // no-op

    const history = Array.from(manager.getHistory());
    expect.toHaveLength(history, 2);
    expect.toEqual(history[0].state, 'PRE_MODEL');
    expect.toEqual(transitions[0].to, 'PRE_MODEL');

    manager.reset();
    expect.toEqual(manager.getCurrent(), 'READY');
    expect.toHaveLength(Array.from(manager.getHistory()), 0);
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
