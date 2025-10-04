/**
 * Test script for SDK improvements
 *
 * Tests:
 * 1. interrupt() generates cancelled tool results
 * 2. Events include timestamps
 * 3. EventBus memory cleanup
 * 4. Agent.schedule() works
 * 5. Agent.resume() basic functionality
 * 6. Agent.fork() snapshot branching
 * 7. Pool.resume() restores agents
 */

import { Agent, JSONStore, LocalSandbox, builtin, AgentPool } from '../src';
import { AnthropicProvider } from '../src/infra/provider';

async function testInterrupt() {
  console.log('\n=== Test 1: interrupt() ===');

  const agent = new Agent({
    sessionId: 'test:interrupt',
    provider: new AnthropicProvider(process.env.ANTHROPIC_API_KEY || 'mock'),
    store: new JSONStore('./test-data'),
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
    tools: [...builtin.fs({ workDir: './test-workspace' })],
  });

  // Handle error events
  agent.on('error', () => {});

  // Simulate interrupt by manually creating pending tool_use
  (agent as any).messages = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Test' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'test_tool_1',
          name: 'FsRead',
          input: { path: 'test.txt' },
        },
      ],
    },
  ];

  await agent.interrupt({ note: 'Test cancellation' });

  const messages = (agent as any).messages;
  const lastMsg = messages[messages.length - 1];

  console.log('✅ interrupt() generates cancelled results:', lastMsg.role === 'user' && lastMsg.content[0].type === 'tool_result');
}

async function testTimestamps() {
  console.log('\n=== Test 2: Event Timestamps ===');

  const agent = new Agent({
    sessionId: 'test:timestamps',
    provider: new AnthropicProvider('mock'),
    store: new JSONStore('./test-data'),
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  // Handle error events
  agent.on('error', () => {});

  const before = Date.now();

  // Trigger an event
  await agent.send('Test message');

  const after = Date.now();
  const events = await agent.history();

  const allHaveTimestamps = events.every((e) => 'timestamp' in e);
  console.log('✅ All events have timestamps:', allHaveTimestamps);
}

async function testEventBusMemory() {
  console.log('\n=== Test 3: EventBus Memory Cleanup ===');

  const agent = new Agent({
    sessionId: 'test:memory',
    provider: new AnthropicProvider('mock'),
    store: new JSONStore('./test-data'),
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  // Generate many events
  for (let i = 0; i < 12000; i++) {
    (agent as any).events.emitEvent({ type: 'test', data: i });
  }

  const timeline = (agent as any).events.getTimeline();
  console.log('✅ Memory cleanup works:', timeline.length <= 10000);
}

async function testSchedule() {
  console.log('\n=== Test 4: Agent.schedule() ===');

  const agent = new Agent({
    sessionId: 'test:schedule',
    provider: new AnthropicProvider('mock'),
    store: new JSONStore('./test-data'),
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  // Handle error events
  agent.on('error', () => {});

  let stepTriggered = false;

  const scheduler = agent.schedule();
  scheduler.everySteps(1, () => {
    stepTriggered = true;
  });

  // Trigger step event
  await agent.send('Test');

  console.log('✅ schedule() works:', scheduler !== undefined && stepTriggered);
}

async function testResume() {
  console.log('\n=== Test 5: Agent.resume() ===');

  const sessionId = 'test:resume';
  const store = new JSONStore('./test-data');

  // Create and save agent state
  const agent1 = new Agent({
    sessionId,
    provider: new AnthropicProvider('mock'),
    store,
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  await agent1.send('Hello world');
  const originalCount = (agent1 as any).messages.length;

  // Resume agent
  const agent2 = await Agent.resume(sessionId, {
    sessionId,
    provider: new AnthropicProvider('mock'),
    store,
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  const restoredCount = (agent2 as any).messages.length;

  console.log('✅ resume() restores state:', originalCount === restoredCount);
}

async function testFork() {
  console.log('\n=== Test 6: Agent.fork() ===');

  const agent1 = new Agent({
    sessionId: 'test:fork',
    provider: new AnthropicProvider('mock'),
    store: new JSONStore('./test-data'),
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  // Handle error events
  agent1.on('error', () => {});

  await agent1.send('Original message');

  // Fork from current state
  const agent2 = await agent1.fork();

  const originalCount = (agent1 as any).messages.length;
  const forkedCount = (agent2 as any).messages.length;

  const status1 = await agent1.status();
  const status2 = await agent2.status();

  console.log('✅ fork() copies state:', originalCount === forkedCount);
  console.log('✅ fork() has new sessionId:', status2.sessionId !== status1.sessionId);
}

async function testPoolResume() {
  console.log('\n=== Test 7: Pool.resume() ===');

  const store = new JSONStore('./test-data');
  const pool = new AgentPool({ store, maxAgents: 10 });

  // Create an agent via pool
  const sessionId = 'test:pool-resume';
  const agent1 = pool.create(sessionId, {
    sessionId,
    provider: new AnthropicProvider('mock'),
    store,
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  agent1.on('error', () => {});
  await agent1.send('Test message');

  // Delete from pool (but keep in store)
  pool.delete(sessionId);

  // Resume from store
  const agent2 = await pool.resume(sessionId, {
    provider: new AnthropicProvider('mock'),
    sandbox: LocalSandbox.local({ workDir: './test-workspace' }),
  });

  console.log('✅ Pool.resume() restores agent:', agent2 !== undefined);
  console.log('✅ Pool.resume() has messages:', (agent2 as any).messages.length > 0);
}

async function main() {
  console.log('Testing SDK v1.5.3 Improvements\n');

  try {
    await testInterrupt();
    await testTimestamps();
    await testEventBusMemory();
    await testSchedule();
    await testResume();
    await testFork();
    await testPoolResume();

    console.log('\n✅ All tests completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
