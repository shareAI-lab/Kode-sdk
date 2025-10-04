// Example U7: ChatDev Team Collaboration

import { AgentPool, Room, AgentTemplate, JSONStore, LocalSandbox, AnthropicProvider, builtin } from '../src';

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
const pool = new AgentPool({ store: new JSONStore('./data'), maxAgents: 20 });

// Define team member templates
const PM: AgentTemplate = {
  id: 'pm',
  system:
    'You are the Project Manager. You coordinate tasks, communicate with users, and delegate work to team members. Use Task.Run to assign work to frontend, backend, qa, security, or ops specialists.',
  whenToUse: 'project coordination, user communication, task delegation',
};

const Frontend: AgentTemplate = {
  id: 'frontend',
  system:
    'You are the Frontend Developer. You implement UI components, handle styling, and ensure great UX. You work with React, TypeScript, and modern CSS.',
};

const Backend: AgentTemplate = {
  id: 'backend',
  system:
    'You are the Backend Developer. You design APIs, implement business logic, manage databases, and ensure system performance.',
};

const QA: AgentTemplate = {
  id: 'qa',
  system: 'You are the QA Engineer. You write tests, find bugs, verify features, and ensure quality standards.',
};

const Security: AgentTemplate = {
  id: 'security',
  system:
    'You are the Security Engineer. You review code for vulnerabilities, enforce security policies, and protect against threats.',
};

const Ops: AgentTemplate = {
  id: 'ops',
  system: 'You are the DevOps Engineer. You manage infrastructure, CI/CD, monitoring, and deployment processes.',
};

// Create team agents
const pmAgent = pool.create('team:chatdev/agent:pm/session:alice', {
  sessionId: 'team:chatdev/agent:pm/session:alice',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-pm' }),
  tools: [
    ...builtin.fs({ workDir: './workspace-pm' }),
    ...builtin.bash({ allow: [/^git /, /^npm /] }),
    builtin.task({ subAgents: [Frontend, Backend, QA, Security, Ops] }),
  ],
  system: PM.system,
  templateId: 'pm',
});

const feAgent = pool.create('team:chatdev/agent:frontend/session:bob', {
  sessionId: 'team:chatdev/agent:frontend/session:bob',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-fe' }),
  tools: [...builtin.fs({ workDir: './workspace-fe' }), ...builtin.bash({ allow: [/^npm /] })],
  system: Frontend.system,
  templateId: 'frontend',
});

const beAgent = pool.create('team:chatdev/agent:backend/session:charlie', {
  sessionId: 'team:chatdev/agent:backend/session:charlie',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-be' }),
  tools: [...builtin.fs({ workDir: './workspace-be' }), ...builtin.bash({ allow: [/^npm /, /^docker /] })],
  system: Backend.system,
  templateId: 'backend',
});

const qaAgent = pool.create('team:chatdev/agent:qa/session:diana', {
  sessionId: 'team:chatdev/agent:qa/session:diana',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-qa' }),
  tools: [...builtin.fs({ workDir: './workspace-qa' }), ...builtin.bash({ allow: [/^npm test/, /^pytest/] })],
  system: QA.system,
  templateId: 'qa',
});

// Create team room
const teamRoom = new Room(pool);
teamRoom.join('pm', 'team:chatdev/agent:pm/session:alice');
teamRoom.join('frontend', 'team:chatdev/agent:frontend/session:bob');
teamRoom.join('backend', 'team:chatdev/agent:backend/session:charlie');
teamRoom.join('qa', 'team:chatdev/agent:qa/session:diana');

async function main() {
  console.log('=== ChatDev Team Collaboration Demo ===\n');

  // User sends requirement to PM
  console.log('1. User → PM: Request new feature\n');
  await pmAgent.send(
    'User request: Build a user authentication system with login, registration, and password reset features.'
  );

  for await (const event of pmAgent.subscribe()) {
    if (event.type === 'tool_use' && event.name === 'Task.Run') {
      console.log('  PM delegates:', event.input);
    }
    if (event.type === 'text') {
      console.log('  PM response:', event.text.slice(0, 150) + '...');
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // PM coordinates via room (private message to Backend)
  console.log('\n2. PM → Backend: Private task assignment\n');
  await teamRoom.say('pm', '@backend Please design the authentication API endpoints');

  for await (const event of beAgent.subscribe()) {
    if (event.type === 'text') {
      console.log('  Backend response:', event.text.slice(0, 150) + '...');
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // PM coordinates via room (private message to Frontend)
  console.log('\n3. PM → Frontend: Private task assignment\n');
  await teamRoom.say('pm', '@frontend Please create login and registration UI components');

  for await (const event of feAgent.subscribe()) {
    if (event.type === 'text') {
      console.log('  Frontend response:', event.text.slice(0, 150) + '...');
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // QA finds an issue and broadcasts
  console.log('\n4. QA → All: Broadcast issue\n');
  await teamRoom.say('qa', '接口 500 错误，请排查 /api/login endpoint');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  for await (const event of beAgent.subscribe()) {
    if (event.type === 'text') {
      console.log('  Backend acknowledges:', event.text.slice(0, 100) + '...');
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // PM announces completion
  console.log('\n5. PM → All: Broadcast announcement\n');
  await teamRoom.say('pm', '认证系统已完成开发和测试，准备部署');

  console.log('  [Broadcast sent to all team members]\n');

  console.log('=== Team Members ===');
  teamRoom.getMembers().forEach((m) => console.log(`  ${m.name}: ${m.sessionId}`));

  console.log('\n=== ChatDev Demo Completed ===');
}

if (require.main === module) {
  main().catch(console.error);
}
