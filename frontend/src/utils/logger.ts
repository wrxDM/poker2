/** Simple timestamped logger for frontend modules. */

function ts(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

export const logger = {
  info(tag: string, ...args: unknown[]): void {
    console.log(`[${ts()}] [${tag}]`, ...args);
  },
  warn(tag: string, ...args: unknown[]): void {
    console.warn(`[${ts()}] [${tag}]`, ...args);
  },
  error(tag: string, ...args: unknown[]): void {
    console.error(`[${ts()}] [${tag}]`, ...args);
  },
  debug(tag: string, ...args: unknown[]): void {
    console.log(`[${ts()}] [${tag}] [DEBUG]`, ...args);
  },
};
