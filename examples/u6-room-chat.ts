// Example U6: Room Group Chat

import { AgentPool, Room, JSONStore, LocalSandbox, AnthropicProvider, builtin } from '../src';

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
const pool = new AgentPool({ store: new JSONStore('./data'), maxAgents: 10 });

// Create agents for each participant
const samAgent = pool.create('user:1/agent:pm/session:sam', {
  sessionId: 'user:1/agent:pm/session:sam',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-sam' }),
  tools: [...builtin.fs({ workDir: './workspace-sam' }), ...builtin.bash()],
  system: 'You are Sam, the project manager. You coordinate team activities and ensure deadlines are met.',
});

const muskAgent = pool.create('user:2/agent:ceo/session:musk', {
  sessionId: 'user:2/agent:ceo/session:musk',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-musk' }),
  tools: [...builtin.fs({ workDir: './workspace-musk' }), ...builtin.bash()],
  system: 'You are Musk, the CEO. You provide strategic vision and make key decisions.',
});

const jensenAgent = pool.create('user:3/agent:tech/session:jensen', {
  sessionId: 'user:3/agent:tech/session:jensen',
  provider,
  store: new JSONStore('./data'),
  sandbox: LocalSandbox.local({ workDir: './workspace-jensen' }),
  tools: [...builtin.fs({ workDir: './workspace-jensen' }), ...builtin.bash()],
  system: 'You are Jensen, the technical lead. You handle technical architecture and infrastructure.',
});

// Create room and add members
const room = new Room(pool);
room.join('sam', 'user:1/agent:pm/session:sam');
room.join('musk', 'user:2/agent:ceo/session:musk');
room.join('jensen', 'user:3/agent:tech/session:jensen');

// Helper to display messages
async function displayAgentResponse(agent: any, name: string) {
  for await (const event of agent.subscribe()) {
    if (event.type === 'text') {
      console.log(`  ${name} replied: ${event.text.slice(0, 100)}...`);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }
}

async function main() {
  console.log('Room chat started with members: sam, musk, jensen\n');

  // Example 1: Direct mention (@)
  console.log('--- Example 1: Direct Mention ---');
  console.log('sam: @musk @jensen 今晚收尾发布！\n');
  await room.say('sam', '@musk @jensen 今晚收尾发布！');

  await Promise.all([displayAgentResponse(muskAgent, 'musk'), displayAgentResponse(jensenAgent, 'jensen')]);

  // Example 2: Broadcast (no @)
  console.log('\n--- Example 2: Broadcast ---');
  console.log('sam: 大家注意风险清单 3 号\n');
  await room.say('sam', '大家注意风险清单 3 号');

  await Promise.all([displayAgentResponse(muskAgent, 'musk'), displayAgentResponse(jensenAgent, 'jensen')]);

  // Example 3: Single mention
  console.log('\n--- Example 3: Single Mention ---');
  console.log('musk: @jensen 服务器准备好了吗？\n');
  await room.say('musk', '@jensen 服务器准备好了吗？');

  await displayAgentResponse(jensenAgent, 'jensen');

  // Example 4: Response
  console.log('\n--- Example 4: Response ---');
  console.log('jensen: @musk 已准备就绪，GPU 资源充足\n');
  await room.say('jensen', '@musk 已准备就绪，GPU 资源充足');

  await displayAgentResponse(muskAgent, 'musk');

  // Example 5: Broadcast announcement
  console.log('\n--- Example 5: Final Broadcast ---');
  console.log('sam: 发布成功！感谢团队配合\n');
  await room.say('sam', '发布成功！感谢团队配合');

  await Promise.all([displayAgentResponse(muskAgent, 'musk'), displayAgentResponse(jensenAgent, 'jensen')]);

  console.log('\n--- Room members ---');
  const members = room.getMembers();
  members.forEach((m) => console.log(`  ${m.name}: ${m.sessionId}`));

  console.log('\nRoom chat demo completed!');
}

if (require.main === module) {
  main().catch(console.error);
}
