/**
 * 所有测试运行器
 */

import './helpers/env-setup';
import path from 'path';
import fg from 'fast-glob';
import { ensureCleanDir } from './helpers/setup';
import { TEST_ROOT } from './helpers/fixtures';

interface SuiteResult {
  suite: string;
  passed: number;
  failed: number;
  failures: Array<{ suite: string; test: string; error: Error }>;
}

async function runSuite(globPattern: string, label: string): Promise<SuiteResult> {
  const cwd = path.resolve(__dirname);
  const entries = await fg(globPattern, { cwd, absolute: false, dot: false });
  entries.sort();

  let passed = 0;
  let failed = 0;
  const failures: SuiteResult['failures'] = [];

  console.log(`\n▶ 运行${label}...\n`);

  for (const relativePath of entries) {
    const moduleName = relativePath.replace(/\.test\.ts$/, '').replace(/\//g, ' › ');
    const importPath = './' + relativePath.replace(/\\/g, '/');
    try {
      const testModule = await import(importPath);
      const result = await testModule.run();
      passed += result.passed;
      failed += result.failed;
      for (const failure of result.failures) {
        failures.push({ suite: moduleName, test: failure.name, error: failure.error });
      }
    } catch (error: any) {
      failed++;
      failures.push({
        suite: moduleName,
        test: '加载失败',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      console.error(`✗ ${moduleName} 加载失败: ${error.message}`);
    }
  }

  return { suite: label, passed, failed, failures };
}

async function runAll() {
  ensureCleanDir(TEST_ROOT);

  console.log('\n' + '='.repeat(80));
  console.log('KODE SDK - 完整测试套件');
  console.log('='.repeat(80) + '\n');

  const results: SuiteResult[] = [];

  results.push(await runSuite('unit/**/*.test.ts', '单元测试'));
  results.push(await runSuite('integration/**/*.test.ts', '集成测试'));
  results.push(await runSuite('e2e/**/*.test.ts', '端到端测试'));

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const failures = results.flatMap(r => r.failures);

  console.log('\n' + '='.repeat(80));
  console.log(`总结: ${totalPassed} 通过, ${totalFailed} 失败`);
  console.log('='.repeat(80) + '\n');

  if (failures.length > 0) {
    console.log('失败详情:');
    for (const failure of failures) {
      console.log(`  [${failure.suite}] ${failure.test}`);
      console.log(`    ${failure.error.message}`);
    }
    console.log('');
  }

  if (totalFailed > 0) {
    process.exitCode = 1;
  } else {
    console.log('✓ 所有测试通过\n');
  }
}

runAll().catch(err => {
  console.error('测试运行器错误:', err);
  process.exitCode = 1;
});
