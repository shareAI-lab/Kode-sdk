import { ToolContext } from '../core/types';
import { Tool } from './fs';

export interface AgentTemplate {
  id: string;
  system?: string;
  tools?: Tool[];
  whenToUse?: string;
}

export class TaskRun implements Tool {
  name = 'Task.Run';
  description = 'Delegate a task to a sub-agent';
  input_schema = {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'Task description for the sub-agent' },
      with: { type: 'string', description: 'Template ID to use (optional, will auto-select if omitted)' },
      context: { type: 'string', description: 'Additional context (optional)' },
    },
    required: ['task'],
  };

  constructor(private subAgents: AgentTemplate[]) {}

  async exec(args: { task: string; with?: string; context?: string }, ctx: ToolContext): Promise<any> {
    // This will be implemented when Agent class is ready
    // For now, return a placeholder
    const template = args.with
      ? this.subAgents.find((t) => t.id === args.with)
      : this.selectTemplate(args.task);

    if (!template) {
      throw new Error(`Template not found: ${args.with || 'auto'}`);
    }

    return {
      status: 'delegated',
      template: template.id,
      task: args.task,
      note: 'Sub-agent execution will be implemented in Agent class',
    };
  }

  private selectTemplate(task: string): AgentTemplate | undefined {
    // Simple heuristic selection based on whenToUse hints
    for (const template of this.subAgents) {
      if (template.whenToUse && task.toLowerCase().includes(template.whenToUse.toLowerCase())) {
        return template;
      }
    }
    return this.subAgents[0];
  }
}
