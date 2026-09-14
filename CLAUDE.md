# CLAUDE.md — startup protocol for Claude Code

`AGENTS.md` is the full rulebook and the **source of truth**. This file exists because Claude Code
loads `CLAUDE.md` automatically and does not load `AGENTS.md`. It carries only what must take effect
before anything else is read. **On any conflict, `AGENTS.md` wins** — do not resolve a contradiction
by following this file; report it.

Rules are in English. Discussion with the owner is in Ukrainian.

## Before you touch anything

1. Read `STATE.md` — the single source of truth about what is already done.
2. Run `governance/REPOSITORY_RECONCILIATION_PROTOCOL.md` and output its short report.
   If `STATE.md` disagrees with the actual repository contents: **STOP and report.** Do not fix it silently.
3. Read `AGENTS.md` in full before any non-trivial work.
4. Use `governance/STANDARD_ROUTING.yaml` to decide which files to open.
   Reading the whole repository is forbidden — it is the main source of drift.
5. Never redo anything marked DONE.

## Hard gates

- **One task per session.** Adjacent work you discover goes to `docs/research/OPEN_QUESTIONS.md` — you do not do it.
- **One proposal at a time.** Wait for the owner's explicit `Погоджено`. Silence is not approval.
- **An ADR with status `Proposed` is not a decision.** Do not build on it. Check `adr/README.md` for current statuses.
- **Engine purity is non-negotiable.** `engine-fight` and `engine-world`: no I/O, no filesystem, no network,
  no DOM, no clock, no global state.
- **`Math.random()` is forbidden in engine packages.** All randomness comes from an explicitly passed seeded PRNG.
  Same seed + same inputs = byte-identical EventLog.
- **Weight classes, bodies, styles, regions, name pools and every engine coefficient live in JSON under
  `packages/data`.** Hardcoding any of them in engine code is a defect even when it works.
- **Tests define reality; code adapts.** If a change breaks the statistical distributions, the change is
  rejected — never adjust the tests to match new behaviour.

## Kill-switch phrases

Obey immediately, without argument or reinterpretation:

| Phrase | Meaning |
|---|---|
| `СТОП` | Stop all work. Output current state. Change nothing. |
| `ЗВІРКА` | Run the reconciliation protocol and report only the result. |
| `ВІДКОТИ` | Revert the last change. Do not reinterpret it. |
| `НЕ ЧІПАЙ` | The named file or module is frozen for this session. |
| `ПОГОДЖЕНО` | Explicit approval of the last single proposal. Only this counts as approval. |

## Before you finish

- Append an entry to `governance/ACTION_JOURNAL.md`.
- Update `STATE.md` in the same commit as the work it describes.
- Report what you did **not** do and why — not only what you did.
- Do not claim a task is complete without running its tests.

## Escalate instead of deciding

STOP and ask when: the task crosses a `ROADMAP.md` phase boundary, a new external dependency is needed,
or `STATE.md` contradicts the repository.
