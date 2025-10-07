/**
 * 生产级测试策略文档
 *
 * 遵循测试金字塔原则，确保完整覆盖SDK的对外能力和内部逻辑
 */

# KODE SDK 生产级测试策略

## 测试金字塔

```
        /\
       /  \  E2E测试 (5%)
      /    \  真实场景、长运行流程
     /------\
    /        \  集成测试 (25%)
   /          \  真实API、工具执行、事件流
  /------------\
 /              \  单元测试 (70%)
/________________\  纯逻辑、边界条件、错误处理
```

## 测试分层原则

### 1. 单元测试 (70%)
**目标**: 测试最小逻辑单元的正确性
- ✅ **纯逻辑组件**: Store, EventBus, HookManager等
- ✅ **边界条件**: 空值、极限值、并发
- ✅ **错误处理**: 异常场景、恢复机制
- ❌ **避免**: 过度Mock依赖，失去真实性

**示例**:
```typescript
// ✅ 好的单元测试 - 测试纯逻辑
test('EventBus应该按顺序记录事件', () => {
  const bus = new EventBus();
  bus.emit('event1');
  bus.emit('event2');
  const timeline = bus.getTimeline();
  expect(timeline[0].event.type).toEqual('event1');
  expect(timeline[1].event.type).toEqual('event2');
});

// ❌ 坏的单元测试 - 过度Mock失去意义
test('Agent聊天', () => {
  const mockModel = { stream: () => 'mocked' };
  // 这里model被完全mock，测不出真实问题
});
```

### 2. 集成测试 (25%)
**目标**: 测试多模块协作和真实API交互
- ✅ **真实API调用**: 使用真实模型（配额允许）
- ✅ **工具实际执行**: 真实文件操作、Bash命令
- ✅ **事件流完整性**: 验证Progress/Control/Monitor
- ✅ **Resume/Fork机制**: 持久化和恢复

**示例**:
```typescript
// ✅ 真实集成测试
test('Agent应该能创建并读取文件', async () => {
  const agent = await createRealAgent(); // 真实API
  await agent.chat('创建文件test.txt内容为Hello');

  // 验证文件真的被创建了
  const exists = fs.existsSync(workDir + '/test.txt');
  expect(exists).toBeTruthy();

  // 验证内容正确
  const content = fs.readFileSync(workDir + '/test.txt', 'utf-8');
  expect(content).toContain('Hello');
});
```

### 3. E2E测试 (5%)
**目标**: 测试完整业务场景
- ✅ **长运行流程**: 多轮对话、状态保持
- ✅ **协作场景**: Pool、Room多Agent
- ✅ **自愈机制**: 崩溃恢复、文件变更侦测
- ✅ **真实用例**: 代码审查、多Agent开发

## 当前问题诊断

### ❌ 问题1: 过度依赖Mock
```typescript
// 当前做法
const { agent } = await createUnitTestAgent({
  mockResponses: ['Hello'],
});
const result = await agent.chat('Hi');
// 问题: 测不出真实模型调用、工具执行、事件流
```

**改进方案**:
- 单元测试: 只Mock外部依赖（API），不Mock内部逻辑
- 集成测试: 使用真实API（配额控制）
- E2E测试: 完全真实环境

### ❌ 问题2: 覆盖不足

当前仅16个测试，缺失：
- [ ] Store持久化和恢复
- [ ] Sandbox边界检查
- [ ] FilePool文件监控
- [ ] ContextManager压缩
- [ ] Pool并发管理
- [ ] Room消息路由
- [ ] Scheduler定时任务
- [ ] Resume崩溃恢复
- [ ] Fork状态隔离
- [ ] 工具并发执行
- [ ] 权限审批流程
- [ ] Hook链式执行
- [ ] Todo提醒机制
- [ ] 错误边界处理

### ❌ 问题3: 缺少真实场景

当前测试都是孤立的API调用，缺少：
- [ ] 多轮对话上下文保持
- [ ] 工具调用链
- [ ] 事件订阅者收到完整流
- [ ] 外部文件变更触发提醒
- [ ] 崩溃后Resume继续运行
- [ ] 多Agent协作通信

## 生产级测试清单

### 核心功能测试 (必须100%覆盖)

#### Agent生命周期
- [x] 创建Agent
- [x] 单轮对话
- [x] 多轮对话
- [x] 快照和恢复
- [x] Fork分叉
- [x] 中断执行
- [ ] Resume从崩溃恢复
- [ ] Resume继续未完成的工具调用
- [ ] 状态持久化和重建
- [ ] 上下文压缩触发

#### 事件系统
- [x] Progress事件发射
- [x] Control事件发射
- [x] Monitor事件发射
- [x] 事件订阅和过滤
- [x] Timeline记录
- [ ] 事件持久化
- [ ] 历史事件回放
- [ ] 多订阅者并发
- [ ] 事件书签（since参数）

#### 工具执行
- [ ] 文件读写（真实操作）
- [ ] 文件编辑冲突检测
- [ ] Bash命令执行
- [ ] Bash后台任务
- [ ] 工具并发执行
- [ ] 工具超时处理
- [ ] 工具错误恢复
- [ ] 工具参数验证

#### 权限系统
- [ ] auto模式自动执行
- [ ] approval模式请求审批
- [ ] readonly模式拒绝写入
- [ ] 审批通过后执行
- [ ] 审批拒绝后跳过
- [ ] 审批超时处理

#### Hook机制
- [x] preToolUse拦截
- [x] postToolUse修改结果
- [x] Hook链式调用
- [ ] Hook deny阻止执行
- [ ] Hook提供直接结果
- [ ] Hook错误不影响主流程

#### Todo系统
- [ ] CRUD操作
- [ ] 唯一in_progress验证
- [ ] ID唯一性验证
- [ ] 空title拒绝
- [ ] todo_changed事件
- [ ] todo_reminder触发
- [ ] 外部修改检测

#### 协作功能
- [ ] Pool创建和管理
- [ ] Pool容量限制
- [ ] Room成员管理
- [ ] Room消息广播
- [ ] Room @mention定向
- [ ] Scheduler定时任务
- [ ] Scheduler取消任务

#### 基础设施
- [ ] Store消息持久化
- [ ] Store事件持久化
- [ ] Store Todo持久化
- [ ] Sandbox边界检查
- [ ] Sandbox文件监控
- [ ] FilePool新鲜度检测
- [ ] FilePool变更提醒
- [ ] ContextManager分析
- [ ] ContextManager压缩

### 边界和错误测试

#### 边界条件
- [ ] 空消息
- [ ] 超长消息
- [ ] 并发对话
- [ ] 快速连续调用
- [ ] 大文件读写
- [ ] 深层嵌套工具调用
- [ ] 循环引用检测

#### 错误处理
- [ ] 模型API错误
- [ ] 工具执行失败
- [ ] 文件不存在
- [ ] 权限拒绝
- [ ] 网络超时
- [ ] 存储失败
- [ ] 并发冲突

#### 恢复机制
- [ ] 崩溃后Resume
- [ ] 未完成工具封口
- [ ] 消息完整性检查
- [ ] 状态一致性恢复

## 测试规范

### 命名规范
```typescript
// ✅ 描述性测试名
test('Agent在文件被外部修改后应该发送file_changed事件')
test('Pool达到容量限制后应该拒绝新Agent并抛出错误')
test('Resume策略为crash时应该自动封口未完成的工具调用')

// ❌ 模糊的测试名
test('测试Agent')
test('文件功能')
```

### 断言规范
```typescript
// ✅ 精确断言
expect(result.status).toEqual('ok');
expect(result.permissionIds).toHaveLength(0);
expect(timeline).toContainEvent({ type: 'file_changed', path: 'test.txt' });

// ❌ 宽松断言
expect(result).toBeTruthy();
expect(timeline.length > 0);
```

### 清理规范
```typescript
// ✅ 每个测试后清理
afterEach(() => {
  cleanup();
  resetMocks();
});

// ❌ 不清理造成污染
// 测试间相互影响
```

## Mock使用原则

### 何时Mock
1. **外部API**: 第三方服务（支付、邮件）
2. **慢速操作**: 仅在单元测试中Mock
3. **不可控因素**: 随机数、时间戳

### 何时不要Mock
1. **SDK内部逻辑**: Store, EventBus, HookManager等
2. **工具执行**: 文件操作、Bash命令
3. **模型调用**: 集成测试中使用真实API
4. **事件流**: 完整的事件发射和订阅

### Mock示例
```typescript
// ✅ 合理的Mock
const mockPaymentService = {
  charge: jest.fn(() => Promise.resolve({ success: true }))
};

// ❌ 过度Mock
const mockAgent = {
  chat: () => 'mocked',
  events: { subscribe: () => [] },
  // 这样测不出任何问题
};
```

## 执行策略

### 本地开发
```bash
npm test              # 快速单元测试
npm run test:watch    # 监听模式
```

### CI/CD
```bash
npm run test:unit           # 所有单元测试
npm run test:integration    # 集成测试（需API配额）
npm run test:e2e           # E2E测试（仅main分支）
npm run test:coverage      # 覆盖率报告（>=80%）
```

### 性能基准
- 单元测试: <100ms/用例
- 集成测试: <5s/用例
- E2E测试: <30s/场景

## 覆盖率目标

- **整体**: ≥80%
- **核心模块**: ≥90% (Agent, EventBus, Store)
- **工具**: ≥85% (fs, bash, todo)
- **基础设施**: ≥80% (Sandbox, Provider)

## 下一步行动

1. ✅ 补充单元测试覆盖所有核心模块
2. ✅ 增加真实API集成测试
3. ✅ 添加E2E场景测试
4. ✅ 实现测试覆盖率报告
5. ✅ 建立CI/CD测试流水线
