/**
 * 文件系统工具集成测试
 */

import path from 'path';
import fs from 'fs';
import { createIntegrationTestAgent } from '../../helpers/setup';
import { TestRunner, expect } from '../../helpers/utils';

const runner = new TestRunner('集成测试 - 文件系统工具');

runner
  .test('创建文件', async () => {
    const { agent, workDir, cleanup } = await createIntegrationTestAgent();

    await agent.chat('请使用 fs_write 工具创建 test.txt 并写入 “Hello Test Integration”。完成后告知我。');

    const testFile = path.join(workDir, 'test.txt');
    expect.toEqual(fs.existsSync(testFile), true);
    const content = fs.readFileSync(testFile, 'utf-8');
    expect.toContain(content, 'Hello Test Integration');

    await cleanup();
  })

  .test('读取和编辑文件', async () => {
    const { agent, workDir, cleanup } = await createIntegrationTestAgent();

    // 创建测试文件
    const testFile = path.join(workDir, 'edit.txt');
    fs.writeFileSync(testFile, 'Original Content');

    await agent.chat('请严格使用 fs_read 工具读取 edit.txt，并确认返回内容中的文本。');
    const r2 = await agent.chat('请使用 fs_edit 将 edit.txt 中的 Original 替换为 Modified，并确认替换成功。');

    const content = fs.readFileSync(testFile, 'utf-8');
    expect.toContain(content, 'Modified');

    await cleanup();
  });

export async function run() {
  return await runner.run();
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
