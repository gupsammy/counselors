function isDebug(): boolean {
  return process.env['DEBUG'] === '1' || process.env['DEBUG'] === 'counselors';
}

export function debug(msg: string): void {
  if (isDebug()) {
    process.stderr.write(`[debug] ${msg}\n`);
  }
}

export function warn(msg: string): void {
  process.stderr.write(`⚠ ${msg}\n`);
}

export function error(msg: string): void {
  process.stderr.write(`✗ ${msg}\n`);
}

export function info(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

export function success(msg: string): void {
  process.stdout.write(`✓ ${msg}\n`);
}
