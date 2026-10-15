# ExecPlan

Required for boundary/public command/storage contract changes, major cross-module
redesign/refactor, auth/trust/academic mutation behavior. Not required solely because
a small task has several steps. Keep private plans under ignored
`.agent-notes/execplans/<task>.md`; no credentials or real student/teacher records.

Keep the plan proportional, with these useful fields:
- Outcome, risk, authorized scope and non-goals.
- Relevant source/consumers, real schema evidence and unknowns.
- Chosen design, compatibility/persisted data, in-flight/partial-failure handling
  and rollback; threats/authority for security-sensitive work.
- Small milestones/acceptance, selected verification tier and exact checks.
- Delegation only if useful: ownership, acceptance and output (or primary-only).
- Progress/decisions, review findings and actual PASS/FAIL/NOT RUN evidence.

Architect supplies boundary decisions before architectural implementation;
primary integrates. High-risk needs independent security review on final diff.
A plan grants no authority; update only when evidence or decisions change.
