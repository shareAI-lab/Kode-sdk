import {
  Agent,
  AgentConfig,
  AgentDependencies,
  AnthropicProvider,
  JSONStore,
  SandboxFactory,
  TemplateRegistry,
  ToolRegistry,
  builtin,
} from '../../src';
import { integrationConfig } from './config';
import path from 'node:path';
import fs from 'node:fs';

async function createDeps(workDir: string) {
  const storeDir = path.join(workDir, '.store');
  fs.rmSync(storeDir, { recursive: true, force: true });
  const store = new JSONStore(storeDir);
  const templates = new TemplateRegistry();
  const tools = new ToolRegistry();
  const sandboxFactory = new SandboxFactory();
  builtin.registerAll(tools);
  templates.register({
    id: 'integration-assistant',
    tools: ['todo_read', 'todo_write'],
  });
  const deps: AgentDependencies = {
    store,
    templateRegistry: templates,
    sandboxFactory,
    toolRegistry: tools,
    modelFactory: ({ apiKey, model, baseUrl }) =>
      new AnthropicProvider(apiKey!, model, baseUrl ?? integrationConfig.baseUrl),
  };
  return deps;
}

function createConfig(workDir: string): AgentConfig {
  return {
    templateId: 'integration-assistant',
    modelConfig: {
      provider: 'anthropic',
      apiKey: integrationConfig.apiKey,
      baseUrl: integrationConfig.baseUrl,
      model: integrationConfig.model,
    },
    sandbox: { kind: 'local', workDir, enforceBoundary: true },
  };
}

async function testChat(workDir: string) {
  const deps = await createDeps(workDir);
  const agent = await Agent.create(createConfig(workDir), deps);
  const reply = await agent.chat('请用简短一句话介绍你是谁。');
  if (!reply.text) throw new Error('empty chat reply');
  console.log('Chat response:', reply.text);
}

async function testSubscribe(workDir: string) {
  const deps = await createDeps(workDir);
  const agent = await Agent.create(createConfig(workDir), deps);
  const iterator = agent.subscribe(['progress'])[Symbol.asyncIterator]();
  await agent.send('请回复 OK');
  let received = false;
  for (let i = 0; i < 30; i++) {
    const { value } = await iterator.next();
    if (!value) break;
    if (value.event.channel === 'progress' && value.event.type === 'text_chunk') {
      received = true;
      break;
    }
    if (value.event.type === 'done') break;
  }
  if (iterator.return) await iterator.return();
  if (!received) throw new Error('subscribe did not receive text_chunk');
  console.log('Subscribe received text chunk');
}

async function run() {
  const workDir = path.join(__dirname, 'workspace');
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  await testChat(path.join(workDir, 'chat'));
  await testSubscribe(path.join(workDir, 'subscribe'));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
