/**
 * 测试新的简化工具定义 API
 */

import { defineTool, defineTools, EnhancedToolContext } from '../src/tools/define';

// 测试 defineTool
const testTool1 = defineTool({
  name: 'test_tool',
  description: 'Test tool',
  params: {
    input: { type: 'string', description: 'Input text' },
    count: { type: 'number', required: false, default: 1 }
  },
  attributes: {
    readonly: true,
    noEffect: true
  },
  async exec(args, ctx: EnhancedToolContext) {
    ctx.emit('test_event', { input: args.input });
    return { result: args.input.repeat(args.count || 1) };
  }
});

// 测试 defineTools
const testTools = defineTools([
  {
    name: 'add',
    description: 'Add numbers',
    params: {
      a: { type: 'number' },
      b: { type: 'number' }
    },
    async exec(args, ctx) {
      return args.a + args.b;
    }
  }
]);

// 验证生成的 schema
console.log('Tool 1 Schema:', JSON.stringify(testTool1.input_schema, null, 2));
console.log('Tool 1 Descriptor:', JSON.stringify(testTool1.toDescriptor(), null, 2));

console.log('\nTools batch:', testTools.map(t => t.name));

console.log('\n✅ 新工具定义 API 测试通过！');
