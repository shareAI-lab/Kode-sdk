type StepCallback = (ctx: { stepCount: number }) => void | Promise<void>;
type TaskCallback = () => void | Promise<void>;

export type AgentSchedulerHandle = string;

interface StepTask {
  id: string;
  every: number;
  callback: StepCallback;
  lastTriggered: number;
}

type TriggerKind = 'steps' | 'time' | 'cron';

interface SchedulerOptions {
  onTrigger?: (info: { taskId: string; spec: string; kind: TriggerKind }) => void;
}

export class Scheduler {
  private readonly stepTasks = new Map<string, StepTask>();
  private readonly listeners = new Set<StepCallback>();
  private queued: Promise<void> = Promise.resolve();
  private readonly onTrigger?: SchedulerOptions['onTrigger'];

  constructor(opts?: SchedulerOptions) {
    this.onTrigger = opts?.onTrigger;
  }

  everySteps(every: number, callback: StepCallback): AgentSchedulerHandle {
    if (!Number.isFinite(every) || every <= 0) {
      throw new Error('everySteps: interval must be positive');
    }
    const id = this.generateId('steps');
    this.stepTasks.set(id, {
      id,
      every,
      callback,
      lastTriggered: 0,
    });
    return id;
  }

  onStep(callback: StepCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  enqueue(callback: TaskCallback): void {
    this.queued = this.queued.then(() => Promise.resolve(callback())).catch(() => undefined);
  }

  notifyStep(stepCount: number) {
    for (const listener of this.listeners) {
      void Promise.resolve(listener({ stepCount }));
    }

    for (const task of this.stepTasks.values()) {
      const shouldTrigger = stepCount - task.lastTriggered >= task.every;
      if (!shouldTrigger) continue;
      task.lastTriggered = stepCount;
      void Promise.resolve(task.callback({ stepCount }));
      this.onTrigger?.({ taskId: task.id, spec: `steps:${task.every}`, kind: 'steps' });
    }
  }

  cancel(taskId: AgentSchedulerHandle) {
    this.stepTasks.delete(taskId);
  }

  clear() {
    this.stepTasks.clear();
    this.listeners.clear();
  }

  notifyExternalTrigger(info: { taskId: string; spec: string; kind: 'time' | 'cron' }) {
    this.onTrigger?.(info);
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
