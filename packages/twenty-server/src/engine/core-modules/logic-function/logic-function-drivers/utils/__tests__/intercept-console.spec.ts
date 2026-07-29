import { ConsoleListener } from 'src/engine/core-modules/logic-function/logic-function-drivers/utils/intercept-console';

// Regression tests for the ConsoleListener stack-growth outage.
//
// release() used to install *another* forwarding closure instead of restoring
// console[method]. Because originalConsole was captured per instance as
// "whatever console.log currently is", every intercept/release cycle added one
// permanent stack frame. twenty-server is a single long-lived replica and a
// ConsoleListener is constructed once per LocalDriver.execute(), so the chain
// grew across every tenant install/publish and every daily reconcile until
// EVERY console.* call in the process threw RangeError. Measured tipping point
// against the deployed artifact: 10,500 cycles.
describe('ConsoleListener', () => {
  const native = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  afterEach(() => {
    Object.assign(console, native);
  });

  it('does not grow the console call chain across repeated cycles', () => {
    // 20k comfortably exceeds the 10.5k tipping point of the buggy version.
    for (let i = 0; i < 20_000; i++) {
      const listener = new ConsoleListener();

      listener.intercept(() => {});
      listener.release();
    }

    expect(() => console.log('')).not.toThrow();
  });

  it('restores console to the native implementation, not to a wrapper', () => {
    const listener = new ConsoleListener();

    listener.intercept(() => {});
    listener.release();

    expect(console.log).toBe(native.log);
    expect(console.error).toBe(native.error);
  });

  it('restores to native even when executions overlap', () => {
    // LocalDriver.execute() is async and awaits a child process, so two
    // executions can interleave. With per-instance capture, `second` captures
    // `first`'s interceptor as its "original" and pins console to a dead
    // closure that silently swallows every subsequent server log.
    const firstCaptured: string[] = [];
    const secondCaptured: string[] = [];

    const first = new ConsoleListener();

    first.intercept((_type, args) => firstCaptured.push(args.join(' ')));

    const second = new ConsoleListener();

    second.intercept((_type, args) => secondCaptured.push(args.join(' ')));

    first.release();
    second.release();

    console.log('canary');

    expect(console.log).toBe(native.log);
    expect(firstCaptured).not.toContain('canary');
    expect(secondCaptured).not.toContain('canary');
  });

  it('still captures output while intercepting', () => {
    const listener = new ConsoleListener();
    const captured: string[] = [];

    listener.intercept((type, args) => captured.push(`${type}:${args.join(' ')}`));

    console.log('hello');
    console.error('boom');

    listener.release();

    expect(captured).toEqual(['log:hello', 'error:boom']);
  });
});
