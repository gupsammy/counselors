import { copyFileSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { resolveAdapter } from '../adapters/index.js';
import { loadConfig, loadProjectConfig, mergeConfigs } from '../core/config.js';
import { gatherContext } from '../core/context.js';
import { dispatch } from '../core/dispatcher.js';
import { safeWriteFile } from '../core/fs-utils.js';
import {
  buildPrompt,
  generateSlug,
  generateSlugFromFile,
  resolveOutputDir,
} from '../core/prompt-builder.js';
import { synthesize } from '../core/synthesis.js';
import type { ReadOnlyLevel, RunManifest } from '../types.js';
import { error, info } from '../ui/logger.js';
import { formatDryRun, formatRunSummary } from '../ui/output.js';
import { ProgressDisplay } from '../ui/progress.js';
import { selectRunTools } from '../ui/prompts.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run [prompt]')
    .description('Dispatch prompt to configured AI tools in parallel')
    .option('-f, --file <path>', 'Use a pre-built prompt file (no wrapping)')
    .option('-t, --tools <tools>', 'Comma-separated list of tools to use')
    .option(
      '--context <paths>',
      'Gather context from paths (comma-separated, or "." for git diff)',
    )
    .option(
      '--read-only <level>',
      'Read-only policy: strict, best-effort, off',
      'best-effort',
    )
    .option('--dry-run', 'Show what would be dispatched without running')
    .option('--json', 'Output manifest as JSON')
    .option('-o, --output-dir <dir>', 'Base output directory')
    .action(
      async (
        promptArg: string | undefined,
        opts: {
          file?: string;
          tools?: string;
          context?: string;
          readOnly: string;
          dryRun?: boolean;
          json?: boolean;
          outputDir?: string;
        },
      ) => {
        const cwd = process.cwd();
        const globalConfig = loadConfig();
        const projectConfig = loadProjectConfig(cwd);
        const config = mergeConfigs(globalConfig, projectConfig);

        // Determine tools to use
        let toolIds: string[];
        const explicitTools = Boolean(opts.tools);

        if (opts.tools) {
          toolIds = opts.tools.split(',').map((t) => t.trim());
        } else {
          toolIds = Object.keys(config.tools);
        }

        if (toolIds.length === 0) {
          error('No tools configured. Run "counselors init" first.');
          process.exitCode = 1;
          return;
        }

        // Validate all tools exist in config
        for (const id of toolIds) {
          if (!config.tools[id]) {
            error(
              `Tool "${id}" not configured. Run "counselors tools add ${id}".`,
            );
            process.exitCode = 1;
            return;
          }
        }

        // Interactive tool selection when no --tools flag and TTY
        if (
          !explicitTools &&
          !opts.dryRun &&
          process.stderr.isTTY &&
          toolIds.length > 1
        ) {
          const selected = await selectRunTools(
            toolIds.map((id) => ({ id, model: config.tools[id].defaultModel })),
          );
          if (selected.length === 0) {
            error('No tools selected.');
            process.exitCode = 1;
            return;
          }
          toolIds = selected;
        }

        // Map read-only flag
        const readOnlyMap: Record<string, ReadOnlyLevel> = {
          strict: 'enforced',
          'best-effort': 'bestEffort',
          off: 'none',
        };
        const readOnlyPolicy = readOnlyMap[opts.readOnly];
        if (!readOnlyPolicy) {
          error(
            `Invalid --read-only value "${opts.readOnly}". Must be: strict, best-effort, or off.`,
          );
          process.exitCode = 1;
          return;
        }

        // Resolve prompt
        let promptContent: string;
        let promptSource: 'inline' | 'file' | 'stdin';
        let slug: string;

        if (opts.file) {
          // File mode: use as-is, no wrapping
          const filePath = resolve(cwd, opts.file);
          try {
            promptContent = readFileSync(filePath, 'utf-8');
          } catch {
            error(`Cannot read prompt file: ${filePath}`);
            process.exitCode = 1;
            return;
          }
          promptSource = 'file';
          slug = generateSlugFromFile(filePath);
        } else if (promptArg) {
          // Inline prompt: wrap in template
          promptSource = 'inline';
          slug = generateSlug(promptArg);

          const context = opts.context
            ? gatherContext(
                cwd,
                opts.context === '.' ? [] : opts.context.split(','),
                config.defaults.maxContextKb,
              )
            : undefined;

          promptContent = buildPrompt(promptArg, context);
        } else {
          // Check stdin
          if (process.stdin.isTTY) {
            error(
              'No prompt provided. Pass as argument, use -f <file>, or pipe via stdin.',
            );
            process.exitCode = 1;
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk);
          }
          const stdinContent = Buffer.concat(chunks).toString('utf-8').trim();
          if (!stdinContent) {
            error('Empty prompt from stdin.');
            process.exitCode = 1;
            return;
          }

          promptSource = 'stdin';
          slug = generateSlug(stdinContent);

          const context = opts.context
            ? gatherContext(
                cwd,
                opts.context === '.' ? [] : opts.context.split(','),
                config.defaults.maxContextKb,
              )
            : undefined;

          promptContent = buildPrompt(stdinContent, context);
        }

        if (!slug) slug = `run-${Date.now()}`;

        // Dry run — no filesystem side effects
        if (opts.dryRun) {
          const baseDir = opts.outputDir || config.defaults.outputDir;
          const dryOutputDir = join(baseDir, slug);
          const dryPromptFile = resolve(dryOutputDir, 'prompt.md');
          const invocations = toolIds.map((id) => {
            const toolConfig = config.tools[id];
            const adapter = resolveAdapter(id, toolConfig);
            const inv = adapter.buildInvocation({
              prompt: promptContent,
              promptFilePath: dryPromptFile,
              toolId: id,
              model: toolConfig.defaultModel,
              outputDir: dryOutputDir,
              readOnlyPolicy,
              timeout: config.defaults.timeout,
              cwd,
              binary: toolConfig.binary,
            });
            return {
              toolId: id,
              model: toolConfig.defaultModel,
              cmd: inv.cmd,
              args: inv.args,
            };
          });
          info(formatDryRun(invocations));
          return;
        }

        // Resolve output directory (creates it)
        const baseDir = opts.outputDir || config.defaults.outputDir;
        const outputDir = resolveOutputDir(baseDir, slug);

        // Write prompt file
        const promptFilePath = resolve(outputDir, 'prompt.md');
        if (opts.file) {
          copyFileSync(resolve(cwd, opts.file), promptFilePath);
        } else {
          safeWriteFile(promptFilePath, promptContent);
        }

        // Dispatch
        const display = new ProgressDisplay(
          toolIds.map((id) => ({
            toolId: id,
            model: config.tools[id].defaultModel,
          })),
          outputDir,
        );

        const reports = await dispatch({
          config,
          toolIds,
          promptFilePath,
          promptContent,
          outputDir,
          readOnlyPolicy,
          cwd,
          onProgress: (event) => {
            if (event.event === 'started') display.start(event.toolId);
            if (event.event === 'completed')
              display.complete(event.toolId, event.report!);
          },
        });

        display.stop();

        // Build manifest
        const manifest: RunManifest = {
          timestamp: new Date().toISOString(),
          slug,
          prompt:
            promptArg || (opts.file ? `file:${basename(opts.file)}` : 'stdin'),
          promptSource,
          readOnlyPolicy,
          tools: reports,
        };

        // Write manifest + synthesis
        safeWriteFile(
          resolve(outputDir, 'run.json'),
          JSON.stringify(manifest, null, 2),
        );
        const summary = synthesize(manifest, outputDir);
        safeWriteFile(resolve(outputDir, 'summary.md'), summary);

        // Output
        if (opts.json) {
          info(JSON.stringify(manifest, null, 2));
        } else {
          info(formatRunSummary(manifest));
        }
      },
    );
}
