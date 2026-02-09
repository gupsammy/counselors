Excellent analysis from the oracle. Now I can synthesize everything — the existing skill, the two prior opinions, and the oracle's arbitration — into a definitive plan.

---

# `counselors` npm CLI — Architecture Plan

## Synthesis of Prior Opinions

Claude and Codex both responded (Gemini and Amp returned empty). They agree on the fundamentals — JSON config, two-stage binary discovery, `child_process.spawn` for dispatch, TypeScript. They diverge on command taxonomy, abstraction level, and read-only modeling. The oracle arbitrated each disagreement. Here's the unified plan.

---

## 1. CLI Commands

Grouped nouns with flat aliases for ergonomics:

```
counselors tools add <tool>        # Add a tool (claude, codex, gemini, amp, or custom)
counselors tools remove <tool>     # Remove a configured tool
counselors tools list              # Show configured tools + status + read-only level
counselors tools test [tool...]    # Verify tools work ("reply OK" protocol, 30s timeout)
counselors tools discover          # Scan system for known binaries
counselors doctor                  # Full preflight: binaries, versions, auth, read-only capability

counselors run "<prompt>"          # Dispatch configured tools in parallel
counselors run -f prompt.md        # Prompt from file
counselors run -t claude,codex     # Specific tools only
counselors run --context .         # Auto-gather git diff + relevant files
counselors run --read-only strict  # Only tools with enforced sandboxing
counselors run --dry-run           # Show what would dispatch without running
counselors run --json              # Machine-readable output

counselors init                    # Interactive setup (discover → add → test)

# Aliases
counselors add → counselors tools add
counselors ls  → counselors tools list
```

The `run` command accepts prompts via argument, `--file`, or stdin (`git diff | counselors run -`).

---

## 2. Configuration

**Location**: `~/.config/counselors/config.json` (respects `$XDG_CONFIG_HOME`). Project-level override via `.counselors.json` in repo root. Merge order: built-in defaults → global → project → CLI flags.

**Validation**: [zod](https://zod.dev) schema with a `version` field for future migrations.

```json
{
  "version": 1,
  "defaults": {
    "timeout": 540,
    "outputDir": "./agents/second-opinions",
    "readOnly": "best-effort",
    "maxContextKb": 50
  },
  "tools": {
    "claude": {
      "binary": "/opt/homebrew/bin/claude",
      "defaultModel": "opus",
      "models": {
        "opus": "claude-opus-4-6",
        "sonnet": "claude-sonnet-4-5",
        "haiku": "claude-haiku-4-5"
      },
      "readOnly": {
        "level": "enforced",
        "flags": ["--tools", "Read,Glob,Grep,WebFetch,WebSearch",
                  "--allowedTools", "Read,Glob,Grep,WebFetch,WebSearch",
                  "--strict-mcp-config"]
      },
      "execFlags": ["-p", "--output-format", "text"],
      "promptMode": "argument"
    }
  }
}
```

Key: `readOnly.level` is `"enforced"` | `"bestEffort"` | `"none"` — honest about what each tool can actually guarantee. Stored binary path avoids PATH drift at runtime.

---

## 3. Binary Discovery

Two-stage pipeline, no external dependencies:

1. **`which` via `child_process.execSync`** — uses current PATH
2. **Extended path scan** (platform-aware `fs.accessSync` with `X_OK`):
   - `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`
   - `~/.npm-global/bin`, `~/.volta/bin`, `~/.bun/bin`
   - `$NVM_BIN`, `~/.nvm/versions/node/*/bin`
   - `$FNM_MULTISHELL_PATH/bin`, `~/.local/share/fnm/aliases/default/bin`
3. **User override** from config

Version detection deferred to `counselors tools test` (runs `<tool> --version`).

---

## 4. Read-Only Policy

The oracle identified this as the **single most important architectural decision** — don't lie about safety.

| Tool | Level | Mechanism |
|------|-------|-----------|
| Claude | `enforced` | `--allowedTools` whitelist + `--strict-mcp-config` |
| Codex | `enforced` | `--sandbox read-only` (filesystem sandbox) |
| Gemini | `bestEffort` | `--allowed-tools` whitelist (tool-level, not FS) |
| Amp | `bestEffort` | `--settings-file` tool whitelist |

**Run-time policy** (`--read-only` flag):
- `strict` — only dispatch tools with `enforced` level; skip others with a warning
- `best-effort` (default) — apply best available restrictions per tool, label output prominently
- `off` — no restrictions

---

## 5. Tool Adapter Interface

Minimal adapter per tool — not a plugin framework, but enough structure to keep tool-specific logic contained and testable:

```typescript
interface ToolAdapter {
  id: string;
  displayName: string;
  commands: string[];           // binary names to search for
  installUrl: string;
  readOnly: { level: 'enforced' | 'bestEffort' | 'none'; flags: string[] };
  defaultModel: string;
  models: Record<string, string>;

  buildInvocation(req: RunRequest): { cmd: string; args: string[]; env?: Record<string, string>; stdin?: string };
  parseResult(exec: ExecResult): ToolReport;
}
```

Four built-in adapters: [claude.ts](file:///Users/aaron/Code/counselors/src/adapters/claude.ts), [codex.ts](file:///Users/aaron/Code/counselors/src/adapters/codex.ts), [gemini.ts](file:///Users/aaron/Code/counselors/src/adapters/gemini.ts), [amp.ts](file:///Users/aaron/Code/counselors/src/adapters/amp.ts). Custom tools use a generic adapter configured via `counselors tools add custom`.

---

## 6. Parallel Dispatch

`child_process.spawn` + `Promise.allSettled` + `p-limit` for bounded concurrency:

- Per-tool timeout (default 540s) with SIGTERM → SIGKILL escalation
- Overall SIGINT/SIGTERM handler that propagates to children and preserves partial results
- **No `shell: true`** — prompt/model/tool names are untrusted input
- Real-time progress via `ora` spinners (falls back to plain text when not a TTY)

**Output layout**:
```
./agents/second-opinions/<slug>/
  run.json          # manifest: tools, models, timestamps, exit codes
  prompt.md         # the assembled prompt
  <tool>.md         # each tool's report
  <tool>.stderr     # stderr capture
  <tool>.stats.json # tool-specific metrics (e.g., Amp cost)
  summary.md        # basic synthesis (v1: concatenated highlights)
```

---

## 7. Synthesis (v1)

Don't punt entirely — basic synthesis is core to the value prop. But keep it heuristic, not LLM-powered:

- Extract headings + first paragraph per report
- List which tools succeeded/failed/timed out
- Side-by-side comparison table
- No "grading" or LLM-based summarization in v1
- Optional LLM synthesis in v2 (pipe reports through a configured tool)

---

## 8. Project Structure

```
counselors/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                 # Entry point (commander)
│   ├── commands/
│   │   ├── init.ts
│   │   ├── tools-add.ts
│   │   ├── tools-remove.ts
│   │   ├── tools-list.ts
│   │   ├── tools-test.ts
│   │   ├── tools-discover.ts
│   │   ├── run.ts
│   │   └── doctor.ts
│   ├── core/
│   │   ├── config.ts          # Load/save/validate/migrate (zod)
│   │   ├── discovery.ts       # Two-stage binary finder
│   │   ├── executor.ts        # Spawn + timeout + output collection
│   │   ├── dispatcher.ts      # Parallel fan-out via p-limit
│   │   ├── context.ts         # Git diff + file gathering
│   │   └── synthesis.ts       # Basic report summarization
│   ├── adapters/
│   │   ├── index.ts           # Registry of built-in adapters
│   │   ├── claude.ts
│   │   ├── codex.ts
│   │   ├── gemini.ts
│   │   ├── amp.ts
│   │   └── custom.ts          # Generic adapter for user-defined tools
│   ├── ui/
│   │   ├── prompts.ts         # @inquirer/prompts
│   │   └── output.ts          # Spinners, tables, formatting
│   └── types.ts
├── assets/
│   └── amp-readonly-settings.json
├── tests/
│   ├── unit/                  # Config, discovery, adapter buildInvocation
│   └── integration/           # Fake binaries in fixtures/bin/
├── fixtures/
│   └── bin/                   # Stub executables for integration tests
└── README.md
```

**Dependencies**: `commander`, `zod`, `@inquirer/prompts`, `ora`, `p-limit`, `strip-ansi`. Build with `tsup`. No `execa`, no `which` package.

---

## 9. Implementation Order

| Phase | Scope | Delivers |
|-------|-------|----------|
| **1** | Types + config + zod schema + adapters (buildInvocation only) | Foundation |
| **2** | Discovery engine + `doctor` + `tools discover` | Users can find their tools |
| **3** | `tools add/remove/list/test` + interactive prompts | Full tool management |
| **4** | `run` with parallel dispatch + progress UI + file output | Core value |
| **5** | Context gathering (`--context`) + basic synthesis | Workflow completeness |
| **6** | Custom tools, `--json`, `--dry-run`, stdin piping | Polish |

---

## 10. Key Risks

| Risk | Mitigation |
|------|-----------|
| CLI flag drift (tools change flags between versions) | `doctor` command validates flags; pin tested versions in docs |
| Auth failures confused with binary-not-found | `tools test` distinguishes binary/auth/invocation failures explicitly |
| Output contains ANSI codes / non-markdown | `strip-ansi` on all captured stdout |
| Parallel runs explode costs | `--dry-run` flag; warn on >3 tools selected |
| Symlink/injection attacks on output files | Refuse symlink targets; `umask 077`; no `shell: true` |
| Windows support | Declare POSIX-only in v1; document it |
