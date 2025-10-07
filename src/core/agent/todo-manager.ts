import { TodoService, TodoInput, TodoItem } from '../todo';
import { TodoConfig } from '../template';
import { ReminderOptions } from '../types';
import { EventBus } from '../events';

export interface TodoManagerOptions {
  service?: TodoService;
  config?: TodoConfig;
  events: EventBus;
  remind: (content: string, options?: ReminderOptions) => void;
}

export class TodoManager {
  private stepsSinceReminder = 0;

  constructor(private readonly opts: TodoManagerOptions) {}

  get enabled(): boolean {
    return !!this.opts.service && !!this.opts.config?.enabled;
  }

  list(): TodoItem[] {
    return this.opts.service ? this.opts.service.list() : [];
  }

  async setTodos(todos: TodoInput[]): Promise<void> {
    if (!this.opts.service) throw new Error('Todo service not enabled for this agent');
    const prev = this.opts.service.list();
    await this.opts.service.setTodos(todos);
    this.publishChange(prev, this.opts.service.list());
  }

  async update(todo: TodoInput): Promise<void> {
    if (!this.opts.service) throw new Error('Todo service not enabled for this agent');
    const prev = this.opts.service.list();
    await this.opts.service.update(todo);
    this.publishChange(prev, this.opts.service.list());
  }

  async remove(id: string): Promise<void> {
    if (!this.opts.service) throw new Error('Todo service not enabled for this agent');
    const prev = this.opts.service.list();
    await this.opts.service.delete(id);
    this.publishChange(prev, this.opts.service.list());
  }

  handleStartup(): void {
    if (!this.enabled || !this.opts.config?.reminderOnStart) return;
    const todos = this.list().filter((todo) => todo.status !== 'completed');
    if (todos.length === 0) {
      this.sendEmptyReminder();
    } else {
      this.sendReminder(todos, 'startup');
    }
  }

  onStep(): void {
    if (!this.enabled) return;
    if (!this.opts.config?.remindIntervalSteps) return;
    if (this.opts.config.remindIntervalSteps <= 0) return;
    this.stepsSinceReminder += 1;
    if (this.stepsSinceReminder < this.opts.config.remindIntervalSteps) return;
    const todos = this.list().filter((todo) => todo.status !== 'completed');
    if (todos.length === 0) return;
    this.sendReminder(todos, 'interval');
  }

  private publishChange(previous: TodoItem[], current: TodoItem[]): void {
    if (!this.opts.events) return;
    this.stepsSinceReminder = 0;
    this.opts.events.emitMonitor({ channel: 'monitor', type: 'todo_changed', previous, current });
    if (current.length === 0) {
      this.sendEmptyReminder();
    }
  }

  private sendReminder(todos: TodoItem[], reason: string) {
    this.stepsSinceReminder = 0;
    this.opts.events.emitMonitor({ channel: 'monitor', type: 'todo_reminder', todos, reason });
    this.opts.remind(this.formatTodoReminder(todos), { category: 'todo', priority: 'medium' });
  }

  private sendEmptyReminder() {
    this.opts.remind('当前 todo 列表为空，如需跟踪任务请使用 todo_write 建立清单。', {
      category: 'todo',
      priority: 'low',
    });
  }

  private formatTodoReminder(todos: TodoItem[]): string {
    const bulletList = todos
      .slice(0, 10)
      .map((todo, index) => `${index + 1}. [${todo.status}] ${todo.title}`)
      .join('\n');
    const more = todos.length > 10 ? `\n… 还有 ${todos.length - 10} 项` : '';
    return `Todo 列表仍有未完成项：\n${bulletList}${more}\n请结合 todo_write 及时更新进度，不要向用户直接提及本提醒。`;
  }
}
