---
name: omni-workflow
description: Risk-sized workflow for non-trivial Omni development. Skip cheap local fixes, process-only edits, releases and bounded specialist assignments.
---

# Risk-sized development

Trace the owning path and changed-contract consumers, choose acceptance/checks,
implement and verify. Primary handles ordinary work; no mandatory team or staged
handoffs. Keep diagnosis read-only unless fixes are requested.

## Load only the applicable route
- Ordinary bug/feature/refactor: minimal owning-layer change and affected evidence.
  Delegate only a concrete independent chunk/question worth another context.
- UI: read [UI](references/ui.md); reuse established patterns. Designer only for
  an unresolved substantial UX decision. Cosmetic breadth is not architectural risk.
- Public command/shared storage contract or major cross-module redesign: read
  [PLANS](../../../.codex/engineering/PLANS.md); ExecPlan + architect + independent
  compatibility review. Private UI preferences alone do not require this gate.
- Auth/identity, permissions, trust/preview boundary or real-record mutation
  behavior: ExecPlan + [security](references/security.md) + one independent security
  reviewer and negative-path evidence. Cosmetic edits alone do not trigger it.
- Delegation: read [assignment contract](references/delegation.md) only if spawning.

## Check once, expand for evidence
Choose FAST/AFFECTED from [verification](../../../.codex/engineering/VERIFICATION.md).
FULL is for major cross-layer behavior changes and architecture/high-risk work;
RELEASE belongs to `omni-release`. Multiple CSS files alone do not require FULL.
Use the smallest existing check covering the behavior. Build once on stable inputs;
it includes TypeScript. Reuse passing evidence until an input affecting it changes.
Stop when acceptance and the selected tier pass. Add a test, review or rerun only
for a named gap/failure/change; screenshots alone do not justify repeating a suite.

Primary runs straightforward checks. One reviewer per concrete risk; security
reviewer replaces general reviewer for the same scope. Tester supplies missing
executable evidence. Return findings to the implementer and recheck affected slices.
Never call self-checks independent. Do not waive architecture/high-risk review to
save tokens; disclose unavailability and request a scoped waiver or leave a handoff.

## Context and reporting
Use supplied context before searching; `rg` symbols, then relevant file sections.
Do not reread unchanged instructions, load the repository map or inspect all role
profiles by default. Return summaries/failures from large outputs; retain full logs
under ignored tmp when needed. Keep evidence in task context; no routine ledger file.
Hand off paths, findings and check results, not transcripts or whole conversation.
Batch necessary docs at completion. Report outcome, actual checks and limits briefly.
