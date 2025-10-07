// 统一的工具定义 API (v2.0 推荐)
export { tool, tools } from './tool';
export type { ToolDefinition, EnhancedToolContext } from './tool';

// 简化的工具定义 API (保留兼容)
export { defineTool, defineTools, extractTools } from './define';
export type { SimpleToolDef, ToolAttributes, ParamDef } from './define';

// MCP 集成
export { getMCPTools, disconnectMCP, disconnectAllMCP } from './mcp';
export type { MCPConfig, MCPTransportType } from './mcp';

// 工具注册表
export { ToolRegistry, globalToolRegistry } from './registry';
export type { ToolInstance, ToolDescriptor, ToolFactory, ToolSource } from './registry';

// 内置工具
export * as builtin from './builtin';
