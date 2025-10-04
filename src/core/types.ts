// Core data structures for Agent Model Client SDK

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: any; is_error?: boolean };

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  role: MessageRole;
  content: ContentBlock[];
}

export type AgentState = 'READY' | 'PAUSED' | 'BUSY';

export type ErrorKind =
  | 'ProviderError'
  | 'ToolTimeout'
  | 'ToolDenied'
  | 'PermissionPending'
  | 'PolicyViolation'
  | 'StoreError'
  | 'MCPError';

export type AgentEventKind =
  | 'text_chunk'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'usage'
  | 'error'
  | 'messages_update'
  | 'permission_ask'
  | 'permission_decision'
  | 'commit'
  | 'state'
  | 'resume'
  | 'forked';

export type AgentEvent =
  | { type: 'text_chunk'; cursor: number; eventId: string; timestamp: number; delta: string }
  | { type: 'text'; cursor: number; eventId: string; timestamp: number; text: string }
  | { type: 'tool_use'; cursor: number; eventId: string; timestamp: number; id: string; name: string; input: any }
  | {
      type: 'tool_result';
      cursor: number;
      eventId: string;
      timestamp: number;
      id: string;
      name: string;
      ok: boolean;
      content: any;
      duration_ms?: number;
    }
  | {
      type: 'usage';
      cursor: number;
      eventId: string;
      timestamp: number;
      data: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        cost_usd?: number;
        latency_ms?: number;
      };
    }
  | { type: 'error'; cursor: number; eventId: string; timestamp: number; kind: ErrorKind; message: string; hint?: string }
  | { type: 'messages_update'; cursor: number; eventId: string; timestamp: number; messageCount: number; lastSfpIndex: number; added?: number }
  | {
      type: 'permission_ask';
      cursor: number;
      eventId: string;
      timestamp: number;
      id: string;
      tool: string;
      args: any;
      meta?: any;
      respond: (decision: 'allow' | 'deny', note?: string) => Promise<void>;
    }
  | {
      type: 'permission_decision';
      cursor: number;
      eventId: string;
      timestamp: number;
      id: string;
      decision: 'allow' | 'deny';
      by: 'api' | 'respond';
    }
  | { type: 'commit'; cursor: number; eventId: string; timestamp: number; sfpIndex: number }
  | { type: 'state'; cursor: number; eventId: string; timestamp: number; state: AgentState }
  | {
      type: 'resume';
      cursor: number;
      eventId: string;
      timestamp: number;
      from: 'crash' | 'manual';
      sealed: Array<{ tool_use_id: string; note: string }>;
    }
  | { type: 'forked'; cursor: number; eventId: string; timestamp: number; childSessionId: string; from: SnapshotId };

export const MINIMAL_EVENT_KINDS: AgentEventKind[] = [
  'text_chunk',
  'text',
  'tool_use',
  'tool_result',
  'usage',
  'error',
  'messages_update',
];

export interface Timeline {
  cursor: number;
  event: AgentEvent;
}

export type SnapshotId = string;

export interface Snapshot {
  id: SnapshotId;
  messages: Message[];
  lastSfpIndex: number;
  createdAt: string;
}

export interface SubscribeOptions {
  since?: number;
  kinds?: AgentEventKind[];
}

export interface AgentStatus {
  state: AgentState;
  sessionId: string;
  messageCount: number;
  lastSfpIndex: number;
  cursor: number;
}

export interface AgentInfo {
  sessionId: string;
  templateId: string;
  createdAt: string;
  lineage: string[];
  messageCount: number;
  lastSfpIndex: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
  sessionId: string;
}

export interface ToolOutcome {
  id: string;
  name: string;
  ok: boolean;
  content: any;
  duration_ms?: number;
}

export type HookDecision =
  | { decision: 'ask'; meta?: any }
  | { decision: 'deny'; reason?: string; toolResult?: any }
  | { result: any }
  | void;

export type PostHookResult =
  | void
  | { update: Partial<ToolOutcome> }
  | { replace: ToolOutcome };

export interface ToolContext {
  sessionId: string;
  sandbox: import('../infra/sandbox').Sandbox;
  agent: any; // Circular dependency - will be narrowed at usage site
}
