import './shared/load-env';

import {
  Agent,
} from '../src';
import { createRuntime } from './shared/runtime';

async function main() {
  const modelId = process.env.ANTHROPIC_MODEL_ID || 'claude-sonnet-4.5-20250929';

  const deps = createRuntime(({ templates, registerBuiltin }) => {
    registerBuiltin('todo');
    templates.register({
      id: 'hello-assistant',
      systemPrompt: 'You are a helpful engineer. Keep answers short.',
      tools: ['todo_read', 'todo_write'],
      model: modelId,
      runtime: { todo: { enabled: true, reminderOnStart: true } },
    });
  });

  const agent = await Agent.create(
    {
      templateId: 'hello-assistant',
      sandbox: { kind: 'local', workDir: './workspace', enforceBoundary: true },
    },
    deps
  );

  (async () => {
    for await (const envelope of agent.subscribe(['progress'])) {
      if (envelope.event.type === 'text_chunk') {
        process.stdout.write(envelope.event.delta);
      }
      if (envelope.event.type === 'done') {
        console.log('\n--- conversation complete ---');
        break;
      }
    }
  })();

  await agent.send('你好！帮我总结下这个仓库的核心能力。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
