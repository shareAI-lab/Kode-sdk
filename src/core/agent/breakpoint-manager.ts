import { BreakpointState } from '../types';

export interface BreakpointEntry {
  state: BreakpointState;
  timestamp: number;
  note?: string;
}

export class BreakpointManager {
  private current: BreakpointState = 'READY';
  private history: BreakpointEntry[] = [];

  constructor(
    private readonly onChange?: (previous: BreakpointState, next: BreakpointState, entry: BreakpointEntry) => void
  ) {}

  getCurrent(): BreakpointState {
    return this.current;
  }

  getHistory(): ReadonlyArray<BreakpointEntry> {
    return this.history;
  }

  set(state: BreakpointState, note?: string): void {
    if (this.current === state) return;
    const entry: BreakpointEntry = {
      state,
      timestamp: Date.now(),
      note,
    };
    const previous = this.current;
    this.current = state;
    this.history.push(entry);
    if (this.onChange) {
      this.onChange(previous, state, entry);
    }
  }

  reset(state: BreakpointState = 'READY'): void {
    this.current = state;
    this.history = [];
  }
}
