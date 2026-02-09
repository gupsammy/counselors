import { describe, expect, it } from 'vitest';
import { execute } from '../../src/core/executor.js';

describe('execute', () => {
  it('captures stdout', async () => {
    const result = await execute(
      {
        cmd: 'echo',
        args: ['hello world'],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.timedOut).toBe(false);
  });

  it('captures stderr', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: ['-e', 'console.error("oops")'],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.stderr.trim()).toBe('oops');
  });

  it('handles non-zero exit codes', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: ['-e', 'process.exit(42)'],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.exitCode).toBe(42);
  });

  it('times out and kills', async () => {
    const result = await execute(
      {
        cmd: 'sleep',
        args: ['60'],
        cwd: process.cwd(),
      },
      500,
    );

    expect(result.timedOut).toBe(true);
  });

  it('handles stdin', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: [
          '-e',
          'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(d))',
        ],
        stdin: 'hello from stdin',
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.stdout).toBe('hello from stdin');
  });

  it('handles missing binary', async () => {
    const result = await execute(
      {
        cmd: 'nonexistent-binary-xyz',
        args: [],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ENOENT');
  });

  it('strips ANSI codes from output', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: ['-e', 'process.stdout.write("\\x1b[31mred\\x1b[0m")'],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.stdout).toBe('red');
  });

  it('does not leak SECRET_KEY or other non-allowlisted env vars', async () => {
    // Set a secret in current process env
    process.env.SECRET_KEY = 'super-secret-value';
    try {
      const result = await execute(
        {
          cmd: 'node',
          args: [
            '-e',
            'process.stdout.write(process.env.SECRET_KEY || "NOT_SET")',
          ],
          cwd: process.cwd(),
        },
        5000,
      );

      expect(result.stdout).toBe('NOT_SET');
    } finally {
      delete process.env.SECRET_KEY;
    }
  });

  it('passes allowlisted env vars (HOME)', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: ['-e', 'process.stdout.write(process.env.HOME || "MISSING")'],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.stdout).not.toBe('MISSING');
    expect(result.stdout).toBeTruthy();
  });

  it('merges invocation.env into child env', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: [
          '-e',
          'process.stdout.write(process.env.MY_TOOL_VAR || "MISSING")',
        ],
        env: { MY_TOOL_VAR: 'tool-specific' },
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.stdout).toBe('tool-specific');
  });

  it('always sets CI=true and NO_COLOR=1', async () => {
    const result = await execute(
      {
        cmd: 'node',
        args: [
          '-e',
          'process.stdout.write(`${process.env.CI}:${process.env.NO_COLOR}`)',
        ],
        cwd: process.cwd(),
      },
      5000,
    );

    expect(result.stdout).toBe('true:1');
  });

  it('truncates stdout exceeding 10MB', async () => {
    // Generate ~11MB of output
    const result = await execute(
      {
        cmd: 'node',
        args: [
          '-e',
          `
        const chunk = 'x'.repeat(1024 * 1024); // 1MB
        for (let i = 0; i < 11; i++) process.stdout.write(chunk);
      `,
        ],
        cwd: process.cwd(),
      },
      15000,
    );

    // Should be capped near 10MB + truncation marker
    expect(result.stdout.length).toBeLessThan(11 * 1024 * 1024);
    expect(result.stdout).toContain('[output truncated at 10MB]');
  });
});
