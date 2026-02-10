# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-02-10

### Added
- Multi-agent parallel dispatch with configurable adapters (Claude, Codex, Gemini, Amp, Custom)
- Project-level `.counselors.json` configuration with defaults overrides
- Tool management commands: add, remove, test, list, discover
- Doctor command for environment diagnostics
- Context gathering with file discovery and prompt building
- Response synthesis across multiple agent outputs
- Amp deep mode support with separate settings file and read-only safety prompt
- Model selection during `init` with per-adapter `extraFlags`
- Skill template output directory prefixed with timestamp for lexical sorting

### Changed
- Simplified `ToolConfig` — removed model concept, unified flags into `extraFlags`

### Security
- Sanitize tool IDs before use in filenames to prevent path traversal
- Allowlist environment variables passed to child processes
- Use `execFileSync` instead of `execSync` in discovery to prevent shell injection
- Restrict project config to `defaults` only — cannot inject `tools`
- Atomic file writes via temp+rename pattern to prevent partial writes

### Fixed
- SIGINT handler properly terminates active child processes
- Release workflow: build before test so integration tests find `dist/cli.js`
- Release script handles blank changelogs instead of failing
- Release workflow accepts leading `v` in version input


[Unreleased]: https://github.com/aarondfrancis/counselors/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/aarondfrancis/counselors/releases/tag/v0.3.0
