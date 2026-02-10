import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addToolToConfig,
  getConfiguredTools,
  loadConfig,
  loadProjectConfig,
  mergeConfigs,
  removeToolFromConfig,
  renameToolInConfig,
  saveConfig,
} from '../../src/core/config.js';
import type { Config, ToolConfig } from '../../src/types.js';

const testDir = join(tmpdir(), `counselors-test-${Date.now()}`);
const testConfigFile = join(testDir, 'config.json');

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns default config when file does not exist', () => {
    const config = loadConfig(join(testDir, 'nonexistent.json'));
    expect(config.version).toBe(1);
    expect(config.defaults.timeout).toBe(540);
    expect(config.defaults.maxParallel).toBe(4);
    expect(Object.keys(config.tools)).toHaveLength(0);
  });

  it('loads valid config file', () => {
    const validConfig = {
      version: 1,
      defaults: {
        timeout: 300,
        outputDir: './out',
        readOnly: 'enforced',
        maxContextKb: 100,
        maxParallel: 2,
      },
      tools: {
        claude: {
          binary: '/usr/bin/claude',
          defaultModel: 'opus',
          readOnly: { level: 'enforced' },
          promptMode: 'argument',
          modelFlag: '--model',
        },
      },
    };
    writeFileSync(testConfigFile, JSON.stringify(validConfig));
    const config = loadConfig(testConfigFile);
    expect(config.version).toBe(1);
    expect(config.defaults.timeout).toBe(300);
    expect(config.tools.claude).toBeDefined();
    expect(config.tools.claude.binary).toBe('/usr/bin/claude');
  });

  it('throws on invalid config', () => {
    writeFileSync(testConfigFile, JSON.stringify({ version: 2 }));
    expect(() => loadConfig(testConfigFile)).toThrow();
  });
});

describe('saveConfig', () => {
  it('writes config to file', () => {
    const config: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './agents/counselors',
        readOnly: 'bestEffort',
        maxContextKb: 50,
        maxParallel: 4,
      },
      tools: {},
    };
    saveConfig(config, testConfigFile);
    expect(existsSync(testConfigFile)).toBe(true);
    const loaded = loadConfig(testConfigFile);
    expect(loaded.version).toBe(1);
  });

  it('writes config with restrictive file permissions (0o600)', () => {
    const config: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './agents/counselors',
        readOnly: 'bestEffort',
        maxContextKb: 50,
        maxParallel: 4,
      },
      tools: {},
    };
    saveConfig(config, testConfigFile);
    const mode = statSync(testConfigFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('mergeConfigs', () => {
  it('merges global and project configs (defaults only, not tools)', () => {
    const global: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './agents/counselors',
        readOnly: 'bestEffort',
        maxContextKb: 50,
        maxParallel: 4,
      },
      tools: {
        claude: {
          binary: '/bin/claude',
          defaultModel: 'opus',
          readOnly: { level: 'enforced' },
          promptMode: 'argument',
          modelFlag: '--model',
        },
      },
    };
    const project = {
      defaults: { timeout: 300 },
    };
    const merged = mergeConfigs(global, project);
    expect(merged.defaults.timeout).toBe(300);
    expect(merged.defaults.maxParallel).toBe(4); // from global
    expect(merged.tools.claude).toBeDefined();
  });

  it('ignores tools from project config', () => {
    const global: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './agents/counselors',
        readOnly: 'bestEffort',
        maxContextKb: 50,
        maxParallel: 4,
      },
      tools: {
        claude: {
          binary: '/bin/claude',
          defaultModel: 'opus',
          readOnly: { level: 'enforced' },
          promptMode: 'argument',
          modelFlag: '--model',
        },
      },
    };
    // Even if somehow a project config had tools, they should not be merged
    const project = { defaults: { timeout: 300 } };
    const merged = mergeConfigs(global, project);
    // Only global tools should be present
    expect(Object.keys(merged.tools)).toEqual(['claude']);
  });

  it('applies CLI flags over everything', () => {
    const global: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './agents/counselors',
        readOnly: 'bestEffort',
        maxContextKb: 50,
        maxParallel: 4,
      },
      tools: {},
    };
    const merged = mergeConfigs(global, null, { timeout: 60 });
    expect(merged.defaults.timeout).toBe(60);
  });
});

describe('loadConfig error handling', () => {
  it('throws with clear message on malformed JSON', () => {
    writeFileSync(testConfigFile, '{ invalid json }');
    expect(() => loadConfig(testConfigFile)).toThrow(/Invalid JSON in/);
  });
});

describe('loadProjectConfig', () => {
  it('returns null when no .counselors.json exists', () => {
    const result = loadProjectConfig(testDir);
    expect(result).toBeNull();
  });

  it('parses valid project config with defaults', () => {
    writeFileSync(
      join(testDir, '.counselors.json'),
      JSON.stringify({ defaults: { timeout: 120 } }),
    );
    const result = loadProjectConfig(testDir);
    expect(result).toBeDefined();
    expect(result?.defaults?.timeout).toBe(120);
  });

  it('strips tools from project config (security boundary)', () => {
    writeFileSync(
      join(testDir, '.counselors.json'),
      JSON.stringify({
        defaults: { timeout: 120 },
        tools: {
          evil: {
            binary: '/tmp/evil',
            defaultModel: 'x',
            readOnly: { level: 'none' },
            promptMode: 'argument',
            modelFlag: '--m',
          },
        },
      }),
    );
    const result = loadProjectConfig(testDir);
    // The Zod schema only picks 'defaults', so tools should not be present
    expect((result as any).tools).toBeUndefined();
  });

  it('throws on malformed JSON in project config', () => {
    writeFileSync(join(testDir, '.counselors.json'), '!!!not json');
    expect(() => loadProjectConfig(testDir)).toThrow(/Invalid JSON in/);
  });

  it('partial project config does not clobber unset global defaults', () => {
    // Project only sets timeout — readOnly, outputDir, etc. should survive merge
    writeFileSync(
      join(testDir, '.counselors.json'),
      JSON.stringify({ defaults: { timeout: 120 } }),
    );
    const project = loadProjectConfig(testDir);

    const global: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './custom-output',
        readOnly: 'enforced',
        maxContextKb: 100,
        maxParallel: 8,
      },
      tools: {},
    };

    const merged = mergeConfigs(global, project);
    expect(merged.defaults.timeout).toBe(120); // overridden
    expect(merged.defaults.outputDir).toBe('./custom-output'); // preserved
    expect(merged.defaults.readOnly).toBe('enforced'); // preserved
    expect(merged.defaults.maxContextKb).toBe(100); // preserved
    expect(merged.defaults.maxParallel).toBe(8); // preserved
  });
});

describe('addToolToConfig / removeToolFromConfig', () => {
  it('adds and removes tools', () => {
    let config: Config = {
      version: 1,
      defaults: {
        timeout: 540,
        outputDir: './agents/counselors',
        readOnly: 'bestEffort',
        maxContextKb: 50,
        maxParallel: 4,
      },
      tools: {},
    };

    const tool: ToolConfig = {
      binary: '/bin/test',
      defaultModel: 'model1',
      readOnly: { level: 'none' },
      promptMode: 'argument',
      modelFlag: '--model',
    };

    config = addToolToConfig(config, 'test-tool', tool);
    expect(config.tools['test-tool']).toBeDefined();
    expect(getConfiguredTools(config)).toContain('test-tool');

    config = removeToolFromConfig(config, 'test-tool');
    expect(config.tools['test-tool']).toBeUndefined();
    expect(getConfiguredTools(config)).not.toContain('test-tool');
  });
});

describe('renameToolInConfig', () => {
  const baseTool: ToolConfig = {
    binary: '/bin/test',
    defaultModel: 'opus',
    readOnly: { level: 'enforced' },
    promptMode: 'argument',
    modelFlag: '--model',
  };

  const baseConfig: Config = {
    version: 1,
    defaults: {
      timeout: 540,
      outputDir: './agents/counselors',
      readOnly: 'bestEffort',
      maxContextKb: 50,
      maxParallel: 4,
    },
    tools: { 'old-name': baseTool },
  };

  it('moves tool config to new key', () => {
    const updated = renameToolInConfig(baseConfig, 'old-name', 'new-name');
    expect(updated.tools['new-name']).toBeDefined();
    expect(updated.tools['old-name']).toBeUndefined();
  });

  it('preserves all tool settings', () => {
    const toolWithExtras: ToolConfig = {
      ...baseTool,
      extraFlags: ['-c', 'model_reasoning_effort=high'],
      timeout: 900,
    };
    const config = { ...baseConfig, tools: { 'old-name': toolWithExtras } };
    const updated = renameToolInConfig(config, 'old-name', 'new-name');
    expect(updated.tools['new-name'].extraFlags).toEqual([
      '-c',
      'model_reasoning_effort=high',
    ]);
    expect(updated.tools['new-name'].timeout).toBe(900);
    expect(updated.tools['new-name'].binary).toBe('/bin/test');
  });

  it('does not mutate original config', () => {
    const updated = renameToolInConfig(baseConfig, 'old-name', 'new-name');
    expect(baseConfig.tools['old-name']).toBeDefined();
    expect(updated).not.toBe(baseConfig);
  });
});
