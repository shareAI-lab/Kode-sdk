// Example U4: Scheduler - Time + Step Triggers

import { Agent, JSONStore, LocalSandbox, AnthropicProvider, builtin, Scheduler } from '../src';

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
const store = new JSONStore('./data');
const sandbox = LocalSandbox.local({ workDir: './workspace' });

const agent = new Agent({
  sessionId: 'agent:assistant/session:scheduler-demo',
  provider,
  store,
  sandbox,
  tools: [...builtin.fs({ workDir: './workspace' }), ...builtin.bash()],
  system: 'You are a helpful assistant. Follow security guidelines and provide periodic updates.',
});

// Create scheduler
const scheduler = new Scheduler();

// Time-based trigger: every 10 minutes
scheduler.every('10m', async () => {
  console.log('[SCHEDULER] 10-minute check triggered');
  await agent.send('巡检：请输出最近 10 分钟的指标');
});

// Step-based trigger: every 20 steps
scheduler.everySteps(20, async (ctx) => {
  console.log(`[SCHEDULER] 20-step reminder triggered (count: ${ctx.count})`);
  await agent.send('[REMINDER] 20 步回顾：请再次确认用户偏好与安全守则');
});

// Daily trigger: 9:00 AM
scheduler.daily('09:00', async () => {
  console.log('[SCHEDULER] Daily 9am report triggered');
  await agent.send('早报：请汇总昨天 PR/Issue');
});

// Weekly trigger: Monday 9:00 AM
scheduler.weekly('Mon 09:00', async () => {
  console.log('[SCHEDULER] Weekly Monday report triggered');
  await agent.send('周报：请汇总上周工作进展');
});

// Simulate step notifications
let stepCounter = 0;
setInterval(() => {
  stepCounter++;
  scheduler.notifyStep();
  console.log(`Step ${stepCounter} completed`);
}, 1000);

// Listen for agent events
agent.on('messages_update', () => {
  console.log('[AGENT] Messages updated');
  scheduler.notifyStep();
});

// Interact with agent
async function main() {
  console.log('Agent with scheduler started...');
  console.log('Scheduled tasks:');
  console.log('  - Every 10 minutes: metrics check');
  console.log('  - Every 20 steps: security reminder');
  console.log('  - Daily 9am: daily report');
  console.log('  - Weekly Mon 9am: weekly report');
  console.log('');

  // Test some interactions
  await agent.send('Hello! Please introduce yourself.');

  for await (const event of agent.subscribe()) {
    if (event.type === 'text') {
      console.log('Agent:', event.text);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  // Keep running to test scheduler
  console.log('\nAgent is running with scheduler...');
  console.log('Press Ctrl+C to exit\n');
}

if (require.main === module) {
  main().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down scheduler...');
    scheduler.stop();
    process.exit(0);
  });
}
