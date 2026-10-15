# Spawn only for independent value

Ask: "Does this agent provide enough independent value to justify another
context/model invocation?" Compare a bounded assignment + handoff with doing it
locally. Reading two files, searching a few usages, obvious tests and small edits
usually belong to primary.

## Minimal assignment
Use `fork_turns="none"` when supported. Supply repository path; TASK/acceptance;
FILES/SUBSYSTEM (write ownership if any); DO NOT TOUCH; DONE WHEN; expected output.
Include relevant decisions/facts/artifact paths, not full conversation or reasoning.
Specialists follow root safety/scope, not the primary's orchestration loop.
If no no-fork control exists, send only this summary; do not claim history isolation.

| Role | Minimal additional input | Use only when |
| --- | --- | --- |
| explorer | Question + starting symbols/paths | Search/cross-layer discovery is substantial and not already done |
| coder / simple_coder | Chosen behavior + owned files + failing case | An isolated implementation chunk outweighs handoff; mechanical batches can use simple_coder |
| ui_designer | Requirements + relevant screens/components + constraints | A real UX/layout/interaction decision is unresolved |
| architect | Problem + affected boundaries/consumers + constraints | Contract/boundary redesign needs independent planning |
| reviewer / security_reviewer | Acceptance + diff/base or artifact + relevant tests + risk | Independent correctness/security value, not a duplicate test run |
| tester | Acceptance + changed behavior + missing test surface + existing results | Executable evidence is missing, not to re-review code |
| docs | Verified behavior + exact authorized docs | A substantial documentation batch, not a few sentences |
| release_manager | Target SHA/version + artifacts + existing check evidence | Release refs/artifacts/CI need a separate audit |

Resolve `omni_` role names in `.codex/agents`; preserve these names for compatibility.
Use one reviewer per scope. Security reviewer can cover correctness for the same
high-risk change; tester and release manager consume existing evidence rather
than rerunning it without cause. Architect proposes; primary decides/integrates.
Explorer must not remap work already traced by primary/architect.

## Models and concurrency
Cheap bounded exploration/mechanical edits/docs/test execution: Luna low;
ordinary test/metadata audit: Luna medium. Implementation/design/general review:
Sol medium. Architecture/security/complex refactor or difficult debug: Sol high.
Promote only the bounded hard question, not every participant; no universal high.
These are explicit role defaults, not price/availability guarantees. If unavailable,
report fallback and choose an available suitable model without installing/changing globals.
A higher-level client policy may override them; do not claim savings from file edits alone.

At most two children open, mostly for independent read-only work. Parallel writers
need disjoint ownership. Primary alone spawns; specialists have no children.
Reuse for related follow-up (targeted fixes/recheck); avoid reusing unrelated stale
context. No commit/push/publish/live-record actions without explicit delegation.
