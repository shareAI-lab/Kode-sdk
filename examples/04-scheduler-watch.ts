import './shared/load-env';

import {
  Agent,
  MonitorFileChangedEvent,
  MonitorTodoReminderEvent,
} from '../src';
import { createRuntime } from './shared/runtime';

async function main() {
  const modelId = process.env.ANTHROPIC_MODEL_ID || 'claude-sonnet-4.5-20250929';

  const deps = createRuntime(({ templates, registerBuiltin }) => {
    registerBuiltin('fs', 'todo');

    templates.register({
      id: 'watcher',
      systemPrompt: 'You are an operations engineer. Monitor files and summarize progress regularly.',
      tools: ['fs_read', 'fs_write', 'fs_glob', 'todo_read', 'todo_write'],
      model: modelId,
      runtime: {
        todo: { enabled: true, reminderOnStart: true, remindIntervalSteps: 10 },
        metadata: { exposeThinking: false },
      },
    });
  });

  const agent = await Agent.create(
    {
      templateId: 'watcher',
      sandbox: { kind: 'local', workDir: './workspace', enforceBoundary: true, watchFiles: true },
    },
    deps
  );

  const scheduler = agent.schedule();

  scheduler.everySteps(2, async ({ stepCount }) => {
    console.log('[scheduler] remind at step', stepCount);
    await agent.send('系统提醒：请总结当前任务进度并更新时间线。', { kind: 'reminder' });
  });

  agent.on('file_changed', (event: MonitorFileChangedEvent) => {
    console.log('[monitor:file_changed]', event.path, new Date(event.mtime).toISOString());
  });

  agent.on('todo_reminder', (event: MonitorTodoReminderEvent) => {
    console.log('[monitor:todo_reminder]', event.reason);
  });

  // 触发几个对话步骤以演示 scheduler
  await agent.send('请列出 README 中所有与事件驱动相关的章节。');
  await agent.send('根据刚才的输出，更新 todo 列表并加上到期时间。');
  await agent.send('监控 docs/ 目录变化，如果 README 被修改请提醒。');

  console.log('Scheduler demo completed. You can继续修改 workspace 文件观察 file_changed 事件。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
