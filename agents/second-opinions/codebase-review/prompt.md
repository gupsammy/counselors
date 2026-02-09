# Second Opinion Request

## Question
Review the entire codebase of the `counselors` npm CLI tool. This is a freshly-built v0.1.0 that fans out prompts to multiple AI coding agents (Claude, Codex, Gemini, Amp) in parallel. Evaluate architecture, code quality, security, error handling, testability, and any issues or gaps.

## Context

### Project Structure (28 source files)

```
src/
  cli.ts                    — Commander entry point, command wiring
  types.ts                  — Shared types + zod schemas
  constants.ts              — Config paths (XDG), timeouts, search paths
  core/
    config.ts               — Load/save/validate/merge JSON config
    discovery.ts            — Two-stage binary finder (which + extended PATH)
    executor.ts             — child_process.spawn wrapper, timeout, ANSI strip
    dispatcher.ts           — p-limit parallel fan-out, symlink check, file writes
    prompt-builder.ts       — Slug generation, prompt template wrapping
    context.ts              — Git diff + file gathering
    synthesis.ts            — Heuristic report summarization
  adapters/
    base.ts                 — Abstract BaseAdapter
    claude.ts               — Claude Code adapter
    codex.ts                — OpenAI Codex adapter
    gemini.ts               — Gemini CLI adapter
    amp.ts                  — Amp adapter (stdin + cost tracking)
    custom.ts               — Generic adapter for user-defined tools
    index.ts                — Adapter registry
  commands/
    run.ts                  — `counselors run` command
    doctor.ts               — `counselors doctor` command
    init.ts                 — Interactive setup wizard
    tools/
      add.ts                — `counselors tools add`
      remove.ts             — `counselors tools remove`
      list.ts               — `counselors tools list`
      test.ts               — `counselors tools test`
      discover.ts           — `counselors tools discover`
  ui/
    logger.ts               — Debug/warn/error/info helpers
    output.ts               — Formatters for all commands
    prompts.ts              — @inquirer/prompts wrappers
```

### Key Files

#### package.json
```json
{
  "name": "counselors",
  "version": "0.1.0",
  "type": "module",
  "bin": { "counselors": "./dist/cli.js" },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "commander": "^13.0.0",
    "ora": "^8.0.0",
    "p-limit": "^6.0.0",
    "strip-ansi": "^7.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=20" }
}
```

#### src/types.ts
```typescript
import { z } from 'zod';

export type ReadOnlyLevel = 'enforced' | 'bestEffort' | 'none';
export type PromptMode = 'argument' | 'stdin';

export const ToolConfigSchema = z.object({
  binary: z.string(),
  defaultModel: z.string(),
  models: z.array(z.string()).optional(),
  readOnly: z.object({
    level: z.enum(['enforced', 'bestEffort', 'none']),
    flags: z.array(z.string()).optional(),
  }),
  execFlags: z.array(z.string()).optional(),
  promptMode: z.enum(['argument', 'stdin']).default('argument'),
  modelFlag: z.string().default('--model'),
  custom: z.boolean().optional(),
});

export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export const ConfigSchema = z.object({
  version: z.literal(1),
  defaults: z.object({
    timeout: z.number().default(540),
    outputDir: z.string().default('./agents/counselors'),
    readOnly: z.enum(['enforced', 'bestEffort', 'none']).default('bestEffort'),
    maxContextKb: z.number().default(50),
    maxParallel: z.number().default(4),
  }).default({}),
  tools: z.record(z.string(), ToolConfigSchema).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface RunRequest {
  prompt: string;
  promptFilePath: string;
  toolId: string;
  model: string;
  outputDir: string;
  readOnlyPolicy: ReadOnlyLevel;
  timeout: number;
  cwd: string;
}

export interface Invocation {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
  stdin?: string;
  cwd: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface CostInfo {
  cost_usd: number;
  free_used_usd: number;
  credits_used_usd: number;
  source: 'free' | 'credits';
  free_remaining_usd: number;
  free_total_usd: number;
  credits_remaining_usd: number;
}

export interface ToolReport {
  toolId: string;
  model: string;
  status: 'success' | 'error' | 'timeout' | 'skipped';
  exitCode: number;
  durationMs: number;
  wordCount: number;
  outputFile: string;
  stderrFile: string;
  cost?: CostInfo;
  error?: string;
}

export interface ToolAdapter {
  id: string;
  displayName: string;
  commands: string[];
  installUrl: string;
  readOnly: { level: ReadOnlyLevel };
  models: { id: string; name: string; recommended?: boolean }[];
  buildInvocation(req: RunRequest): Invocation;
  parseResult?(result: ExecResult): Partial<ToolReport>;
}

export interface DiscoveryResult { toolId: string; found: boolean; path: string | null; version: string | null; }
export interface DoctorCheck { name: string; status: 'pass' | 'fail' | 'warn'; message: string; }
export interface TestResult { toolId: string; passed: boolean; output: string; error?: string; durationMs: number; }
export interface RunManifest { timestamp: string; slug: string; prompt: string; promptSource: 'inline' | 'file' | 'stdin'; readOnlyPolicy: ReadOnlyLevel; tools: ToolReport[]; }
```

#### src/constants.ts
```typescript
import { homedir } from 'node:os';
import { join } from 'node:path';

const xdgConfig = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
export const CONFIG_DIR = join(xdgConfig, 'counselors');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const AMP_SETTINGS_FILE = join(CONFIG_DIR, 'amp-readonly-settings.json');

export const DEFAULT_OUTPUT_DIR = './agents/counselors';
export const DEFAULT_TIMEOUT = 540;
export const KILL_GRACE_PERIOD = 15_000;
export const TEST_TIMEOUT = 30_000;
export const DISCOVERY_TIMEOUT = 5_000;
export const VERSION_TIMEOUT = 10_000;
export const DEFAULT_MAX_PARALLEL = 4;
export const DEFAULT_MAX_CONTEXT_KB = 50;
export const MODEL_PATTERN = /^[a-zA-Z0-9._:\-/]+$/;
export const MAX_SLUG_LENGTH = 40;
export const CONFIG_FILE_MODE = 0o600;

export function getExtendedSearchPaths(): string[] {
  const home = homedir();
  const paths: string[] = [
    join(home, '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(home, '.npm-global', 'bin'),
    join(home, '.volta', 'bin'),
    join(home, '.bun', 'bin'),
  ];
  const nvmBin = process.env['NVM_BIN'];
  if (nvmBin) paths.push(nvmBin);
  const fnmMultishell = process.env['FNM_MULTISHELL_PATH'];
  if (fnmMultishell) paths.push(join(fnmMultishell, 'bin'));
  return paths;
}
```

#### src/core/config.ts
```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigSchema, type Config, type ToolConfig } from '../types.js';
import { CONFIG_DIR, CONFIG_FILE, CONFIG_FILE_MODE } from '../constants.js';

const DEFAULT_CONFIG: Config = {
  version: 1,
  defaults: { timeout: 540, outputDir: './agents/counselors', readOnly: 'bestEffort', maxContextKb: 50, maxParallel: 4 },
  tools: {},
};

export function loadConfig(globalPath?: string): Config {
  const path = globalPath ?? CONFIG_FILE;
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return ConfigSchema.parse(raw);
}

export function loadProjectConfig(cwd: string): Partial<Config> | null {
  const path = resolve(cwd, '.counselors.json');
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return raw as Partial<Config>;
}

export function mergeConfigs(global: Config, project: Partial<Config> | null, cliFlags?: Partial<Config['defaults']>): Config {
  const merged: Config = { version: 1, defaults: { ...global.defaults }, tools: { ...global.tools } };
  if (project) {
    if (project.defaults) merged.defaults = { ...merged.defaults, ...project.defaults };
    if (project.tools) merged.tools = { ...merged.tools, ...project.tools };
  }
  if (cliFlags) merged.defaults = { ...merged.defaults, ...cliFlags };
  return merged;
}

export function saveConfig(config: Config, path?: string): void {
  const filePath = path ?? CONFIG_FILE;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  chmodSync(filePath, CONFIG_FILE_MODE);
}

export function addToolToConfig(config: Config, id: string, tool: ToolConfig): Config {
  return { ...config, tools: { ...config.tools, [id]: tool } };
}

export function removeToolFromConfig(config: Config, id: string): Config {
  const tools = { ...config.tools };
  delete tools[id];
  return { ...config, tools };
}

export function getConfiguredTools(config: Config): string[] {
  return Object.keys(config.tools);
}
```

#### src/core/discovery.ts
```typescript
import { execSync } from 'node:child_process';
import { accessSync, constants, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getExtendedSearchPaths, DISCOVERY_TIMEOUT, VERSION_TIMEOUT } from '../constants.js';
import type { DiscoveryResult } from '../types.js';

export function findBinary(command: string): string | null {
  // Stage 1: which
  try {
    const result = execSync(`which ${command}`, { timeout: DISCOVERY_TIMEOUT, stdio: ['pipe','pipe','pipe'], encoding: 'utf-8' }).trim();
    if (result) return result;
  } catch { /* continue */ }

  // Stage 2: extended path scan
  const searchPaths = [...getExtendedSearchPaths(), ...getNvmPaths(), ...getFnmPaths()];
  for (const dir of searchPaths) {
    const fullPath = join(dir, command);
    try { accessSync(fullPath, constants.X_OK); return fullPath; } catch { /* continue */ }
  }
  return null;
}

function getNvmPaths(): string[] {
  const home = homedir();
  const aliasFile = join(home, '.nvm', 'alias', 'default');
  if (!existsSync(aliasFile)) return [];
  try {
    let alias = readFileSync(aliasFile, 'utf-8').trim();
    if (alias.startsWith('lts/')) {
      const ltsFile = join(home, '.nvm', 'alias', 'lts', alias.slice(4));
      if (existsSync(ltsFile)) alias = readFileSync(ltsFile, 'utf-8').trim();
    }
    const versionsDir = join(home, '.nvm', 'versions', 'node');
    if (!existsSync(versionsDir)) return [];
    const match = readdirSync(versionsDir).find(v => v.startsWith(`v${alias}`));
    if (match) return [join(versionsDir, match, 'bin')];
  } catch { /* skip */ }
  return [];
}

function getFnmPaths(): string[] {
  const home = homedir();
  const paths: string[] = [];
  const aliasDir = join(home, '.local', 'share', 'fnm', 'aliases');
  if (existsSync(aliasDir)) {
    try { for (const a of readdirSync(aliasDir)) { const b = join(aliasDir, a, 'bin'); if (existsSync(b)) paths.push(b); } } catch {}
  }
  const multishellDir = join(home, '.local', 'state', 'fnm_multishells');
  if (!existsSync(multishellDir)) return paths;
  try {
    const entries = readdirSync(multishellDir)
      .map(n => { try { return { name: join(multishellDir, n), mtime: statSync(join(multishellDir, n)).mtimeMs }; } catch { return null; } })
      .filter((e): e is { name: string; mtime: number } => e !== null)
      .sort((a, b) => b.mtime - a.mtime).slice(0, 5);
    for (const e of entries) { const b = join(e.name, 'bin'); if (existsSync(b)) paths.push(b); }
  } catch {}
  return paths;
}

export function getBinaryVersion(binaryPath: string): string | null {
  try {
    const output = execSync(`"${binaryPath}" --version`, { timeout: VERSION_TIMEOUT, stdio: ['pipe','pipe','pipe'], encoding: 'utf-8' }).trim();
    return output.split('\n')[0].trim() || null;
  } catch { return null; }
}

export function discoverTool(commands: string[]): DiscoveryResult & { command: string } {
  for (const cmd of commands) {
    const path = findBinary(cmd);
    if (path) { const version = getBinaryVersion(path); return { toolId: cmd, found: true, path, version, command: cmd }; }
  }
  return { toolId: commands[0], found: false, path: null, version: null, command: commands[0] };
}
```

#### src/core/executor.ts
```typescript
import { spawn, execSync } from 'node:child_process';
import stripAnsi from 'strip-ansi';
import type { Invocation, ExecResult, ToolAdapter, ToolConfig, TestResult } from '../types.js';
import { KILL_GRACE_PERIOD, TEST_TIMEOUT } from '../constants.js';
import { parseAmpUsage, computeAmpCost } from '../adapters/amp.js';
import type { CostInfo } from '../types.js';
import { debug } from '../ui/logger.js';

export function execute(invocation: Invocation, timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '', stderr = '', timedOut = false, killed = false;
    debug(`Executing: ${invocation.cmd} ${invocation.args.join(' ')}`);
    const child = spawn(invocation.cmd, invocation.args, {
      cwd: invocation.cwd,
      env: { ...process.env, ...invocation.env, CI: 'true', TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    if (invocation.stdin) { child.stdin.write(invocation.stdin); child.stdin.end(); } else { child.stdin.end(); }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => { if (!killed) child.kill('SIGKILL'); }, KILL_GRACE_PERIOD);
    }, timeoutMs);
    child.on('close', (code) => {
      killed = true; clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), timedOut, durationMs: Date.now() - start });
    });
    child.on('error', (err) => {
      killed = true; clearTimeout(timer);
      resolve({ exitCode: 1, stdout: '', stderr: err.message, timedOut: false, durationMs: Date.now() - start });
    });
  });
}

export function captureAmpUsage(): string | null {
  try { return execSync('amp usage', { timeout: 10_000, stdio: ['pipe','pipe','pipe'], encoding: 'utf-8' }); } catch { return null; }
}

export function computeAmpCostFromSnapshots(before: string, after: string): CostInfo | null {
  try { return computeAmpCost(parseAmpUsage(before), parseAmpUsage(after)); } catch { return null; }
}

export async function executeTest(adapter: ToolAdapter, toolConfig: ToolConfig): Promise<TestResult> {
  const prompt = 'Reply with exactly: OK';
  const start = Date.now();
  const invocation = adapter.buildInvocation({
    prompt, promptFilePath: '', toolId: adapter.id, model: toolConfig.defaultModel,
    outputDir: '', readOnlyPolicy: 'none', timeout: TEST_TIMEOUT / 1000, cwd: process.cwd(),
  });
  if (toolConfig.promptMode === 'stdin') {
    invocation.stdin = prompt;
    invocation.args = invocation.args.filter((a, i, arr) => {
      if (a === '--settings-file') return false;
      if (i > 0 && arr[i - 1] === '--settings-file') return false;
      return true;
    });
  } else {
    invocation.args[invocation.args.length - 1] = prompt;
  }
  const result = await execute(invocation, TEST_TIMEOUT);
  const passed = result.stdout.includes('OK');
  return { toolId: adapter.id, passed, output: result.stdout.slice(0, 500),
    error: !passed ? (result.stderr.slice(0, 500) || 'Output did not contain "OK"') : undefined, durationMs: Date.now() - start };
}
```

#### src/core/dispatcher.ts
```typescript
import pLimit from 'p-limit';
import { writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { execute, captureAmpUsage, computeAmpCostFromSnapshots } from './executor.js';
import { getAdapter, isBuiltInTool } from '../adapters/index.js';
import type { Config, RunRequest, ToolReport, ReadOnlyLevel } from '../types.js';
import { debug, warn } from '../ui/logger.js';

interface DispatchOptions {
  config: Config; toolIds: string[]; promptFilePath: string; promptContent: string;
  outputDir: string; readOnlyPolicy: ReadOnlyLevel; cwd: string;
}

export async function dispatch(options: DispatchOptions): Promise<ToolReport[]> {
  const { config, toolIds, promptFilePath, promptContent, outputDir, readOnlyPolicy, cwd } = options;
  const limit = pLimit(config.defaults.maxParallel);
  const timeoutMs = config.defaults.timeout * 1000;
  const eligibleTools = toolIds.filter(id => {
    const toolConfig = config.tools[id];
    if (!toolConfig) { warn(`Tool "${id}" not configured, skipping.`); return false; }
    if (readOnlyPolicy === 'enforced') {
      const adapter = isBuiltInTool(id) ? getAdapter(id) : getAdapter(id, toolConfig);
      if (adapter.readOnly.level !== 'enforced') { warn(`Skipping "${id}".`); return false; }
    }
    return true;
  });
  const tasks = eligibleTools.map(id => limit(async (): Promise<ToolReport> => {
    const toolConfig = config.tools[id];
    const adapter = isBuiltInTool(id) ? getAdapter(id) : getAdapter(id, toolConfig);
    const model = toolConfig.defaultModel;
    const req: RunRequest = { prompt: promptContent, promptFilePath, toolId: id, model, outputDir, readOnlyPolicy, timeout: config.defaults.timeout, cwd };
    const invocation = adapter.buildInvocation(req);
    const isAmp = id === 'amp';
    const usageBefore = isAmp ? captureAmpUsage() : null;
    const result = await execute(invocation, timeoutMs);
    const usageAfter = isAmp ? captureAmpUsage() : null;
    const cost = isAmp && usageBefore && usageAfter ? computeAmpCostFromSnapshots(usageBefore, usageAfter) : undefined;
    const outputFile = join(outputDir, `${id}.md`);
    const stderrFile = join(outputDir, `${id}.stderr`);
    safeWriteFile(outputFile, result.stdout);
    safeWriteFile(stderrFile, result.stderr);
    if (cost) safeWriteFile(join(outputDir, `${id}.stats.json`), JSON.stringify({ cost }, null, 2));
    const parsed = adapter.parseResult?.(result) ?? {};
    return { toolId: id, model, status: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'success' : 'error',
      exitCode: result.exitCode, durationMs: result.durationMs,
      wordCount: result.stdout.split(/\s+/).filter(Boolean).length,
      outputFile, stderrFile, cost: cost ?? undefined,
      error: result.exitCode !== 0 ? result.stderr.slice(0, 500) : undefined, ...parsed };
  }));
  const results = await Promise.allSettled(tasks);
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { toolId: eligibleTools[i], model: config.tools[eligibleTools[i]].defaultModel,
      status: 'error' as const, exitCode: 1, durationMs: 0, wordCount: 0, outputFile: '', stderrFile: '',
      error: r.reason?.message ?? 'Unknown error' };
  });
}

function safeWriteFile(path: string, content: string): void {
  try {
    try { if (lstatSync(path).isSymbolicLink()) { warn(`Refusing to write to symlink: ${path}`); return; } } catch {}
    writeFileSync(path, content, 'utf-8');
  } catch (e) { warn(`Failed to write ${path}: ${e}`); }
}
```

#### src/adapters/claude.ts
```typescript
import { BaseAdapter } from './base.js';
import type { RunRequest, Invocation } from '../types.js';

export class ClaudeAdapter extends BaseAdapter {
  id = 'claude'; displayName = 'Claude Code'; commands = ['claude'];
  installUrl = 'https://docs.anthropic.com/en/docs/claude-code';
  readOnly = { level: 'enforced' as const };
  models = [
    { id: 'opus', name: 'Opus 4.6 — most capable', recommended: true },
    { id: 'sonnet', name: 'Sonnet 4.5 — fast and capable' },
    { id: 'haiku', name: 'Haiku 4.5 — fastest, most affordable' },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const instruction = `Read the file at ${req.promptFilePath} and follow the instructions within it.`;
    const args = ['-p', '--model', req.model, '--output-format', 'text'];
    if (req.readOnlyPolicy !== 'none') {
      args.push('--tools', 'Read,Glob,Grep,WebFetch,WebSearch', '--allowedTools', 'Read,Glob,Grep,WebFetch,WebSearch', '--strict-mcp-config');
    }
    args.push(instruction);
    return { cmd: req.toolId === 'claude' ? 'claude' : req.toolId, args, cwd: req.cwd };
  }
}
```

#### src/adapters/amp.ts
```typescript
import { BaseAdapter } from './base.js';
import type { RunRequest, Invocation, ExecResult, ToolReport, CostInfo } from '../types.js';
import { AMP_SETTINGS_FILE } from '../constants.js';
import { existsSync } from 'node:fs';

export class AmpAdapter extends BaseAdapter {
  id = 'amp'; displayName = 'Amp CLI'; commands = ['amp'];
  installUrl = 'https://ampcode.com';
  readOnly = { level: 'bestEffort' as const };
  models = [
    { id: 'smart', name: 'Smart — Opus 4.6, most capable', recommended: true },
    { id: 'deep', name: 'Deep — GPT-5.2 Codex, extended thinking' },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const args = ['-m', req.model, '-x'];
    if (req.readOnlyPolicy !== 'none' && existsSync(AMP_SETTINGS_FILE)) {
      args.push('--settings-file', AMP_SETTINGS_FILE);
    }
    const stdinContent = req.prompt + '\n\nUse the oracle tool to provide deeper reasoning and analysis on the most complex or critical aspects of this review.';
    return { cmd: 'amp', args, stdin: stdinContent, cwd: req.cwd };
  }

  parseResult(result: ExecResult): Partial<ToolReport> { return { ...super.parseResult(result) }; }
}

export function parseAmpUsage(output: string): { freeRemaining: number; freeTotal: number; creditsRemaining: number } {
  const freeMatch = output.match(/Amp Free: \$([0-9.]+)\/\$([0-9.]+)/);
  const creditsMatch = output.match(/Individual credits: \$([0-9.]+)/);
  return { freeRemaining: freeMatch ? parseFloat(freeMatch[1]) : 0, freeTotal: freeMatch ? parseFloat(freeMatch[2]) : 0, creditsRemaining: creditsMatch ? parseFloat(creditsMatch[1]) : 0 };
}

export function computeAmpCost(before: {...}, after: {...}): CostInfo {
  const freeUsed = Math.max(0, before.freeRemaining - after.freeRemaining);
  const creditsUsed = Math.max(0, before.creditsRemaining - after.creditsRemaining);
  const totalCost = freeUsed + creditsUsed;
  return { cost_usd: Math.round(totalCost * 100) / 100, free_used_usd: Math.round(freeUsed * 100) / 100,
    credits_used_usd: Math.round(creditsUsed * 100) / 100, source: creditsUsed > 0 ? 'credits' : 'free',
    free_remaining_usd: after.freeRemaining, free_total_usd: after.freeTotal, credits_remaining_usd: after.creditsRemaining };
}
```

#### src/commands/run.ts
```typescript
import type { Command } from 'commander';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { loadConfig, loadProjectConfig, mergeConfigs } from '../core/config.js';
import { generateSlug, generateSlugFromFile, resolveOutputDir, buildPrompt } from '../core/prompt-builder.js';
import { gatherContext } from '../core/context.js';
import { dispatch } from '../core/dispatcher.js';
import { synthesize } from '../core/synthesis.js';
import { getAdapter, isBuiltInTool } from '../adapters/index.js';
import { createSpinner, formatRunSummary, formatDryRun } from '../ui/output.js';
import { info, error, warn } from '../ui/logger.js';
import type { ReadOnlyLevel, RunManifest } from '../types.js';

// Handles: counselors run "<prompt>" | -f <file> | stdin piped
// Options: -t tools, --context, --read-only, --dry-run, --json, -o output-dir
// Flow: resolve prompt → merge config → validate tools → resolve output dir → write prompt →
//       dry-run or dispatch → write manifest + synthesis → output
```

#### src/cli.ts
```typescript
import { Command } from 'commander';
// Wires: run, doctor, init, tools (discover, add, remove, list, test)
// Aliases: counselors add → tools add, counselors ls → tools list
program.parseAsync(process.argv);
```

#### src/commands/init.ts
```typescript
// Interactive wizard: discover tools → checkbox select → model select per tool →
// copy amp settings → save config → offer test
// Uses import.meta.url to resolve assets dir relative to compiled output
```

#### src/core/synthesis.ts
```typescript
// Heuristic v1: extracts markdown headings from reports, builds summary with
// per-tool status, word counts, durations, cost table
```

#### src/adapters/custom.ts
```typescript
// Generic adapter for user-defined tools.
// Reads execFlags, modelFlag, readOnly.flags, promptMode from ToolConfig.
// Supports both argument and stdin prompt delivery.
```

### Test Suite (52 tests, all passing)
```
tests/unit/config.test.ts           — load/save/merge/validate config
tests/unit/discovery.test.ts        — binary discovery (finds node/npm, returns null for missing)
tests/unit/prompt-builder.test.ts   — slug generation, prompt assembly
tests/unit/executor.test.ts         — stdout/stderr capture, exit codes, timeout, stdin, ANSI strip
tests/unit/adapters/claude.test.ts  — buildInvocation correctness, read-only flags
tests/unit/adapters/codex.test.ts   — exec + sandbox flags
tests/unit/adapters/gemini.test.ts  — tool restrictions
tests/unit/adapters/amp.test.ts     — stdin delivery, cost parsing, cost computation
tests/integration/cli.test.ts       — full CLI invocation (help, version, discover, doctor, run, ls)
```

## Instructions
You are providing an independent second opinion. Be critical and thorough.
- Analyze the question in the context provided
- Identify risks, tradeoffs, and blind spots
- Suggest alternatives if you see better approaches
- Be direct and opinionated — don't hedge
- Structure your response with clear headings
- Keep your response focused and actionable
