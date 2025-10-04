// Example U3: Hook for Path Guard and Result Trimming

import { Agent, JSONStore, LocalSandbox, AnthropicProvider, builtin } from '../src';

const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '');
const store = new JSONStore('./data');
const sandbox = LocalSandbox.local({ workDir: './workspace' });

const agent = new Agent({
  sessionId: 'agent:assistant/session:hook-demo',
  provider,
  store,
  sandbox,
  tools: [...builtin.fs({ workDir: './workspace' }), ...builtin.bash()],
  system: 'You are a helpful assistant with secure file access.',
});

// Add global hooks for security and trimming
agent.use({
  preToolUse(call, ctx) {
    if (call.name === 'Fs.Write' || call.name === 'Fs.Read' || call.name === 'Fs.Edit') {
      const filePath = call.args.file as string;

      if (!ctx.sandbox.fs.isInside(filePath)) {
        console.log(`[HOOK] Denied: Path outside sandbox: ${filePath}`);
        return { decision: 'deny', reason: 'path out of sandbox' };
      }

      // Normalize path
      call.args.file = ctx.sandbox.fs.resolve(filePath);
      console.log(`[HOOK] Normalized path: ${call.args.file}`);
    }

    if (call.name === 'Bash.Run') {
      const cmd = call.args.cmd as string;

      // Block dangerous commands
      const dangerousPatterns = [/rm -rf \//,  /dd if=/, /mkfs/, /> \/dev/];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(cmd)) {
          console.log(`[HOOK] Denied: Dangerous command: ${cmd}`);
          return { decision: 'deny', reason: `Blocked dangerous command pattern` };
        }
      }
    }
  },

  postToolUse(outcome, ctx) {
    const contentStr = String(outcome.content ?? '');

    // Trim large results
    if (contentStr.length > 100_000) {
      console.log(`[HOOK] Trimming large output (${contentStr.length} bytes)`);

      const tempPath = ctx.sandbox.fs.temp(`tool-${outcome.id}.log`);
      ctx.sandbox.fs.write(tempPath, contentStr);

      return {
        update: {
          content: contentStr.slice(0, 100_000) + `\n\n[Full output at ./${tempPath}]`,
        },
      };
    }

    // Log successful tool execution
    console.log(`[HOOK] Tool ${outcome.name} completed in ${outcome.duration_ms}ms`);
  },

  preModel(request) {
    console.log(`[HOOK] Calling model with ${request.messages?.length || 0} messages`);
  },

  postModel(response) {
    console.log(`[HOOK] Model response: ${response.usage?.output_tokens || 0} tokens`);
  },
});

// Test the hooks
async function main() {
  console.log('Testing path guard...');
  await agent.send('Write "hello" to /etc/passwd');

  for await (const event of agent.subscribe()) {
    if (event.type === 'tool_result') {
      console.log('Tool result:', event.ok ? 'success' : 'denied', event.content);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  console.log('\nTesting dangerous command...');
  await agent.send('Run command: rm -rf /');

  for await (const event of agent.subscribe()) {
    if (event.type === 'tool_result') {
      console.log('Tool result:', event.ok ? 'success' : 'denied', event.content);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }

  console.log('\nTesting safe operation...');
  await agent.send('Create a file test.txt with content "Hello World"');

  for await (const event of agent.subscribe()) {
    if (event.type === 'text') {
      console.log('Agent:', event.text);
    }
    if (event.type === 'state' && event.state === 'READY') {
      break;
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
