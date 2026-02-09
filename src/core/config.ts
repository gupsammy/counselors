import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigSchema, type Config, type ToolConfig } from '../types.js';
import { CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_MODE } from '../constants.js';

const DEFAULT_CONFIG: Config = {
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

export function loadConfig(globalPath?: string): Config {
  const path = globalPath ?? CONFIG_FILE;
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${e instanceof Error ? e.message : e}`);
  }
  return ConfigSchema.parse(raw);
}

/** Schema for project config — only defaults are allowed, not tools. */
const ProjectConfigSchema = ConfigSchema.pick({ defaults: true }).partial();

export function loadProjectConfig(cwd: string): Partial<Config> | null {
  const path = resolve(cwd, '.counselors.json');
  if (!existsSync(path)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    throw new Error(`Invalid JSON in ${path}: ${e instanceof Error ? e.message : e}`);
  }
  return ProjectConfigSchema.parse(raw);
}

export function mergeConfigs(global: Config, project: Partial<Config> | null, cliFlags?: Partial<Config['defaults']>): Config {
  const merged: Config = {
    version: 1,
    defaults: { ...global.defaults },
    tools: { ...global.tools },
  };

  if (project) {
    if (project.defaults) {
      merged.defaults = { ...merged.defaults, ...project.defaults };
    }
    // Project configs can only override defaults, never inject tools.
  }

  if (cliFlags) {
    merged.defaults = { ...merged.defaults, ...cliFlags };
  }

  return merged;
}

export function saveConfig(config: Config, path?: string): void {
  const filePath = path ?? CONFIG_FILE;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  chmodSync(filePath, CONFIG_FILE_MODE);
}

export function addToolToConfig(config: Config, id: string, tool: ToolConfig): Config {
  return {
    ...config,
    tools: { ...config.tools, [id]: tool },
  };
}

export function removeToolFromConfig(config: Config, id: string): Config {
  const tools = { ...config.tools };
  delete tools[id];
  return { ...config, tools };
}

export function renameToolInConfig(config: Config, oldId: string, newId: string): Config {
  const tools = { ...config.tools };
  tools[newId] = tools[oldId];
  delete tools[oldId];
  return { ...config, tools };
}

export function getConfiguredTools(config: Config): string[] {
  return Object.keys(config.tools);
}
