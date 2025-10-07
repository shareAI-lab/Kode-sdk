/**
 * 测试辅助工具函数
 */

import assert from 'assert';

/**
 * 测试结果
 */
export interface TestResult {
  passed: number;
  failed: number;
  failures: Array<{
    name: string;
    error: Error;
  }>;
}

/**
 * 测试套件运行器
 */
export class TestRunner {
  private tests: Array<[string, () => Promise<void>]> = [];
  private suiteName: string;
  private beforeAllHooks: Array<() => Promise<void> | void> = [];
  private afterAllHooks: Array<() => Promise<void> | void> = [];
  private beforeEachHooks: Array<() => Promise<void> | void> = [];
  private afterEachHooks: Array<() => Promise<void> | void> = [];
  private skipped: Array<string> = [];

  constructor(suiteName: string) {
    this.suiteName = suiteName;
  }

  /**
   * 添加测试用例
   */
  test(name: string, fn: () => Promise<void>): this {
    this.tests.push([name, fn]);
    return this;
  }

  skip(name: string): this {
    this.skipped.push(name);
    return this;
  }

  beforeAll(fn: () => Promise<void> | void): this {
    this.beforeAllHooks.push(fn);
    return this;
  }

  afterAll(fn: () => Promise<void> | void): this {
    this.afterAllHooks.push(fn);
    return this;
  }

  beforeEach(fn: () => Promise<void> | void): this {
    this.beforeEachHooks.push(fn);
    return this;
  }

  afterEach(fn: () => Promise<void> | void): this {
    this.afterEachHooks.push(fn);
    return this;
  }

  /**
   * 运行所有测试
   */
  async run(): Promise<TestResult> {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${this.suiteName}`);
    console.log(`${'='.repeat(70)}\n`);

    let passed = 0;
    let failed = 0;
    const failures: Array<{ name: string; error: Error }> = [];

    if (this.skipped.length > 0) {
      for (const name of this.skipped) {
        console.log(`  • ${name}... ↷ 跳过`);
      }
    }

    for (const hook of this.beforeAllHooks) {
      await hook();
    }

    for (const [name, fn] of this.tests) {
      for (const hook of this.beforeEachHooks) {
        await hook();
      }

      process.stdout.write(`  • ${name}... `);
      try {
        const start = Date.now();
        await fn();
        const duration = Date.now() - start;
        console.log(`✓ (${duration}ms)`);
        passed++;
      } catch (error: any) {
        console.log('✗');
        console.error(`    ${error.message}`);
        failures.push({ name, error });
        failed++;
      }

      for (const hook of this.afterEachHooks) {
        await hook();
      }
    }

    for (const hook of this.afterAllHooks) {
      await hook();
    }

    console.log(`\n  总计: ${passed} 通过, ${failed} 失败\n`);

    return { passed, failed, failures };
  }
}

/**
 * 断言辅助函数
 */
export const expect = {
  /**
   * 断言值为真
   */
  toBeTruthy(value: any, message?: string): void {
    assert.ok(value, message || 'Expected value to be truthy');
  },

  /**
   * 断言值为假
   */
  toBeFalsy(value: any, message?: string): void {
    assert.ok(!value, message || 'Expected value to be falsy');
  },

  /**
   * 断言相等
   */
  toEqual<T>(actual: T, expected: T, message?: string): void {
    assert.strictEqual(actual, expected, message || `Expected ${actual} to equal ${expected}`);
  },

  /**
   * 断言深度相等
   */
  toDeepEqual<T>(actual: T, expected: T, message?: string): void {
    assert.deepStrictEqual(actual, expected, message || 'Expected deep equality');
  },

  /**
   * 断言包含
   */
  toContain(haystack: string | any[], needle: any, message?: string): void {
    if (typeof haystack === 'string') {
      assert.ok(
        haystack.includes(needle),
        message || `Expected "${haystack}" to contain "${needle}"`
      );
    } else {
      assert.ok(
        haystack.includes(needle),
        message || `Expected array to contain ${needle}`
      );
    }
  },

  /**
   * 断言抛出错误
   */
  async toThrow(fn: () => Promise<void>, expectedMessage?: string): Promise<void> {
    let thrown = false;
    try {
      await fn();
    } catch (error: any) {
      thrown = true;
      if (expectedMessage) {
        assert.ok(
          error.message.includes(expectedMessage),
          `Expected error message to include "${expectedMessage}", got "${error.message}"`
        );
      }
    }
    assert.ok(thrown, 'Expected function to throw an error');
  },

  /**
   * 断言大于
   */
  toBeGreaterThan(actual: number, expected: number, message?: string): void {
    assert.ok(
      actual > expected,
      message || `Expected ${actual} to be greater than ${expected}`
    );
  },

  toBeGreaterThanOrEqual(actual: number, expected: number, message?: string): void {
    assert.ok(
      actual >= expected,
      message || `Expected ${actual} to be greater than or equal to ${expected}`
    );
  },

  /**
   * 断言数组长度
   */
  toHaveLength(array: any[], length: number, message?: string): void {
    assert.strictEqual(
      array.length,
      length,
      message || `Expected array to have length ${length}, got ${array.length}`
    );
  },
};

/**
 * 性能测量
 */
export async function measurePerformance<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * 重试辅助函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * 并发执行
 */
export async function concurrent<T>(
  fns: Array<() => Promise<T>>
): Promise<T[]> {
  return Promise.all(fns.map(fn => fn()));
}
