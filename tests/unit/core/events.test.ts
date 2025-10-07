import { EventBus } from '../../../src/core/events';
import { TestRunner, expect } from '../../helpers/utils';
import { Timeline } from '../../../src/core/types';
import { AgentChannel, Bookmark } from '../../../src/core/types';

class StubStore {
  public timelines: Timeline[] = [];
  public failures = 0;
  constructor(private readonly failFirst: boolean = false) {}

  async appendEvent(agentId: string, timeline: Timeline): Promise<void> {
    if (this.failFirst && this.failures === 0 && timeline.event.type === 'done') {
      this.failures += 1;
      throw new Error('disk full');
    }
    this.timelines.push(timeline);
  }

  async *readEvents(agentId: string, opts?: { since?: Bookmark; channel?: AgentChannel }): AsyncIterable<Timeline> {
    for (const entry of this.timelines) {
      if (opts?.channel && entry.event.channel !== opts.channel) continue;
      if (opts?.since && entry.bookmark.seq <= opts.since.seq) continue;
      yield entry;
    }
  }
}

const runner = new TestRunner('EventBus');

runner
  .test('订阅Progress事件并支持Kinds过滤', async () => {
    const bus = new EventBus();
    const received: string[] = [];

    const pump = (async () => {
      for await (const envelope of bus.subscribe(['progress'], { kinds: ['text_chunk', 'done'] })) {
        received.push(String(envelope.event.type));
        if (envelope.event.type === 'done') break;
      }
    })();

    bus.emitProgress({ channel: 'progress', type: 'text_chunk', step: 1, delta: 'hi' });
    bus.emitProgress({ channel: 'progress', type: 'tool_call', tool: 'fs_read' } as any);
    bus.emitProgress({ channel: 'progress', type: 'done', step: 1, reason: 'completed' });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await pump;

    expect.toDeepEqual(received, ['text_chunk', 'done']);
  })

  .test('EventBus 持久化失败会缓存关键事件', async () => {
    const store = new StubStore(true);
    const bus = new EventBus();
    bus.setStore(store as any, 'agent-1');

    bus.emitProgress({ channel: 'progress', type: 'text_chunk', step: 1, delta: 'hi' });
    bus.emitProgress({ channel: 'progress', type: 'done', step: 1, reason: 'completed' });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect.toEqual(bus.getFailedEventCount() > 0, true);

    // 重新触发存储成功
    await bus.flushFailedEvents();
    expect.toEqual(bus.getFailedEventCount(), 0);
    expect.toEqual(store.timelines.length >= 2, true);
  })

  .test('历史补播可通过Bookmark过滤', async () => {
    const store = new StubStore();
    const bus = new EventBus();
    bus.setStore(store as any, 'agent-1');

    const first = bus.emitProgress({ channel: 'progress', type: 'text_chunk', step: 1, delta: 'A' });
    const second = bus.emitProgress({ channel: 'progress', type: 'text_chunk', step: 2, delta: 'B' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const replayed: string[] = [];
    for await (const envelope of bus.subscribe(['progress'], { since: first.bookmark })) {
      if (envelope.event.type === 'text_chunk') {
        replayed.push(String((envelope.event as any).delta));
        break;
      }
    }

    expect.toDeepEqual(replayed, ['B']);
  });

export async function run() {
  return await runner.run();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
