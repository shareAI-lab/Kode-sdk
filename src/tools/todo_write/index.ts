import { tool } from '../tool';
import { z } from 'zod';
import { DESCRIPTION, PROMPT } from './prompt';
import { TodoItem, TodoInput } from '../../core/todo';

const todoItemSchema = z.object({
  id: z.string().describe('Unique identifier for the todo'),
  title: z.string().describe('Clear description of the task'),
  status: z.enum(['pending', 'in_progress', 'completed']).describe('Current status'),
  assignee: z.string().optional().describe('Who is responsible'),
  notes: z.string().optional().describe('Additional context'),
});

export const TodoWrite = tool({
  name: 'todo_write',
  description: DESCRIPTION,
  parameters: z.object({
    todos: z.array(todoItemSchema).describe('Array of todo items'),
  }),
  async execute(args, ctx) {
    const { todos } = args;

    const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      throw new Error(
        `Only one todo can be "in_progress" at a time. Found ${inProgressCount} in_progress todos.`
      );
    }

    if (!ctx.agent?.setTodos) {
      const service = ctx.services?.todo;
      if (!service) {
        throw new Error('Todo service not enabled for this agent');
      }
      await service.setTodos(todos as TodoItem[]);
      return { ok: true, count: todos.length };
    }

    await ctx.agent.setTodos(todos as TodoInput[]);
    return { ok: true, count: todos.length };
  },
  metadata: {
    readonly: false,
    version: '1.0',
  },
});

TodoWrite.prompt = PROMPT;
