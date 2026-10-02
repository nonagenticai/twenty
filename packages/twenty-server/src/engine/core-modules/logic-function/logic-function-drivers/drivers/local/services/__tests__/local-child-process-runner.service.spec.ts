import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  LOGIC_FUNCTION_RESULT_NOT_DELIVERED,
  LocalChildProcessRunnerService,
} from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/services/local-child-process-runner.service';

// These tests spawn real Node child processes: the bug they guard is a race
// between the child's asynchronous IPC write and process.exit(), which no mock
// can reproduce.
describe('LocalChildProcessRunnerService', () => {
  const service = new LocalChildProcessRunnerService();
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'lf-runner-spec-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const run = (runnerPath: string) =>
    service.runChildWithEnv({
      runnerPath,
      env: {},
      payload: { hello: 'world' },
      timeoutMs: 30_000,
    });

  it('delivers a ~1MB result in full (the child must not exit before the IPC write flushes)', async () => {
    const SIZE = 1_000_000;
    const builtFileAbsPath = join(dir, 'index.mjs');

    await fs.writeFile(
      builtFileAbsPath,
      `export const main = async () => ({ items: 'x'.repeat(${SIZE}), tail: 'END' });\n`,
      'utf8',
    );

    const runnerPath = await service.writeBootstrapRunner({
      dir,
      builtFileAbsPath,
      handlerName: 'main',
    });

    // Several runs: the old code lost every one of these, but a single run
    // could in principle be lucky on a fast machine.
    for (let i = 0; i < 3; i++) {
      const res = await run(runnerPath);

      expect(res.error).toBeUndefined();
      expect(res.ok).toBe(true);
      // Compare shape and length, not the 1MB string, so a failure stays readable.
      const result = res.result as
        | { items?: string; tail?: string }
        | undefined;

      expect(result?.items?.length).toBe(SIZE);
      expect(result?.tail).toBe('END');
    }
  }, 60_000);

  it('turns a child that exits 0 without delivering a result into an error, never an empty success', async () => {
    const runnerPath = join(dir, 'silent-runner.cjs');

    await fs.writeFile(
      runnerPath,
      `process.on('message', () => { process.exit(0); });\n`,
      'utf8',
    );

    const res = await run(runnerPath);

    expect(res.ok).toBe(false);
    expect(res.result).toBeUndefined();
    expect(res.error).toContain(LOGIC_FUNCTION_RESULT_NOT_DELIVERED);
    expect(res.errorType).toBe(LOGIC_FUNCTION_RESULT_NOT_DELIVERED);
  });

  it('turns a truncated result (send then exit before flush) into an error, never an empty success', async () => {
    const SIZE = 1_000_000;
    const runnerPath = join(dir, 'truncating-runner.cjs');

    // The exact pre-fix child pattern: asynchronous send, synchronous exit.
    await fs.writeFile(
      runnerPath,
      `process.on('message', () => {
        process.send({ ok: true, result: 'y'.repeat(${SIZE}) });
        process.exit(0);
      });\n`,
      'utf8',
    );

    for (let i = 0; i < 3; i++) {
      const res = await run(runnerPath);

      // Whatever the scheduler does, a success must carry the whole result.
      if (res.ok) {
        expect((res.result as string | undefined)?.length).toBe(SIZE);
      } else {
        expect(res.error).toContain(LOGIC_FUNCTION_RESULT_NOT_DELIVERED);
      }
    }
  }, 60_000);

  it('still reports a non-zero exit without a message as an exit-code error', async () => {
    const runnerPath = join(dir, 'crashing-runner.cjs');

    await fs.writeFile(
      runnerPath,
      `process.on('message', () => { process.exit(3); });\n`,
      'utf8',
    );

    const res = await run(runnerPath);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('Exited with code 3');
  });

  it('delivers a handler error over IPC before exiting', async () => {
    const builtFileAbsPath = join(dir, 'index.mjs');

    await fs.writeFile(
      builtFileAbsPath,
      `export const main = async () => { throw new Error('boom'); };\n`,
      'utf8',
    );

    const runnerPath = await service.writeBootstrapRunner({
      dir,
      builtFileAbsPath,
      handlerName: 'main',
    });

    const res = await run(runnerPath);

    expect(res.ok).toBe(false);
    expect(res.error).toBe('Error: boom');
  });
});
