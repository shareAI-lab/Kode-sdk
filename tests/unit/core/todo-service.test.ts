import { TodoService, TodoItem } from '../../../src/core/todo';
import { TestRunner, expect } from '../../helpers/utils';

class StoreStub {
  public saved: any | undefined;
  async saveTodos(agentId: string, snapshot: any): Promise<void> {
    this.saved = snapshot;
  }
  async loadTodos(agentId: string): Promise<any | undefined> {
    return this.saved;
  }
}

const runner = new TestRunner('TodoService');

runner
  .test('创建与更新Todo保持约束', async () => {
    const store = new StoreStub();
    const service = new TodoService(store as any, 'agent-1');

    await service.setTodos([
      { id: '1', title: 'Write docs', status: 'pending' },
    ]);

    let todos = service.list();
    expect.toEqual(todos.length, 1);
    expect.toEqual(todos[0].title, 'Write docs');

    await service.update({ id: '1', title: 'Write docs now', status: 'in_progress' });
    todos = service.list();
    expect.toEqual(todos[0].status, 'in_progress');

    await service.delete('1');
    expect.toEqual(service.list().length, 0);
  })

  .test('超过一个in_progress会抛错', async () => {
    const store = new StoreStub();
    const service = new TodoService(store as any, 'agent-1');

    await expect.toThrow(async () => {
      await service.setTodos([
        { id: '1', title: 'Task A', status: 'in_progress' },
        { id: '2', title: 'Task B', status: 'in_progress' },
      ]);
    });
  })

  .test('重复ID会被拒绝', async () => {
    const store = new StoreStub();
    const service = new TodoService(store as any, 'agent-1');

    await expect.toThrow(async () => {
      await service.setTodos([
        { id: '1', title: 'Task', status: 'pending' },
        { id: '1', title: 'Task 2', status: 'pending' },
      ]);
    });
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
