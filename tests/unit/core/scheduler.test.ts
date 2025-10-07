import { Scheduler } from '../../../src/core/scheduler';
import { TimeBridge } from '../../../src/core/time-bridge';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('调度系统');

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runner
  .test('步进调度按间隔触发', async () => {
    const scheduler = new Scheduler();
    const fired: number[] = [];

    scheduler.everySteps(2, ({ stepCount }) => {
      fired.push(stepCount);
    });

    scheduler.notifyStep(1);
    scheduler.notifyStep(2);
    scheduler.notifyStep(3);
    scheduler.notifyStep(4);

    await delay(5);
    expect.toDeepEqual(fired, [2, 4]);
  })

  .test('队列任务串行执行并支持取消', async () => {
    const scheduler = new Scheduler();
    const order: number[] = [];

    const handle = scheduler.everySteps(1, () => {
      order.push(1);
    });
    scheduler.enqueue(async () => {
      await delay(5);
      order.push(2);
    });
    scheduler.enqueue(async () => {
      order.push(3);
    });

    scheduler.notifyStep(1);
    await delay(20);
    scheduler.cancel(handle);
    scheduler.notifyStep(2);
    await delay(10);

    expect.toContain(order.join(','), '1');
    expect.toContain(order.join(','), '2,3');
  })

  .test('TimeBridge 支持定时任务与停止', async () => {
    const scheduler = new Scheduler();
    const bridge = new TimeBridge({ scheduler, driftToleranceMs: 1000 });
    let ticks = 0;

    const id = bridge.everyMinutes(1 / 60, () => {
      ticks += 1;
    });

    await delay(1200);
    bridge.stop(id);

    expect.toEqual(ticks > 0, true);
  })

  .test('clear 会移除所有监听', async () => {
    const scheduler = new Scheduler();
    let counter = 0;

    scheduler.everySteps(1, () => {
      counter++;
    });
    scheduler.notifyStep(1);
    await delay(5);
    expect.toEqual(counter, 1);

    scheduler.clear();
    scheduler.notifyStep(2);
    await delay(5);
    expect.toEqual(counter, 1);
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
