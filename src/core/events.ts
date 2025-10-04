import { AgentEvent, AgentEventKind, Timeline, MINIMAL_EVENT_KINDS } from '../core/types';
import { Store } from '../infra/store';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export class EventBus extends EventEmitter {
  private cursor = 0;
  private timeline: Timeline[] = [];
  private subscribers = new Set<EventSubscriber>();
  private store?: Store;
  private sessionId?: string;

  setStore(store: Store, sessionId: string) {
    this.store = store;
    this.sessionId = sessionId;
  }

  emitEvent(event: any): number {
    const cursor = this.cursor++;
    const eventId = randomUUID();
    const timestamp = Date.now();
    const fullEvent = { ...event, cursor, eventId, timestamp };
    const timeline: Timeline = { cursor, event: fullEvent };

    this.timeline.push(timeline);

    // Memory management: keep only last 10k events in memory
    if (this.timeline.length > 10000) {
      this.timeline = this.timeline.slice(-5000);
    }

    // Persist to store if configured
    if (this.store && this.sessionId) {
      this.store.appendEvent(this.sessionId, timeline).catch((err) => {
        // Log error but don't block event emission
        console.error('Failed to persist event:', err);
      });
    }

    // Notify all subscribers
    for (const subscriber of this.subscribers) {
      if (subscriber.accepts(fullEvent.type)) {
        subscriber.push(fullEvent);
      }
    }

    // Emit control plane events
    this.emit(event.type, fullEvent);

    return cursor;
  }

  subscribe(opts?: { since?: number; kinds?: AgentEventKind[] }): AsyncIterable<AgentEvent> {
    const subscriber = new EventSubscriber(opts?.kinds || MINIMAL_EVENT_KINDS);
    this.subscribers.add(subscriber);

    // Replay past events if since is specified
    if (opts?.since !== undefined) {
      const past = this.timeline.filter((t) => t.cursor >= opts.since!);
      for (const t of past) {
        if (subscriber.accepts(t.event.type)) {
          subscriber.push(t.event);
        }
      }
    }

    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          const event = await subscriber.next();
          if (!event) {
            this.subscribers.delete(subscriber);
            return { done: true, value: undefined };
          }
          return { done: false, value: event };
        },
      }),
    };
  }

  getTimeline(since?: number): Timeline[] {
    return since !== undefined ? this.timeline.filter((t) => t.cursor >= since) : this.timeline;
  }

  getCursor(): number {
    return this.cursor;
  }

  reset() {
    this.cursor = 0;
    this.timeline = [];
    this.subscribers.clear();
  }
}

class EventSubscriber {
  private queue: AgentEvent[] = [];
  private waiting: ((event: AgentEvent | null) => void) | null = null;
  private closed = false;

  constructor(private kinds: AgentEventKind[]) {}

  accepts(kind: AgentEventKind): boolean {
    return this.kinds.includes(kind);
  }

  push(event: AgentEvent) {
    if (this.closed) return;

    if (this.waiting) {
      this.waiting(event);
      this.waiting = null;
    } else {
      this.queue.push(event);
    }
  }

  async next(): Promise<AgentEvent | null> {
    if (this.closed) return null;
    if (this.queue.length > 0) return this.queue.shift()!;

    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  close() {
    this.closed = true;
    if (this.waiting) {
      this.waiting(null);
      this.waiting = null;
    }
  }
}
