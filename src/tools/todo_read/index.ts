import { tool } from '../tool';
import { z } from 'zod';
import { DESCRIPTION, PROMPT } from './prompt';

export const TodoRead = tool({
  name: 'todo_read',
  description: DESCRIPTION,
  parameters: z.object({}),
  async execute(_args, ctx) {
    if (ctx.agent?.getTodos) {
      return { todos: ctx.agent.getTodos() };
    }

    const service = ctx.services?.todo;
    if (!service) {
      return {
        todos: [],
        note: 'Todo service not enabled for this agent'
      };
    }

    return { todos: service.list() };
  },
  metadata: {
    readonly: true,
    version: '1.0',
  },
});

TodoRead.prompt = PROMPT;
