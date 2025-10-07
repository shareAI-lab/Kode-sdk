import { TodoManager } from '../../../src/core/agent/todo-manager';
import { EventBus } from '../../../src/core/events';
import { TodoItem } from '../../../src/core/todo';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('TodoManager');

function createService(initial: TodoItem[] = []) {
  let list = [...initial];
  return {
    list: () => [...list],
    setTodos: async (todos: any[]) => {
      list = todos.map((todo) => ({ ...todo, createdAt: todo.createdAt ?? Date.now(), updatedAt: Date.now() }));
    },
    update: async (todo: any) => {
      list = list.map((item) => (item.id === todo.id ? { ...item, ...todo, updatedAt: Date.now() } : item));
    },
    delete: async (id: string) => {
      list = list.filter((item) => item.id !== id);
    },
  };
}

runner
  .test('启用Todo后可设置与更新并触发事件', async () => {
    const events = new EventBus();
    const reminders: string[] = [];
    const monitorEvents: any[] = [];

    events.onMonitor('todo_changed', (evt) => monitorEvents.push(evt));
    events.onMonitor('todo_reminder', (evt) => monitorEvents.push(evt));

    const service = createService();
    const manager = new TodoManager({
      service: service as any,
      config: { enabled: true, reminderOnStart: true, remindIntervalSteps: 2 },
      events,
      remind: (content) => reminders.push(content),
    });

    await manager.setTodos([
      { id: '1', title: 'Write tests', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
    ]);

    expect.toEqual(manager.list()[0].title, 'Write tests');
    expect.toBeGreaterThan(monitorEvents.length, 0);

    await manager.update({ id: '1', title: 'Write more tests', status: 'in_progress' });
    expect.toContain(manager.list()[0].title, 'more');

    manager.handleStartup();
    expect.toBeGreaterThan(reminders.length, 0);

    manager.onStep();
    manager.onStep();
    expect.toBeGreaterThan(monitorEvents.filter((evt) => evt.type === 'todo_reminder').length, 0);
  })

  .test('未启用Todo时操作会抛错', async () => {
    const manager = new TodoManager({
      config: { enabled: false },
      events: new EventBus(),
      remind: () => {},
    });

    expect.toHaveLength(manager.list(), 0);

    await expect.toThrow(async () => {
      await manager.setTodos([] as any);
    });

    await expect.toThrow(async () => {
      await manager.update({ id: 'missing' } as any);
    });

    await expect.toThrow(async () => {
      await manager.remove('missing');
    });
  })

  .test('todos清空时触发空提醒', async () => {
    const reminders: string[] = [];
    const service = createService([
      { id: '1', title: 'Existing', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
    ]);
    const manager = new TodoManager({
      service: service as any,
      config: { enabled: true },
      events: new EventBus(),
      remind: (text) => reminders.push(text),
    });

    await manager.remove('1');
    expect.toBeGreaterThan(reminders.length, 0);
    expect.toContain(reminders[0], 'todo 列表为空');
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
