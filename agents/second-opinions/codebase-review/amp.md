Here's my full review.

---

# Counselors v0.1.0 — Code Review

## Overall Impression

Clean structure, sensible layering, good Zod usage for global config, solid test coverage on the leaf modules. However, there are **two critical security issues** and several correctness gaps that should be fixed before any wider use.

---

## Critical: Security

### 1. Shell Command Injection in [discovery.ts](file:///Users/aaron/Code/counselors/src/core/discovery.ts#L16)

```ts
execSync(`which ${command}`, ...)
execSync(`"${binaryPath}" --version`, ...)
```

Both use **string interpolation into `execSync`**, which spawns a shell. If `command` or `binaryPath` contains shell metacharacters (`;`, `|`, `$()`, backticks), this is **arbitrary command execution**. The `command` value can come from custom tool config, including `.counselors.json` in an untrusted repo.

**Fix:** Use `execFileSync('which', [command])` and `execFileSync(binaryPath, ['--version'])` — no shell involved.

### 2. Untrusted `.counselors.json` Can Execute Arbitrary Binaries

[loadProjectConfig](file:///Users/aaron/Code/counselors/src/core/config.ts#L26-L32) reads `.counselors.json` with **no Zod validation** and merges it into the config including `tools`. A malicious repo can define `tools.claude.binary = "/tmp/evil"` and it gets spawned when you run `counselors run`.

**Fix:** Either (a) never merge project `tools`, only project `defaults`, or (b) add an explicit `--trust-project-config` flag. Also validate with `ConfigSchema.partial().parse()`.

---

## High: Security

### 3. Path Traversal via Tool IDs — [dispatcher.ts](file:///Users/aaron/Code/counselors/src/core/dispatcher.ts#L79-L80)

```ts
const outputFile = join(outputDir, `${id}.md`);
```

If a tool ID contains `../`, this writes outside the output directory. Tool IDs from project config are attacker-controlled.

**Fix:** Sanitize: `id.replace(/[^a-zA-Z0-9._-]/g, '_')` before using in filenames.

### 4. Symlink TOCTOU in [safeWriteFile](file:///Users/aaron/Code/counselors/src/core/dispatcher.ts#L128-L144)

The `lstatSync` check followed by `writeFileSync` is a classic TOCTOU race. An attacker can swap in a symlink between the check and write.

**Fix:** Write to a temp file, then `renameSync` into place. Or use `fs.openSync` with `O_NOFOLLOW` where available.

### 5. Full Environment Forwarded to Agents — [executor.ts](file:///Users/aaron/Code/counselors/src/core/executor.ts#L25)

`{ ...process.env, ...invocation.env }` leaks **all** env vars (AWS creds, tokens, etc.) to every spawned agent. Consider a minimal allowlist (`PATH`, `HOME`, `TERM`) with opt-in full env via a flag.

---

## Medium: Correctness

### 6. TOCTOU in [resolveOutputDir](file:///Users/aaron/Code/counselors/src/core/prompt-builder.ts#L36-L43)

`existsSync` + `mkdirSync` is racy. Two concurrent runs can collide. Use `mkdtempSync` or a retry loop on `EEXIST`.

### 7. Timer Leak in [executor.ts](file:///Users/aaron/Code/counselors/src/core/executor.ts#L46-L54)

When a timed-out process exits on SIGTERM, the inner SIGKILL timer (line 49-53) is never cleared. The Node process hangs for `KILL_GRACE_PERIOD` (15s) unnecessarily. Store the inner timer ref and clear it in the `close` handler.

### 8. Unbounded stdout/stderr Accumulation — [executor.ts](file:///Users/aaron/Code/counselors/src/core/executor.ts#L29-L34)

No cap on `stdout += data.toString()`. A verbose agent can cause OOM. Add a buffer limit (e.g., 10MB) and truncate with a marker.

### 9. No SIGINT Cleanup

Ctrl+C leaves spawned child processes running. Track active children and kill them on `SIGINT`/`SIGTERM`.

---

## Medium: Error Handling

### 10. Unhandled Rejection in [cli.ts](file:///Users/aaron/Code/counselors/src/cli.ts#L49)

`program.parseAsync(process.argv)` is fire-and-forget — no `.catch()`. Any thrown error becomes an unhandled rejection.

### 11. Uncaught JSON.parse in [config.ts](file:///Users/aaron/Code/counselors/src/core/config.ts#L22)

Malformed JSON crashes the CLI with an opaque error. Wrap in try/catch and provide an actionable message.

---

## Low: Architecture & Quality

### 12. `init.ts` Offers Test but Doesn't Run It

[Line 94-96](file:///Users/aaron/Code/counselors/src/commands/init.ts#L94-L96): If the user confirms "Run tool tests now?", it just prints a suggestion to run the command manually. Either run the tests or don't ask.

### 13. Dispatcher + Run Command Have No Unit Tests

[dispatcher.ts](file:///Users/aaron/Code/counselors/src/core/dispatcher.ts) and [run.ts](file:///Users/aaron/Code/counselors/src/commands/run.ts) are the core orchestration logic with zero unit test coverage. They're tightly coupled to `child_process` and `fs` with no injection seams. Add a `spawnFn` parameter to `execute()` and a `writeFn` to `safeWriteFile` for testability.

### 14. Custom Adapter Has No Tests

[custom.ts](file:///Users/aaron/Code/counselors/src/adapters/custom.ts) is untested despite being the most flexible (and therefore most dangerous) adapter.

### 15. `amp usage` Is Captured Synchronously

[captureAmpUsage](file:///Users/aaron/Code/counselors/src/core/executor.ts#L85-L94) uses `execSync` inside an async dispatch path. This blocks the event loop and delays other parallel tool starts. Make it async.

### 16. `isDebug` in [logger.ts](file:///Users/aaron/Code/counselors/src/ui/logger.ts#L1) is Evaluated at Module Load

If `DEBUG` is set after import, debug logging won't activate. Minor, but worth noting.

---

## Recommended Priority Order

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 | #1 Shell injection in discovery | 30min |
| P0 | #2 Project config trust boundary | 1-2h |
| P1 | #3 Path traversal in tool IDs | 15min |
| P1 | #4 Symlink TOCTOU | 30min |
| P1 | #7 Timer leak in executor | 15min |
| P1 | #10 Unhandled rejection in cli.ts | 5min |
| P1 | #11 JSON.parse error handling | 15min |
| P2 | #5 Environment leakage | 1h |
| P2 | #8 Unbounded stdout buffer | 30min |
| P2 | #9 SIGINT cleanup | 1h |
| P3 | #6, #12-16 | 2-3h |
