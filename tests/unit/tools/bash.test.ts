import { LocalSandbox } from '../../../src/infra/sandbox';
import { BashRun } from '../../../src/tools/bash_run';
import { BashLogs } from '../../../src/tools/bash_logs';
import { BashKill } from '../../../src/tools/bash_kill';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('Bash工具');

function createContext() {
  const sandbox = new LocalSandbox({ workDir: process.cwd() });
  return { agentId: 'agent', agent: {}, sandbox } as any;
}

runner
  .test('同步执行命令返回输出', async () => {
    const ctx = createContext();
    const result = await BashRun.exec({ cmd: 'echo sync-test' }, ctx);
    expect.toEqual(result.background, false);
    expect.toContain(result.output, 'sync-test');
  })

  .test('后台执行可通过logs和kill管理', async () => {
    const ctx = createContext();
    const run = await BashRun.exec({ cmd: 'echo background-test', background: true }, ctx);
    expect.toEqual(run.background, true);
    const shellId = run.shell_id;

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = await BashLogs.exec({ shell_id: shellId }, ctx);
    expect.toEqual(logs.ok, true);
    expect.toContain(logs.output, 'background-test');

    const kill = await BashKill.exec({ shell_id: shellId }, ctx);
    expect.toEqual(kill.ok, true);

    const missing = await BashLogs.exec({ shell_id: shellId }, ctx);
    expect.toEqual(missing.ok, false);
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
