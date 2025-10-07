export class ToolRunner {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency <= 0) {
      throw new Error('ToolRunner requires a positive concurrency limit');
    }
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = () => {
        this.active += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1;
            this.flush();
          });
      };

      if (this.active < this.concurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  clear(): void {
    this.queue.length = 0;
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    if (this.active >= this.concurrency) return;
    const next = this.queue.shift();
    if (next) next();
  }
}
