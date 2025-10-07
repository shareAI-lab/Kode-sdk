import './helpers/env-setup';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';

import {
  Agent,
  AgentConfig,
  AgentDependencies,
  JSONStore,
  SandboxFactory,
  TemplateRegistry,
  ToolRegistry,
  builtin,
  FsWrite,
  FsRead,
  FsEdit,
  FsGlob,
  FsGrep,
  LocalSandbox,
} from '../src';
import { MockProvider } from './mock-provider';
import { ToolContext, ReminderOptions } from '../src/core/types';
import { MessageQueue } from '../src/core/agent/message-queue';
import { TodoManager } from '../src/core/agent/todo-manager';
import { TodoService } from '../src/core/todo';
import { EventBus } from '../src/core/events';

const tmpRoot = path.join(__dirname, 'tmp');

function ensureCleanDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function createAgent(script: string[]) {
  const workdir = path.join(tmpRoot, 'workspace');
  ensureCleanDir(workdir);
  const storeDir = path.join(tmpRoot, 'store');
  ensureCleanDir(storeDir);

  const store = new JSONStore(storeDir);
  const templates = new TemplateRegistry();
  const tools = new ToolRegistry();
  const sandboxFactory = new SandboxFactory();

  builtin.registerAll(tools);

  templates.register({
    id: 'demo',
    tools: ['fs_read', 'fs_write', 'fs_edit', 'fs_glob', 'fs_grep', 'fs_multi_edit', 'todo_read', 'todo_write'],
    runtime: {
      todo: { enabled: true, remindIntervalSteps: 5, reminderOnStart: false },
    },
  });

  const deps: AgentDependencies = {
    store,
    templateRegistry: templates,
    sandboxFactory,
    toolRegistry: tools,
    modelFactory: (cfg) => (cfg.provider === 'mock' ? new MockProvider([{ text: 'resumed' }]) : new MockProvider([{ text: 'resumed' }])),
  };

  const config: AgentConfig = {
    templateId: 'demo',
    model: new MockProvider(script.map((text) => ({ text }))),
    sandbox: { kind: 'local', workDir: workdir, enforceBoundary: true },
    tools: ['fs_read', 'fs_write', 'fs_edit', 'fs_glob', 'fs_grep', 'fs_multi_edit', 'todo_read', 'todo_write'],
  };

  const agent = await Agent.create(config, deps);
  return { agent, deps, config };
}

async function testChat() {
  const { agent } = await createAgent(['测试响应']);
  const result = await agent.chat('你好');
  assert.strictEqual(result.status, 'ok');
  assert.ok(result.text?.includes('测试响应'));
}

async function testResume() {
  const { agent, deps } = await createAgent(['first']);
  await agent.chat('hello');
  const snapshotId = await agent.snapshot();
  const storeId = agent.agentId;

  const resumed = await Agent.resumeFromStore(storeId, deps, { strategy: 'manual' });
  assert.strictEqual((await resumed.status()).agentId, storeId);
  await resumed.fork(snapshotId);
}

async function testTodoEvents() {
  const { agent } = await createAgent(['todo']);
  const monitor = agent.subscribe(['monitor']);

  const iterator = monitor[Symbol.asyncIterator]();
  await agent.setTodos([{ id: 't1', title: '完成测试', status: 'pending' }]);

  await new Promise((resolve) => setTimeout(resolve, 0));

  let todoEventReceived = false;
  for (let i = 0; i < 10; i++) {
    const { value } = await iterator.next();
    if (value?.event.type === 'todo_changed') {
      todoEventReceived = true;
      break;
    }
  }
  if (iterator.return) await iterator.return();
  assert.ok(todoEventReceived, 'todo_changed monitor event expected');
}

async function testFsTools() {
  const workdir = path.join(tmpRoot, 'fs');
  ensureCleanDir(workdir);
  const sandbox = new LocalSandbox({ workDir: workdir });
  const context: ToolContext = {
    agentId: 'fs-test',
    sandbox,
    agent: { setTodos: () => Promise.resolve() },
    services: {
      filePool: undefined,
    },
  } as any;

  const writer = new FsWrite();
  const writeResult = await writer.exec({ path: 'file.txt', content: 'hello' }, context);
  assert.strictEqual(writeResult.ok, true, 'fs_write ok');

  const reader = new FsRead();
  const readResult = await reader.exec({ path: 'file.txt' }, context);
  assert.ok(readResult.content.includes('hello'), 'fs_read content');

  const editor = new FsEdit();
  const editResult = await editor.exec({ path: 'file.txt', old_string: 'hello', new_string: 'world' }, context);
  assert.strictEqual(editResult.replacements, 1, 'fs_edit replacements');

  const globber = new FsGlob();
  const globResult = await globber.exec({ pattern: '**/*.txt' }, context);
  assert.ok(globResult.matches.includes('file.txt'), `glob matches: ${globResult.matches}`);

  const grepper = new FsGrep();
  const grepResult = await grepper.exec({ pattern: 'world', path: '**/*.txt' }, context);
  assert.ok(grepResult.matches.length >= 1, 'grep found results');

  // multi-edit 工具在单元测试中仅验证模块可加载，详细逻辑由集成测试覆盖
}

async function testMessageQueue() {
  const added: Array<{ text: string; kind: string }> = [];
  let persisted = false;
  let ensured = false;
  const queue = new MessageQueue({
    wrapReminder: (content: string) => `<reminder>${content}</reminder>`,
    addMessage: (message, kind) => {
      added.push({ text: (message.content[0] as any).text, kind });
    },
    persist: async () => {
      persisted = true;
    },
    ensureProcessing: () => {
      ensured = true;
    },
  });

  queue.send('用户消息');
  queue.send('提醒内容', { kind: 'reminder' });

  await queue.flush();
  assert.strictEqual(added.length, 2, 'messages flushed');
  assert.ok(ensured, 'user message triggers processing');
  assert.ok(persisted, 'flush persisted');
  assert.ok(added[1].text.includes('<reminder>提醒内容'), 'reminder wrapped');
}

async function testTodoManager() {
  const store: any = {
    async saveTodos() {},
    async loadTodos() { return undefined; },
  };
  const service = new TodoService(store, 'agent');
  const events = new EventBus();
  const reminders: string[] = [];
  let changed = 0;
  let reminded = 0;
  events.onMonitor('todo_changed', () => changed++);
  events.onMonitor('todo_reminder', () => reminded++);

  const manager = new TodoManager({
    service,
    config: { enabled: true, remindIntervalSteps: 1, reminderOnStart: false },
    events,
    remind: (content) => reminders.push(content),
  });

  await manager.setTodos([{ id: 'a', title: '任务', status: 'pending' }]);
  assert.strictEqual(changed, 1, 'todo_changed emitted');

  manager.onStep();
  assert.ok(reminders.length >= 1, 'todo reminder triggered');
  assert.ok(reminded >= 1, 'todo_reminder event emitted');
}

async function run() {
  ensureCleanDir(tmpRoot);

  const tests: Array<[string, () => Promise<void>]> = [
    ['chat returns response', testChat],
    ['resume and fork', testResume],
    ['todo events', testTodoEvents],
    ['filesystem tools', testFsTools],
    ['message queue', testMessageQueue],
    ['todo manager', testTodoManager],
  ];

  for (const [name, fn] of tests) {
    process.stdout.write(`• ${name}... `);
    await fn();
    console.log('OK');
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
