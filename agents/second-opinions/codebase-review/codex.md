**Findings (Ordered by Severity)**

- `Critical` Built-in tool `binary` paths are discovered/saved but not used at runtime, so `doctor` can pass while `run/test` fail.  
  Evidence: `src/commands/tools/add.ts:40`, `src/commands/init.ts:63`, `src/commands/run.ts:141`, `src/commands/tools/test.ts:35`, `src/adapters/codex.ts:31`, `src/adapters/gemini.ts:30`, `src/adapters/amp.ts:29`, `src/adapters/claude.ts:34`, `src/commands/doctor.ts:45`.  
  Impact: false confidence + broken execution when binaries are not on `PATH`.  
  Fix: pass resolved binary into adapters (or into `Invocation.cmd`) for built-ins.

- `Critical` Project config is merged without validation, and JSON parse errors are uncaught in `run`.  
  Evidence: `src/core/config.ts:30`, `src/core/config.ts:31`, `src/core/config.ts:34`, `src/commands/run.ts:36`, `src/core/dispatcher.ts:24`.  
  Impact: malformed `.counselors.json` can crash runs or inject bad runtime values (`maxParallel`, timeouts, tool config).  
  Fix: schema-validate project config with Zod and re-parse merged config before use; wrap load/parse in command-level error handling.

- `High` Shell injection surface in discovery/version checks due `execSync` with interpolated strings.  
  Evidence: `src/core/discovery.ts:16`, `src/core/discovery.ts:142`.  
  Impact: crafted command/binary strings can execute unintended shell syntax.  
  Fix: use `execFileSync`/`spawnSync` with argv arrays (`which`, `--version`) and no shell interpolation.

- `High` Read-only defaults are effectively downgraded to `bestEffort` unless user explicitly overrides every run.  
  Evidence: `src/commands/run.ts:21`, `src/commands/run.ts:65`, config default exists at `src/types.ts:34`.  
  Impact: safety policy drift; typo in `--read-only` silently falls back to less strict mode.  
  Fix: default from merged config, and enforce commander choices instead of fallback coercion.

- `High` `--dry-run` is not dry; it creates output dirs/files before the dry-run branch.  
  Evidence: `src/commands/run.ts:127`, `src/commands/run.ts:130`, `src/commands/run.ts:132`, `src/commands/run.ts:138`.  
  Impact: unexpected side effects, polluted output directories, misleading automation behavior.  
  Fix: evaluate dry-run first; only create/write files in real execution mode.

- `Medium` Strict read-only mode can “succeed” with zero tools executed.  
  Evidence: `src/core/dispatcher.ts:28`, `src/core/dispatcher.ts:35`, `src/commands/run.ts:194`.  
  Impact: user gets completion output with no actual review results.  
  Fix: fail fast when `eligibleTools.length === 0` and set non-zero exit code.

- `Medium` Exit codes are inconsistent for clear error paths.  
  Evidence: `src/commands/tools/add.ts:33`, `src/commands/tools/remove.ts:14`, `src/commands/tools/test.ts:21`.  
  Impact: CI/scripting cannot reliably detect failure states.  
  Fix: set `process.exitCode = 1` for all non-success termination paths.

- `Medium` Context-size controls are partially bypassed; git diff is added before budget enforcement and config `maxContextKb` is ignored by `run`.  
  Evidence: `src/core/context.ts:10`, `src/core/context.ts:16`, `src/core/context.ts:19`, `src/commands/run.ts:90`, `src/commands/run.ts:117`.  
  Impact: oversized prompts, unpredictable token/cost blowups.  
  Fix: pass `config.defaults.maxContextKb` from `run`, and enforce budget before appending diff/content.

- `Medium` File write hardening is inconsistent. Tool outputs use symlink checks, but prompt/manifest/summary writes do not.  
  Evidence: `src/core/dispatcher.ts:128`, `src/core/dispatcher.ts:132`, `src/commands/run.ts:134`, `src/commands/run.ts:184`, `src/commands/run.ts:188`.  
  Impact: weaker protection for key run artifacts vs tool outputs.  
  Fix: centralize all writes through hardened file-write utility.

- `Medium` Test suite misses the highest-risk regressions.  
  Evidence: `tests/integration/cli.test.ts:55` only checks “run with no tools”; no integration test for a configured successful run path using stored binary paths, no malformed project-config tests, no dry-run side-effect test.  
  Impact: current “all passing” signal is optimistic.  
  Fix: add integration coverage for configured run/test execution, project config validation failures, and dry-run no-write guarantee.

**Architecture Verdict**

- The module split is good (`core`, `adapters`, `commands`, `ui`), but execution semantics are leaking across layers (adapter command selection vs configured binary path).  
- Biggest blind spot: policy and config correctness are not treated as first-class runtime invariants.

**Assumptions / Open Questions**

1. Is `.counselors.json` intended to be trusted-by-default in arbitrary repos? If not, current behavior is too permissive.  
2. Is the discovered absolute binary path intended to guarantee execution even when not on `PATH`? Current behavior contradicts that expectation.  
3. Should `--dry-run` be strictly no-side-effects? If yes, behavior is currently incorrect.

**Validation Note**

- I attempted to run tests, but the environment is read-only and Vitest failed on startup trying to write `node_modules/.vite-temp/...` (`EPERM`). So I validated by static review of source + tests rather than executing the suite here.

**Recommended Remediation Order**

1. Fix built-in binary path usage (`Invocation.cmd` from config for built-ins).  
2. Validate project config + merged config and harden error handling in `run`.  
3. Remove shell interpolation from discovery/version commands.  
4. Make read-only policy explicit/strictly validated.  
5. Make `--dry-run` side-effect free.  
6. Backfill integration tests for the above before v0.1.1.
