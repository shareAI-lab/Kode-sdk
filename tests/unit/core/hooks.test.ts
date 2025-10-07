import { HookManager } from '../../../src/core/hooks';
import { ToolContext } from '../../../src/core/types';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('Hook系统');

runner
  .test('preToolUse 返回决策可阻止执行', async () => {
    const manager = new HookManager();
    let invoked = false;

    manager.register({
      preToolUse: async (call) => {
        invoked = true;
        if (call.name === 'fs_write') {
          return { decision: 'deny', reason: 'blocked' };
        }
      },
    }, 'agent');

    const decision = await manager.runPreToolUse(
      { id: '1', name: 'fs_write', args: {}, agentId: 'demo' },
      {} as ToolContext
    );

    expect.toEqual(invoked, true);
    expect.toEqual(decision && 'decision' in decision ? decision.decision : undefined, 'deny');
  })

  .test('postToolUse 可以 update 或 replace 结果', async () => {
    const manager = new HookManager();

    manager.register({
      postToolUse: async (outcome) => ({ update: { content: `${outcome.content} [updated]` } }),
    });

    const intermediate = await manager.runPostToolUse(
      { id: '1', name: 'test', ok: true, content: 'initial' },
      {} as ToolContext
    );
    expect.toContain(intermediate.content, '[updated]');

    manager.register({
      postToolUse: async () => ({
        replace: { id: '2', name: 'test', ok: true, content: 'replaced' },
      }),
    });

    const replaced = await manager.runPostToolUse(
      intermediate,
      {} as ToolContext
    );
    expect.toEqual(replaced.content, 'replaced');
  })

  .test('链式注册按顺序触发并可检查注册信息', async () => {
    const manager = new HookManager();
    const order: string[] = [];

    manager.register({ preToolUse: async () => { order.push('first'); } }, 'agent');
    manager.register({ preToolUse: async () => { order.push('second'); return { decision: 'deny' as const }; } }, 'toolTune');

    await manager.runPreToolUse({ id: '1', name: 'noop', args: {}, agentId: 'demo' }, {} as ToolContext);
    expect.toDeepEqual(order, ['first', 'second']);

    const registered = manager.getRegistered();
    expect.toEqual(registered.length, 2);
    expect.toContain(registered[1].names.join(','), 'preToolUse');
  })

  .test('模型与消息钩子按顺序运行', async () => {
    const manager = new HookManager();
    const ledger: string[] = [];

    manager.register({
      preModel: async () => {
        ledger.push('preModel');
      },
      postModel: async () => {
        ledger.push('postModel');
      },
      messagesChanged: async () => {
        ledger.push('messagesChanged');
      },
    });

    await manager.runPreModel({});
    await manager.runPostModel({ role: 'assistant', content: [] } as any);
    await manager.runMessagesChanged({});

    expect.toDeepEqual(ledger, ['preModel', 'postModel', 'messagesChanged']);
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
