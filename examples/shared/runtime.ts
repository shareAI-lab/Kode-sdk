import {
  AgentDependencies,
  AgentTemplateRegistry,
  JSONStore,
  ModelConfig,
  SandboxFactory,
  ToolRegistry,
  builtin,
} from '../../src';
import { createDemoModelProvider } from './demo-model';

type BuiltinGroup = 'fs' | 'bash' | 'todo' | 'task';

export interface RuntimeOptions {
  storeDir?: string;
  modelDefaults?: Partial<ModelConfig>;
}

export interface RuntimeContext {
  templates: AgentTemplateRegistry;
  tools: ToolRegistry;
  sandboxFactory: SandboxFactory;
  registerBuiltin: (...groups: BuiltinGroup[]) => void;
}

export function createRuntime(setup: (ctx: RuntimeContext) => void, options?: RuntimeOptions): AgentDependencies {
  const store = new JSONStore(options?.storeDir ?? './.kode');
  const templates = new AgentTemplateRegistry();
  const tools = new ToolRegistry();
  const sandboxFactory = new SandboxFactory();

  const registerBuiltin = (...groups: BuiltinGroup[]) => {
    for (const group of groups) {
      if (group === 'fs') {
        for (const tool of builtin.fs()) {
          tools.register(tool.name, () => tool);
        }
      } else if (group === 'bash') {
        for (const tool of builtin.bash()) {
          tools.register(tool.name, () => tool);
        }
      } else if (group === 'todo') {
        for (const tool of builtin.todo()) {
          tools.register(tool.name, () => tool);
        }
      } else if (group === 'task') {
        const taskTool = builtin.task();
        if (taskTool) {
          tools.register(taskTool.name, () => taskTool);
        }
      }
    }
  };

  setup({ templates, tools, sandboxFactory, registerBuiltin });

  return {
    store,
    templateRegistry: templates,
    sandboxFactory,
    toolRegistry: tools,
    modelFactory: (config) => createDemoModelProvider({ ...(options?.modelDefaults ?? {}), ...config }),
  };
}
