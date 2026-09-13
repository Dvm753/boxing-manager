# AGENTS.md — Rules for AI coding agents

Applies to Claude Code, Codex, Cursor and any other agent working in this repository.
Rules are in English. Discussion with the owner is in Ukrainian.

## 0. Before you do anything

1. Read `STATE.md`. It is the single source of truth about what is already done.
2. Run the reconciliation procedure in `governance/REPOSITORY_RECONCILIATION_PROTOCOL.md`.
   If `STATE.md` disagrees with the actual repository contents, STOP and report the discrepancy.
   Do not "fix" it silently.
3. Never redo a phase or task marked DONE.

## 1. Scope discipline

- Do exactly one task per session. If you discover adjacent work, write it to
  `docs/research/OPEN_QUESTIONS.md` — do not do it.
- Never refactor code you were not asked to touch.
- Never rename, move or delete existing files without an approved ADR.
- Phase boundaries in `ROADMAP.md` are frozen. Work outside the current phase requires an ADR.

## 2. Decision gates

- Propose ONE thing at a time. Wait for the owner's explicit approval ("Погоджено").
- No approval = no implementation. Silence is not approval.
- Every architectural decision is recorded in `adr/` before implementation, not after.
- An ADR with status `Proposed` is NOT a decision. Do not build on it.

## 3. Simulation core purity (project-specific, non-negotiable)

- `engine-fight` and `engine-world` must be pure: no I/O, no filesystem, no network, no DOM,
  no date/time access, no global state.
- `Math.random()` is FORBIDDEN in any engine package. All randomness comes from an explicitly
  passed seeded PRNG instance.
- Same seed + same inputs MUST produce a byte-identical EventLog. This is verified by tests.
- The engines must never import from UI or application layers. Dependencies point downward only.

## 4. Data, not code

- Weight classes, sanctioning bodies, styles, regions, name pools and all engine coefficients
  live in JSON under `packages/data`, validated by schemas.
- Hardcoding any of the above in engine code is a defect, even if it works.

## 5. Testing

- Every engine change must keep the golden-master statistical tests green
  (see `docs/FIGHT_ENGINE_SPEC.md`, section Calibration).
- If a tuning change breaks the distributions, the change is rejected — do not adjust the tests
  to match the new behaviour. Tests define reality; code adapts.
- Determinism test is mandatory in CI.

## 6. Reporting

- After every session append an entry to `governance/ACTION_JOURNAL.md`.
- Update `STATE.md` in the same commit as the work it describes.
- Report what you did NOT do and why, not only what you did.

## 7. Kill-switch phrases

The owner may use these at any time. Obey immediately and without argument:

| Phrase | Meaning |
|---|---|
| `СТОП` | Stop all work. Output current state. Change nothing. |
| `ЗВІРКА` | Run the reconciliation protocol and report only the result. |
| `ВІДКОТИ` | Revert the last change. Do not reinterpret it. |
| `НЕ ЧІПАЙ` | The named file/module is frozen for this session. |
| `ПОГОДЖЕНО` | Explicit approval of the last single proposal. Only this counts as approval. |

## 8. Prohibited behaviours

- Inventing requirements not present in the docs.
- "Improving" balance coefficients without an ADR.
- Producing large multi-file changes in one step.
- Claiming a task is complete without running tests.
- Rewriting documentation to match code. Code follows documentation; if documentation is wrong,
  raise it and wait.
