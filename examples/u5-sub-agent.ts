// Example U5: Sub-Agent Task Delegation

import { Agent, AgentTemplate, JSONStore, LocalSandbox, AnthropicProvider, builtin } from '../src';

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');

// Define specialized agent templates
const RepoAssistant: AgentTemplate = {
  id: 'repo-assistant',
  system: 'You are a repository assistant. You help with general repository tasks, code review, and documentation.',
  whenToUse: 'general repository tasks, code review, documentation',
};

const FrontendAssistant: AgentTemplate = {
  id: 'frontend-assistant',
  system: 'You are a frontend specialist. You excel at React, TypeScript, CSS, and UI/UX implementation.',
  whenToUse: 'frontend, react, ui, css, typescript',
};

const BackendAssistant: AgentTemplate = {
  id: 'backend-assistant',
  system: 'You are a backend specialist. You excel at APIs, databases, server architecture, and performance.',
  whenToUse: 'backend, api, database, server, performance',
};

// Create main agent with sub-agent delegation capability
const agent = new Agent({
  sessionId: 'agent:pm/session:main',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace' }),
  tools: [
    ...builtin.fs({ workDir: './workspace' }),
    ...builtin.bash({ allow: [/^git /, /^npm /], block: [/rm -rf/], approval: false }),
    builtin.task({ subAgents: [RepoAssistant, FrontendAssistant, BackendAssistant] }),
  ],
  system: 'You are a project manager agent. Delegate tasks to specialized agents when appropriate.',
});

async function main() {
  console.log('PM Agent started with sub-agent delegation capability\n');

  // Task 1: General repository task
  console.log('Task 1: Initialize project...');
  await agent.send('Please initialize a Next.js project and write README');

  for await (const event of agent.subscribe()) {
    if (event.type === 'tool_use' && event.name === 'Task.Run') {
      console.log('  [DELEGATION]', event.input);
    }
    if (event.type === 'text') {
      console.log('  PM Agent:', event.text);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // Task 2: Frontend-specific task
  console.log('\nTask 2: Create UI component...');
  await agent.send('Create a responsive navigation bar component in React with TypeScript');

  for await (const event of agent.subscribe()) {
    if (event.type === 'tool_use' && event.name === 'Task.Run') {
      console.log('  [DELEGATION]', event.input);
    }
    if (event.type === 'text') {
      console.log('  PM Agent:', event.text);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // Task 3: Backend-specific task
  console.log('\nTask 3: Design API...');
  await agent.send('Design a RESTful API for user authentication with JWT tokens');

  for await (const event of agent.subscribe()) {
    if (event.type === 'tool_use' && event.name === 'Task.Run') {
      console.log('  [DELEGATION]', event.input);
    }
    if (event.type === 'text') {
      console.log('  PM Agent:', event.text);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // Task 4: Explicit delegation
  console.log('\nTask 4: Explicit delegation to frontend...');
  await agent.send('Use Task.Run to delegate: "Implement dark mode toggle" with frontend-assistant');

  for await (const event of agent.subscribe()) {
    if (event.type === 'tool_use' && event.name === 'Task.Run') {
      console.log('  [DELEGATION]', event.input);
    }
    if (event.type === 'tool_result') {
      console.log('  [RESULT]', event.content);
    }
    if (event.type === 'text') {
      console.log('  PM Agent:', event.text);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  console.log('\nAll tasks completed!');
}

if (require.main === module) {
  main().catch(console.error);
}
