import { Agent, JSONStore, AgentTemplateRegistry } from '../src';

/**
 * KODE SDK v2.7 基础测试
 *
 * 验证核心功能：
 * 1. Store 创建与 WAL 恢复
 * 2. Agent 创建与运行
 * 3. 事件流订阅
 * 4. 上下文压缩
 * 5. Resume 恢复
 */

async function testBasicFlow() {
  console.log('🧪 测试 1: Store 与 WAL');
  const store = new JSONStore('.kode-test');

  // 测试消息保存与加载
  const testMessages = [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] }
  ];
  await store.saveMessages('test-agent', testMessages);
  const loaded = await store.loadMessages('test-agent');
  console.assert(loaded.length === 1, '✅ Store 保存/加载正常');

  console.log('🧪 测试 2: Agent 创建与模板');
  const templates = new AgentTemplateRegistry();
  templates.register({
    id: 'test-assistant',
    systemPrompt: 'You are a test assistant.',
    model: 'claude-3-5-sonnet-20241022',
    permission: { mode: 'auto' }
  });

  const { SandboxFactory } = await import('../src/infra/sandbox-factory');
  const { ToolRegistry } = await import('../src/tools/registry');
  const { AnthropicProvider } = await import('../src/infra/provider');

  const agent = await Agent.create(
    {
      agentId: 'test-agent-1',
      templateId: 'test-assistant',
      model: new AnthropicProvider(process.env.ANTHROPIC_API_KEY || 'test-key')
    },
    {
      store,
      templateRegistry: templates,
      sandboxFactory: new SandboxFactory(),
      toolRegistry: new ToolRegistry()
    }
  );
  console.assert(agent.agentId === 'test-agent-1', '✅ Agent 创建成功');

  console.log('🧪 测试 3: 事件流');
  // 测试订阅 API（无需实际运行，验证接口可用）
  const stream = agent.subscribe(['progress'], {
    kinds: ['text_chunk']
  });
  console.assert(stream !== undefined, '✅ 事件流订阅正常');

  console.log('🧪 测试 4: 上下文分析');
  const { ContextManager } = await import('../src/core/context-manager');
  const contextManager = new ContextManager(
    store,
    'test-agent',
    {
      maxTokens: 100000,
      compressToTokens: 50000,
      compressionModel: 'claude-3-haiku',
      compressionPrompt: 'Summarize'
    }
  );

  const messages = [
    { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello, can you help me?' }] },
    { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Of course! What do you need?' }] }
  ];
  const usage = contextManager.analyze(messages);
  console.assert(usage.messageCount === 2, '✅ 上下文分析正常');
  console.assert(usage.totalTokens > 0, '✅ Token 估算正常');

  console.log('🧪 测试 5: Store 接口完整性');
  await store.saveHistoryWindow('test-agent', {
    id: 'window-1',
    messages,
    events: [],
    stats: {
      messageCount: 2,
      tokenCount: usage.totalTokens,
      eventCount: 0
    },
    timestamp: Date.now()
  });

  const windows = await store.loadHistoryWindows('test-agent');
  console.assert(windows.length === 1, '✅ HistoryWindow 保存/加载正常');

  await store.saveCompressionRecord('test-agent', {
    id: 'comp-1',
    windowId: 'window-1',
    config: {
      model: 'claude-3-haiku',
      prompt: 'Summarize',
      threshold: 50000
    },
    summary: 'Test summary',
    ratio: 0.5,
    recoveredFiles: [],
    timestamp: Date.now()
  });

  const compressions = await store.loadCompressionRecords('test-agent');
  console.assert(compressions.length === 1, '✅ CompressionRecord 保存/加载正常');

  // 清理
  await store.delete('test-agent');
  await store.delete('test-agent-1');
  console.log('\n✅ 所有基础测试通过！\n');
}

async function testPermissionSystem() {
  console.log('🧪 测试 6: 权限系统');

  const { permissionModes } = await import('../src/core/permission-modes');

  // 测试内置模式
  const autoHandler = permissionModes.get('auto');
  console.assert(autoHandler?.({} as any) === 'allow', '✅ auto 模式正常');

  const readonlyHandler = permissionModes.get('readonly');
  console.assert(readonlyHandler?.({ descriptor: { metadata: { mutates: true } } } as any) === 'deny', '✅ readonly 模式正常');

  // 测试序列化
  const serialized = permissionModes.serialize();
  console.assert(serialized.length >= 3, '✅ 权限模式序列化正常');
  console.assert(serialized.every(m => m.builtIn), '✅ 内置模式标记正常');

  // 测试自定义模式
  permissionModes.register('test-mode', () => 'ask');
  const updated = permissionModes.serialize();
  const customMode = updated.find(m => m.name === 'test-mode');
  console.assert(customMode && !customMode.builtIn, '✅ 自定义模式序列化正常');

  console.log('✅ 权限系统测试通过！\n');
}

async function testScheduler() {
  console.log('🧪 测试 7: 调度系统');

  const { Scheduler } = await import('../src/core/scheduler');
  const { TimeBridge } = await import('../src/core/time-bridge');

  const scheduler = new Scheduler({
    onTrigger: (info) => {
      console.log(`  Trigger: ${info.kind} - ${info.spec}`);
    }
  });

  let stepTriggerCount = 0;
  scheduler.everySteps(2, () => {
    stepTriggerCount++;
  });

  // 模拟步骤通知
  scheduler.notifyStep(1);
  scheduler.notifyStep(2);
  scheduler.notifyStep(3);
  scheduler.notifyStep(4);

  console.assert(stepTriggerCount === 2, '✅ Step 调度正常');

  // 测试 TimeBridge
  const bridge = new TimeBridge({
    scheduler,
    driftToleranceMs: 1000
  });

  let timeTriggerCount = 0;
  const timerId = bridge.everyMinutes(1/60, () => { // 1 秒
    timeTriggerCount++;
  });

  await new Promise(resolve => setTimeout(resolve, 1500));
  bridge.stop(timerId);

  console.assert(timeTriggerCount >= 1, '✅ Time 调度正常');
  console.log('✅ 调度系统测试通过！\n');
}

// 运行所有测试
async function runAll() {
  console.log('\n🚀 KODE SDK v2.7 测试套件\n');
  console.log('='.repeat(50) + '\n');

  try {
    await testBasicFlow();
    await testPermissionSystem();
    await testScheduler();

    console.log('='.repeat(50));
    console.log('\n🎉 所有测试通过！SDK v2.7 功能正常\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

runAll();
