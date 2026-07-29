/* oxlint-disable no-console */

// The pristine, never-wrapped console methods, captured ONCE at module load.
//
// release() must restore to THESE, not to whatever console happened to hold
// when a given ConsoleListener was constructed. Capturing per-instance means a
// listener constructed while another listener's interceptor is installed will
// "restore" console to that other listener's callback -- and if that listener
// has already released, console is permanently pinned to a dead closure that
// silently swallows every server log.
const NATIVE_CONSOLE = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

export class ConsoleListener {
  // Retained for backwards compatibility with any caller reading it.
  private readonly originalConsole = NATIVE_CONSOLE;

  // oxlint-disable-next-line @typescripttypescript/no-explicit-any
  intercept(callback: (type: string, message: any[]) => void) {
    Object.keys(NATIVE_CONSOLE).forEach((method) => {
      // @ts-expect-error legacy noImplicitAny
      // oxlint-disable-next-line @typescripttypescript/no-explicit-any
      console[method] = (...args: any[]) => {
        callback(method, args);
      };
    });
  }

  release() {
    Object.keys(NATIVE_CONSOLE).forEach((method) => {
      // @ts-expect-error legacy noImplicitAny
      console[method] = NATIVE_CONSOLE[method];
    });
  }
}
