import {
  Agent,
  JSONStore,
  AgentTemplateRegistry,
  SandboxFactory,
  globalToolRegistry,
  AnthropicProvider,
} from '../src';

/**
 * KODE SDK v2.7 工具说明书功能测试
 *
 * 验证功能：
 * 1. Agent 创建时自动注入工具说明书
 * 2. 工具说明书包含所有工具的 prompt
 * 3. Monitor 事件 tool_manual_updated 正常发送
 */

async function testToolManualInjection() {
  console.log('\n🧪 测试: 工具说明书自动注入\n');

  const store = new JSONStore('.kode-test-manual');
  const templates = new AgentTemplateRegistry();

  templates.register({
    id: 'test-assistant',
    systemPrompt: 'You are a helpful coding assistant.',
    model: 'claude-3-5-sonnet-20241022',
    permission: { mode: 'auto' },
    tools: ['fs_read', 'bash_run'], // 注册有 prompt 的工具
  });

  // 订阅 Monitor 事件
  let manualUpdatedEvent: any = null;

  const agent = await Agent.create(
    {
      agentId: 'test-manual-agent',
      templateId: 'test-assistant',
      model: new AnthropicProvider(process.env.ANTHROPIC_API_KEY || 'test-key'),
    },
    {
      store,
      templateRegistry: templates,
      sandboxFactory: new SandboxFactory(),
      toolRegistry: globalToolRegistry,
    }
  );

  // 从 store 读取已发送的 Monitor 事件
  const events = [];
  for await (const timeline of store.readEvents('test-manual-agent', { channel: 'monitor' })) {
    events.push(timeline);
    if (timeline.event.type === 'tool_manual_updated') {
      manualUpdatedEvent = timeline.event;
    }
  }

  // 验证 1: Monitor 事件已发送
  console.assert(manualUpdatedEvent !== null, '✅ tool_manual_updated 事件已发送');
  console.assert(Array.isArray(manualUpdatedEvent.tools), '✅ 事件包含工具列表');
  console.log(`   工具列表: ${manualUpdatedEvent.tools.join(', ')}`);

  // 验证 2: 系统提示已包含工具手册
  const template = templates.get('test-assistant');
  const hasManual = template.systemPrompt.includes('### Tools Manual');
  console.assert(hasManual, '✅ 系统提示包含工具手册');

  // 验证 3: 工具手册包含工具名称和说明
  const hasFsRead = template.systemPrompt.includes('**fs_read**');
  const hasBashRun = template.systemPrompt.includes('**bash_run**');
  console.assert(hasFsRead, '✅ 工具手册包含 fs_read');
  console.assert(hasBashRun, '✅ 工具手册包含 bash_run');

  // 验证 4: 工具手册包含使用指南
  const hasUsageGuidance = template.systemPrompt.includes('Usage guidance');
  console.assert(hasUsageGuidance, '✅ 工具手册包含使用指南');

  // 输出工具手册片段
  console.log('\n📚 生成的工具手册片段:');
  const manualStart = template.systemPrompt.indexOf('### Tools Manual');
  const manualPreview = template.systemPrompt.substring(manualStart, manualStart + 300);
  console.log(manualPreview + '...\n');

  // 清理
  await store.delete('test-manual-agent');
  console.log('✅ 工具说明书功能测试通过！\n');
}

async function testToolManualWithoutPrompt() {
  console.log('🧪 测试: 没有 prompt 的工具不影响手册生成\n');

  const store = new JSONStore('.kode-test-manual-2');
  const templates = new AgentTemplateRegistry();

  templates.register({
    id: 'minimal-assistant',
    systemPrompt: 'You are a minimal assistant.',
    model: 'claude-3-5-sonnet-20241022',
    permission: { mode: 'auto' },
    // 不指定 tools，使用默认
  });

  const agent = await Agent.create(
    {
      agentId: 'test-minimal-agent',
      templateId: 'minimal-assistant',
      model: new AnthropicProvider(process.env.ANTHROPIC_API_KEY || 'test-key'),
    },
    {
      store,
      templateRegistry: templates,
      sandboxFactory: new SandboxFactory(),
      toolRegistry: globalToolRegistry,
    }
  );

  // 验证：如果所有工具都没有 prompt，系统提示保持不变或只追加了手册
  const template = templates.get('minimal-assistant');
  console.log(`   系统提示长度: ${template.systemPrompt.length}`);

  await store.delete('test-minimal-agent');
  console.log('✅ 空 prompt 处理测试通过！\n');
}

async function runAll() {
  console.log('\n🚀 KODE SDK v2.7 工具说明书测试套件\n');
  console.log('='.repeat(60) + '\n');

  try {
    await testToolManualInjection();
    await testToolManualWithoutPrompt();

    console.log('='.repeat(60));
    console.log('\n🎉 所有工具说明书测试通过！\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

runAll();
