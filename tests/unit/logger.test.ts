import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug } from '../../src/ui/logger.js';

describe('debug', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.DEBUG;
  });

  it('outputs when DEBUG=1 is set at call time', () => {
    process.env.DEBUG = '1';
    debug('test message');
    expect(stderrSpy).toHaveBeenCalledWith('[debug] test message\n');
  });

  it('outputs when DEBUG=counselors is set at call time', () => {
    process.env.DEBUG = 'counselors';
    debug('test message');
    expect(stderrSpy).toHaveBeenCalledWith('[debug] test message\n');
  });

  it('does not output when DEBUG is unset', () => {
    delete process.env.DEBUG;
    debug('test message');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('respects runtime changes to DEBUG env var', () => {
    // Initially off
    delete process.env.DEBUG;
    debug('should not appear');
    expect(stderrSpy).not.toHaveBeenCalled();

    // Turn on
    process.env.DEBUG = '1';
    debug('should appear');
    expect(stderrSpy).toHaveBeenCalledWith('[debug] should appear\n');

    // Turn off again
    stderrSpy.mockClear();
    delete process.env.DEBUG;
    debug('should not appear again');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
