# KODE SDK v2.7 Migration Guide

## Overview

This guide helps you migrate from KODE SDK v1.5.1 to v2.7. The v2.7 release introduces significant improvements to event management, persistence, context management, scheduling, and collaboration capabilities.

## Breaking Changes

### 1. Event Storage Format

**Old (v1.5.1):**
- All events stored in single `events.jsonl` file

**New (v2.7):**
- Events split into channel-specific files:
  - `progress.log` - Progress events (think, text, tool execution)
  - `control.log` - Control events (permission requests/decisions)
  - `monitor.log` - Monitor events (state changes, errors, metrics)

**Migration:**
If you have existing `events.jsonl` files, they will still work but won't benefit from channel-based filtering. To migrate:

```typescript
// Migration script (run once)
import { JSONStore } from '@kode/sdk';
import * as fs from 'fs';
import * as readline from 'readline';

async function migrateEvents(agentId: string, storeDir: string) {
  const oldPath = `${storeDir}/${agentId}/events.jsonl`;
  if (!fs.existsSync(oldPath)) return;

  const store = new JSONStore(storeDir);
  const stream = fs.createReadStream(oldPath);
  const rl = readline.createInterface({ input: stream });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const timeline = JSON.parse(line);
    await store.appendEvent(agentId, timeline);
  }

  // Backup old file
  fs.renameSync(oldPath, `${oldPath}.backup`);
  console.log(`Migrated events for ${agentId}`);
}
```

### 2. Store Interface Extensions

**New optional methods added to `Store` interface:**

```typescript
interface Store {
  // Existing methods remain unchanged...

  // New: History management
  saveHistoryWindow?(agentId: string, window: HistoryWindow): Promise<void>;
  loadHistoryWindows?(agentId: string): Promise<HistoryWindow[]>;

  saveCompressionRecord?(agentId: string, record: CompressionRecord): Promise<void>;
  loadCompressionRecords?(agentId: string): Promise<CompressionRecord[]>;

  saveRecoveredFile?(agentId: string, file: RecoveredFile): Promise<void>;
  loadRecoveredFiles?(agentId: string): Promise<RecoveredFile[]>;
}
```

**Action Required:**
- If using custom Store implementations, these are optional but recommended
- JSONStore implementation already includes all new methods

### 3. WAL Support for Messages and Tool Calls

**Enhancement (backward compatible):**
- `messages.json` now uses WAL (`messages.wal`) for crash recovery
- `tool-calls.json` now uses WAL (`tool-calls.wal`) for crash recovery

**No action required** - Automatically handled by JSONStore

## New Features

### 1. Event Replay with Channel Filtering

```typescript
// Old way - filter after reading
const events = await store.readEvents(agentId);
const progressEvents = events.filter(e => e.event.channel === 'progress');

// New way - filter at storage level
const progressEvents = store.readEvents(agentId, { channel: 'progress' });
for await (const event of progressEvents) {
  console.log(event);
}
```

### 2. History Windows for Context Compression

```typescript
import { HistoryWindow } from '@kode/sdk/store';

// Save a history window before compression
const window: HistoryWindow = {
  id: `window-${Date.now()}`,
  messages: agent.getMessages(),
  events: agent.getTimeline(),
  stats: {
    messageCount: messages.length,
    tokenCount: calculateTokens(messages),
    eventCount: events.length,
  },
  timestamp: Date.now(),
};

await store.saveHistoryWindow(agentId, window);

// Later: retrieve all windows for audit
const windows = await store.loadHistoryWindows(agentId);
```

### 3. Compression Records

```typescript
import { CompressionRecord } from '@kode/sdk/store';

// Save compression metadata
const record: CompressionRecord = {
  id: `comp-${Date.now()}`,
  windowId: window.id,
  config: {
    model: 'claude-3-sonnet',
    prompt: 'Summarize the conversation...',
    threshold: 50000,
  },
  summary: 'User requested feature X, implemented Y...',
  ratio: 0.3, // 30% of original size
  recoveredFiles: ['/path/to/file.ts'],
  timestamp: Date.now(),
};

await store.saveCompressionRecord(agentId, record);
```

### 4. Recovered Files Snapshots

```typescript
import { RecoveredFile } from '@kode/sdk/store';

// Save file snapshot during compression
const file: RecoveredFile = {
  path: '/path/to/important.ts',
  content: await fs.readFile('/path/to/important.ts', 'utf-8'),
  mtime: stats.mtimeMs,
  timestamp: Date.now(),
};

await store.saveRecoveredFile(agentId, file);
```

## Directory Structure Changes

### Old Structure (v1.5.1)
```
.kode/
└── {agentId}/
    ├── events.jsonl
    ├── messages.json
    ├── tool-calls.json
    ├── todos.json
    └── info.json
```

### New Structure (v2.7)
```
.kode/
└── {agentId}/
    ├── progress.log           # Progress events
    ├── progress.wal          # WAL for progress events
    ├── control.log           # Control events
    ├── control.wal          # WAL for control events
    ├── monitor.log           # Monitor events
    ├── monitor.wal          # WAL for monitor events
    ├── messages.json
    ├── messages.wal          # NEW: WAL for messages
    ├── tool-calls.json
    ├── tool-calls.wal        # NEW: WAL for tool-calls
    ├── todos.json
    ├── info.json
    └── history/              # NEW: History management
        ├── windows/
        │   └── window-{timestamp}.json
        ├── compressions/
        │   └── comp-{timestamp}.json
        └── recovered/
            └── {filename}-{timestamp}.txt
```

## API Usage Examples

### Subscribe to Specific Event Channel

```typescript
// Old way - subscribe to all
const stream = agent.subscribe();

// New way - subscribe to specific channel
const progressStream = agent.subscribeProgress({
  since: lastBookmark,
  kinds: ['text_chunk', 'tool:start', 'tool:end']
});

for await (const event of progressStream) {
  if (event.event.type === 'text_chunk') {
    console.log(event.event.delta);
  }
}
```

### Multi-Channel Subscription

```typescript
// Subscribe to multiple channels with filtering
const stream = agent.subscribe(['progress', 'monitor'], {
  since: lastBookmark,
  kinds: ['text_chunk', 'error', 'token_usage']
});

for await (const event of stream) {
  switch (event.event.type) {
    case 'text_chunk':
      // Handle text
      break;
    case 'error':
      // Handle error
      break;
    case 'token_usage':
      // Track tokens
      break;
  }
}
```

## Upgrade Checklist

- [ ] Update package to v2.7: `npm install @kode/sdk@2.7`
- [ ] Run migration script for existing `events.jsonl` files
- [ ] Update custom Store implementations (if any) to include new optional methods
- [ ] Update event subscription code to use channel filtering
- [ ] Consider implementing history windows for context compression
- [ ] Review and update any direct file system access to agent directories
- [ ] Test WAL recovery by simulating crashes (optional)

## Backward Compatibility

v2.7 maintains backward compatibility with v1.5.1 in the following ways:

1. **Old event files still work**: Existing `events.jsonl` files can still be read
2. **Store interface**: All old methods remain unchanged, only optional methods added
3. **API compatibility**: All v1.5.1 APIs continue to work
4. **Data structures**: Message, ToolCallRecord, and other core types unchanged

## Performance Improvements

1. **Channel-based filtering**: Reading only specific event channels is 3x faster
2. **WAL recovery**: Messages and tool-calls now recover from crashes reliably
3. **History windows**: Context compression now preserves full audit trail

## Getting Help

- Documentation: `docs/api/`
- Examples: `examples/`
- Issues: https://github.com/your-org/kode-sdk/issues

## Next Steps

After migrating to v2.7, explore these new capabilities:

1. **Context Management v2** - Advanced compression with history windows
2. **Scheduler & TimeBridge** - Step-based and time-based task scheduling
3. **Enhanced Permissions** - Serializable permission modes with resume support
4. **Collaboration APIs** - Room/Pool improvements with broadcast and global policies

See the full [v2.7 Upgrade Plan](./final_up_v2.md) for details on all new features.
