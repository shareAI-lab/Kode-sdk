/**
 * Pool和Room完整测试
 */

import path from 'path';
import {
  AgentPool,
  Room,
  JSONStore,
  SandboxFactory,
  AgentTemplateRegistry,
  ToolRegistry,
  builtin,
} from '../../../src';
import { MockProvider } from '../../mock-provider';
import { ensureCleanDir } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';
import { TEST_ROOT } from '../../helpers/fixtures';

const runner = new TestRunner('Pool和Room系统');

async function createPoolDeps(storeDir: string) {
  ensureCleanDir(storeDir);
  const store = new JSONStore(storeDir);
  const templates = new AgentTemplateRegistry();
  const tools = new ToolRegistry();
  const sandboxFactory = new SandboxFactory();

  const builtinTools = [...builtin.fs(), ...builtin.bash(), ...builtin.todo()].filter(Boolean);
  for (const toolInstance of builtinTools) {
    tools.register(toolInstance.name, () => toolInstance);
  }
  templates.register({
    id: 'test-agent',
    systemPrompt: 'You are cooperative.',
    tools: ['fs_read', 'fs_write'],
  });

  return {
    store,
    templateRegistry: templates,
    sandboxFactory,
    toolRegistry: tools,
    modelFactory: () => new MockProvider([{ text: 'response' }]),
  };
}

runner
  .test('Pool - 创建和获取Agent', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'pool-create'));
    const pool = new AgentPool({ dependencies: deps, maxAgents: 5 });

    const agent = await pool.create('agent-1', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work') },
    });

    expect.toEqual(agent.agentId, 'agent-1');
    expect.toEqual(pool.size(), 1);

    const retrieved = pool.get('agent-1');
    expect.toEqual(retrieved?.agentId, 'agent-1');
  })

  .test('Pool - 容量限制', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'pool-limit'));
    const pool = new AgentPool({ dependencies: deps, maxAgents: 2 });

    await pool.create('agent-1', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work-1') },
    });

    await pool.create('agent-2', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work-2') },
    });

    expect.toEqual(pool.size(), 2);

    await expect.toThrow(async () => {
      await pool.create('agent-3', {
        templateId: 'test-agent',
        sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work-3') },
      });
    }, 'Pool is full');
  })

  .test('Pool - 删除Agent', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'pool-delete'));
    const pool = new AgentPool({ dependencies: deps });

    await pool.create('agent-1', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work') },
    });

    expect.toEqual(pool.size(), 1);

    await pool.delete('agent-1');

    expect.toEqual(pool.size(), 0);
    expect.toEqual(pool.get('agent-1'), undefined);
  })

  .test('Pool - Resume已有Agent', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'pool-resume'));
    const pool = new AgentPool({ dependencies: deps });

    const agent = await pool.create('agent-1', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work') },
    });

    await agent.chat('test message');

    // 模拟重启，重新resume
    const pool2 = new AgentPool({ dependencies: deps });
    const resumed = await pool2.resume('agent-1', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'pool-work') },
    });

    const status = await resumed.status();
    expect.toBeGreaterThan(status.stepCount, 0);
  })

  .test('Room - 成员加入和离开', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'room-members'));
    const pool = new AgentPool({ dependencies: deps });
    const room = new Room(pool);

    const alice = await pool.create('alice', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-alice') },
    });

    const bob = await pool.create('bob', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-bob') },
    });

    room.join('Alice', alice.agentId);
    room.join('Bob', bob.agentId);

    const members = room.getMembers();
    expect.toHaveLength(members, 2);
    expect.toBeTruthy(members.some(m => m.name === 'Alice'));
    expect.toBeTruthy(members.some(m => m.name === 'Bob'));

    room.leave('Alice');
    const remaining = room.getMembers();
    expect.toHaveLength(remaining, 1);
    expect.toEqual(remaining[0].name, 'Bob');
  })

  .test('Room - 广播消息', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'room-broadcast'));
    const pool = new AgentPool({ dependencies: deps });
    const room = new Room(pool);

    const alice = await pool.create('alice', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-alice') },
    });

    const bob = await pool.create('bob', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-bob') },
    });

    room.join('Alice', alice.agentId);
    room.join('Bob', bob.agentId);

    await room.say('Alice', 'Hello everyone');

    const bobStatus = await bob.status();
    expect.toBeGreaterThan(bobStatus.stepCount, 0);

    const aliceStatus = await alice.status();
    // Alice不应该收到自己的消息
    expect.toEqual(aliceStatus.stepCount, 0);
  })

  .test('Room - @mention定向消息', async () => {
    const deps = await createPoolDeps(path.join(TEST_ROOT, 'room-mention'));
    const pool = new AgentPool({ dependencies: deps });
    const room = new Room(pool);

    const alice = await pool.create('alice', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-alice') },
    });

    const bob = await pool.create('bob', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-bob') },
    });

    const charlie = await pool.create('charlie', {
      templateId: 'test-agent',
      sandbox: { kind: 'local', workDir: path.join(TEST_ROOT, 'room-charlie') },
    });

    room.join('Alice', alice.agentId);
    room.join('Bob', bob.agentId);
    room.join('Charlie', charlie.agentId);

    // Alice向Bob发送定向消息
    await room.say('Alice', 'Hello @Bob');

    const bobStatus = await bob.status();
    expect.toBeGreaterThan(bobStatus.stepCount, 0);

    // Charlie不应该收到消息
    const charlieStatus = await charlie.status();
    expect.toEqual(charlieStatus.stepCount, 0);
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
