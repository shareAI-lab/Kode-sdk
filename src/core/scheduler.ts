type TimeInterval = string;
type ScheduleCallback = (ctx?: any) => void | Promise<void>;

interface ScheduledTask {
  id: string;
  type: 'time' | 'step' | 'daily' | 'weekly';
  spec: string | number;
  callback: ScheduleCallback;
  lastRun?: number;
  enabled: boolean;
}

export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private stepCounters = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];

  every(interval: TimeInterval, callback: ScheduleCallback): this {
    const ms = this.parseInterval(interval);
    const id = `time-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const task: ScheduledTask = {
      id,
      type: 'time',
      spec: interval,
      callback,
      enabled: true,
    };

    this.tasks.set(id, task);

    const timer = setInterval(() => {
      if (task.enabled) {
        task.callback({ count: 0, type: 'time', id });
        task.lastRun = Date.now();
      }
    }, ms);

    this.timers.push(timer);

    return this;
  }

  everySteps(steps: number, callback: ScheduleCallback, targetId?: string): this {
    const id = targetId || `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const task: ScheduledTask = {
      id,
      type: 'step',
      spec: steps,
      callback,
      enabled: true,
    };

    this.tasks.set(id, task);
    this.stepCounters.set(id, 0);

    return this;
  }

  daily(time: string, callback: ScheduleCallback): this {
    const id = `daily-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const task: ScheduledTask = {
      id,
      type: 'daily',
      spec: time,
      callback,
      enabled: true,
    };

    this.tasks.set(id, task);
    this.scheduleDailyTask(task);

    return this;
  }

  weekly(dayTime: string, callback: ScheduleCallback): this {
    const id = `weekly-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const task: ScheduledTask = {
      id,
      type: 'weekly',
      spec: dayTime,
      callback,
      enabled: true,
    };

    this.tasks.set(id, task);
    this.scheduleWeeklyTask(task);

    return this;
  }

  notifyStep(targetId?: string) {
    for (const [id, task] of this.tasks) {
      if (task.type === 'step' && (!targetId || id === targetId)) {
        const count = (this.stepCounters.get(id) || 0) + 1;
        this.stepCounters.set(id, count);

        if (count >= (task.spec as number)) {
          task.callback({ count, type: 'step', id });
          this.stepCounters.set(id, 0);
          task.lastRun = Date.now();
        }
      }
    }
  }

  stop() {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.tasks.clear();
    this.stepCounters.clear();
  }

  private parseInterval(interval: TimeInterval): number {
    const match = interval.match(/^(\d+)(s|m|h|d)$/);
    if (!match) throw new Error(`Invalid interval: ${interval}`);

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unknown unit: ${unit}`);
    }
  }

  private scheduleDailyTask(task: ScheduledTask) {
    const [hours, minutes] = (task.spec as string).split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      if (task.enabled) {
        task.callback({ time: task.spec, type: 'daily', id: task.id });
        task.lastRun = Date.now();
      }
      this.scheduleDailyTask(task);
    }, delay);

    this.timers.push(timeout as any);
  }

  private scheduleWeeklyTask(task: ScheduledTask) {
    const [day, time] = (task.spec as string).split(' ');
    const [hours, minutes] = time.split(':').map(Number);

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    const targetDay = dayMap[day];
    if (targetDay === undefined) throw new Error(`Invalid day: ${day}`);

    const now = new Date();
    const target = new Date(now);

    target.setHours(hours, minutes, 0, 0);

    const currentDay = now.getDay();
    let daysUntilTarget = targetDay - currentDay;

    if (daysUntilTarget < 0 || (daysUntilTarget === 0 && target.getTime() <= now.getTime())) {
      daysUntilTarget += 7;
    }

    target.setDate(target.getDate() + daysUntilTarget);

    const delay = target.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      if (task.enabled) {
        task.callback({ time: task.spec, type: 'weekly', id: task.id });
        task.lastRun = Date.now();
      }
      this.scheduleWeeklyTask(task);
    }, delay);

    this.timers.push(timeout as any);
  }
}

export class AgentSchedulerHandle {
  constructor(private scheduler: Scheduler, private agentId?: string) {}

  every(interval: TimeInterval, callback: ScheduleCallback): this {
    this.scheduler.every(interval, callback);
    return this;
  }

  everySteps(steps: number, callback: ScheduleCallback): this {
    this.scheduler.everySteps(steps, callback, this.agentId);
    return this;
  }

  daily(time: string, callback: ScheduleCallback): this {
    this.scheduler.daily(time, callback);
    return this;
  }

  weekly(dayTime: string, callback: ScheduleCallback): this {
    this.scheduler.weekly(dayTime, callback);
    return this;
  }
}
