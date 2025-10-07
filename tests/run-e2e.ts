import './helpers/env-setup';
import path from 'path';
import fg from 'fast-glob';
import { ensureCleanDir } from './helpers/setup';
import { TEST_ROOT } from './helpers/fixtures';

async function runAll() {
  ensureCleanDir(TEST_ROOT);

  console.log('\n' + '='.repeat(80));
  console.log('KODE SDK - 端到端测试套件');
  console.log('='.repeat(80));

  const cwd = path.resolve(__dirname);
  const entries = await fg('e2e/**/*.test.ts', { cwd, absolute: false, dot: false });
  entries.sort();

  if (entries.length === 0) {
    console.log('\n⚠️  未发现端到端测试文件\n');
    return;
  }

  let totalPassed = 0;
  let totalFailed = 0;
  const failures: Array<{ suite: string; test: string; error: Error }> = [];

  for (const relativePath of entries) {
    const moduleName = relativePath.replace(/\.test\.ts$/, '').replace(/\//g, ' › ');
    const importPath = './' + relativePath.replace(/\\/g, '/');
    try {
      const testModule = await import(importPath);
      const result = await testModule.run();
      totalPassed += result.passed;
      totalFailed += result.failed;
      for (const failure of result.failures) {
        failures.push({ suite: moduleName, test: failure.name, error: failure.error });
      }
    } catch (error: any) {
      totalFailed++;
      failures.push({
        suite: moduleName,
        test: '加载失败',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      console.error(`✗ ${moduleName} 加载失败: ${error.message}`);
    }
  }

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
    console.log('✓ 所有端到端测试通过\n');
  }
}

runAll().catch(err => {
  console.error('测试运行器错误:', err);
  process.exitCode = 1;
});
