import { FsRead, FsWrite, FsEdit, Tool, toolTune } from './fs';
import { BashRun, BashLogs, BashKill } from './bash';
import { TaskRun, AgentTemplate } from './task';

export const builtin = {
  fs(opts?: { workDir?: string }): Tool[] {
    return [new FsRead(), new FsWrite(), new FsEdit()].map((tool) => {
      if (opts?.workDir) {
        return toolTune(tool, {
          preToolUse(call, ctx) {
            if ('file' in call.args) {
              call.args.file = ctx.sandbox.fs.resolve(call.args.file);
              if (!ctx.sandbox.fs.isInside(call.args.file)) {
                return { decision: 'deny', reason: `Path outside sandbox: ${call.args.file}` };
              }
            }
          },
          postToolUse(outcome, ctx) {
            const content = String(outcome.content || '');
            if (content.length > 100_000) {
              const tempPath = ctx.sandbox.fs.temp(`tool-${outcome.id}.log`);
              ctx.sandbox.fs.write(tempPath, content);
              return {
                update: {
                  content: content.slice(0, 100_000) + `\n\n[Full output at ./${tempPath}]`,
                },
              };
            }
          },
        });
      }
      return tool;
    });
  },

  bash(opts?: { allow?: RegExp[]; block?: RegExp[]; approval?: boolean }): Tool[] {
    const tools = [new BashRun(), new BashLogs(), new BashKill()];

    if (opts?.allow || opts?.block || opts?.approval) {
      return tools.map((tool) => {
        if (tool.name === 'Bash.Run') {
          return toolTune(tool, {
            preToolUse(call, ctx) {
              const cmd = call.args.cmd as string;

              if (opts.block) {
                for (const pattern of opts.block) {
                  if (pattern.test(cmd)) {
                    return { decision: 'deny', reason: `Blocked command pattern: ${pattern}` };
                  }
                }
              }

              if (opts.allow) {
                let allowed = false;
                for (const pattern of opts.allow) {
                  if (pattern.test(cmd)) {
                    allowed = true;
                    break;
                  }
                }
                if (!allowed) {
                  return { decision: 'deny', reason: 'Command not in allow list' };
                }
              }

              if (opts.approval) {
                return { decision: 'ask', meta: { title: 'Bash Command Approval', cmd } };
              }
            },
            postToolUse(outcome, ctx) {
              const stdout = String(outcome.content?.stdout || '');
              const stderr = String(outcome.content?.stderr || '');
              const combined = stdout + stderr;

              if (combined.length > 100_000) {
                const tempPath = ctx.sandbox.fs.temp(`bash-${outcome.id}.log`);
                ctx.sandbox.fs.write(tempPath, combined);
                return {
                  update: {
                    content: {
                      ...outcome.content,
                      stdout: stdout.slice(0, 50_000) + `\n\n[Full stdout at ./${tempPath}]`,
                      stderr: stderr.slice(0, 50_000),
                    },
                  },
                };
              }
            },
          });
        }
        return tool;
      });
    }

    return tools;
  },

  task(opts?: { subAgents?: AgentTemplate[] }): Tool {
    return new TaskRun(opts?.subAgents || []);
  },
};
