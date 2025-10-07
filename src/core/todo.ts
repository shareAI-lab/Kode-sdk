import { Store } from '../infra/store';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
  assignee?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TodoSnapshot {
  todos: TodoItem[];
  version: number;
  updatedAt: number;
}

const MAX_IN_PROGRESS = 1;

export type TodoInput = Omit<TodoItem, 'createdAt' | 'updatedAt'> & {
  createdAt?: number;
  updatedAt?: number;
};

export class TodoService {
  private snapshot: TodoSnapshot = { todos: [], version: 1, updatedAt: Date.now() };

  constructor(private readonly store: Store, private readonly agentId: string) {}

  async load(): Promise<void> {
    const existing = await this.store.loadTodos?.(this.agentId);
    if (existing) {
      this.snapshot = existing;
    }
  }

  list(): TodoItem[] {
    return [...this.snapshot.todos];
  }

  async setTodos(todos: TodoInput[]): Promise<void> {
    const normalized = todos.map((todo) => this.normalize(todo));
    this.validateTodos(normalized);
    this.snapshot = {
      todos: normalized.map((todo) => ({ ...todo, updatedAt: Date.now() })),
      version: this.snapshot.version + 1,
      updatedAt: Date.now(),
    };
    await this.persist();
  }

  async update(todo: TodoInput): Promise<void> {
    const existing = this.snapshot.todos.find((t) => t.id === todo.id);
    if (!existing) {
      throw new Error(`Todo not found: ${todo.id}`);
    }

    const normalized = this.normalize({ ...existing, ...todo });
    const updated: TodoItem = { ...existing, ...normalized, updatedAt: Date.now() };
    const next = this.snapshot.todos.map((t) => (t.id === todo.id ? updated : t));
    this.validateTodos(next);
    this.snapshot.todos = next;
    this.snapshot.version += 1;
    this.snapshot.updatedAt = Date.now();
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    const next = this.snapshot.todos.filter((t) => t.id !== id);
    this.snapshot.todos = next;
    this.snapshot.version += 1;
    this.snapshot.updatedAt = Date.now();
    await this.persist();
  }

  private validateTodos(todos: TodoItem[]) {
    const ids = new Set<string>();
    let inProgress = 0;
    for (const todo of todos) {
      if (!todo.id) throw new Error('Todo id is required');
      if (ids.has(todo.id)) {
        throw new Error(`Duplicate todo id: ${todo.id}`);
      }
      ids.add(todo.id);
      if (todo.status === 'in_progress') inProgress += 1;
      if (!todo.title?.trim()) {
        throw new Error(`Todo ${todo.id} must have a title`);
      }
    }
    if (inProgress > MAX_IN_PROGRESS) {
      throw new Error('Only one todo can be in progress');
    }
  }

  private async persist(): Promise<void> {
    if (!this.store.saveTodos) return;
    await this.store.saveTodos(this.agentId, this.snapshot);
  }

  private normalize(todo: TodoInput): TodoItem {
    const now = Date.now();
    return {
      id: todo.id,
      title: todo.title,
      status: todo.status,
      assignee: todo.assignee,
      notes: todo.notes,
      createdAt: todo.createdAt ?? now,
      updatedAt: todo.updatedAt ?? now,
    };
  }
}
