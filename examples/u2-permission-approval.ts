// Example U2: Permission Approval Flow

import { Agent, JSONStore, LocalSandbox, AnthropicProvider, builtin } from '../src';

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
const store = new JSONStore('./data');
const sandbox = LocalSandbox.local({ workDir: './workspace' });

const agent = new Agent({
  sessionId: 'agent:assistant/session:demo',
  provider,
  store,
  sandbox,
  tools: [
    ...builtin.fs({ workDir: './workspace' }),
    ...builtin.bash({ approval: true, block: [/rm -rf/, /sudo/] }),
  ],
  system: 'You are a helpful assistant with file and command access.',
});

// Listen for permission requests on control plane
agent.on('permission_ask', (event: any) => {
  console.log('Permission requested:');
  console.log('  Tool:', event.tool);
  console.log('  Args:', event.args);
  console.log('  Meta:', event.meta);

  // Simulate approval UI
  setTimeout(async () => {
    const decision = Math.random() > 0.5 ? 'allow' : 'deny';
    console.log(`Decision: ${decision}`);

    // Option 1: Use the respond callback
    await event.respond(decision, `Automated decision: ${decision}`);

    // Option 2: Use agent.decide() API
    // await agent.decide(event.id, decision, `Automated decision: ${decision}`);
  }, 2000);
});

// Listen for errors
agent.on('error', (event: any) => {
  console.error('Agent error:', event.kind, event.message);
});

// Start interaction
async function main() {
  console.log('Sending task to agent...');
  await agent.send('Please list all files in the workspace directory');

  // Subscribe to events
  for await (const event of agent.subscribe()) {
    if (event.type === 'text') {
      console.log('Agent:', event.text);
    } else if (event.type === 'state' && event.state === 'READY') {
      console.log('Agent is ready');
      break;
    }
  }

  console.log('Sending bash command...');
  await agent.send('Run "ls -la" command');

  for await (const event of agent.subscribe()) {
    if (event.type === 'permission_ask') {
      console.log('Waiting for approval...');
    } else if (event.type === 'text') {
      console.log('Agent:', event.text);
    } else if (event.type === 'state' && event.state === 'READY') {
      console.log('Agent is ready');
      break;
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
