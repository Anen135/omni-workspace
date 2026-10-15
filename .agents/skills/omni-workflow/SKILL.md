---
name: omni-workflow
description: Primary-agent workflow for non-trivial Omni bugs, features, UI, architecture and high-risk changes. Skip trivial/local fixes, releases and bounded specialist assignments.
---

# Risk-sized development

Trace the owning path and available real data, state a short scope/check plan,
implement, verify, fix and integrate. Primary may do all ordinary work.
A team is not a required stage. Diagnosis remains read-only unless fixes are requested.

## Select only the applicable gates
- Normal bug: evidence-backed cause, minimal owning-layer fix, focused regression.
  Normal feature/refactor: existing consumers, acceptance conditions and affected tests.
  No independent agent unless uncertainty, concurrency, broad regression potential
  or difficult-to-observe behavior justifies one.
- UI: use designer when an unresolved screen/flow/layout/interaction decision
  adds independent value; primary can reuse established patterns and fix obvious
  visual bugs. Read [UI](references/ui.md) only for UI work.
- Architectural boundaries, public command/storage contracts or major cross-module
  redesign: ExecPlan + architect before implementation; an independent reviewer
  checks compatibility on the final diff. Primary may implement; no obligatory worker.
- Auth/identity, permissions, trust/preview boundaries or academic mutation behavior:
  ExecPlan; read [security](references/security.md); require one independent
  security reviewer on the final diff and negative-path evidence.
  Cosmetic text in a sensitive file alone does not trigger this route.
- For plans read [PLANS](../../../.codex/engineering/PLANS.md).
  Small multi-step work does not itself require an ExecPlan.
- If delegating read [assignment contract](references/delegation.md), not every role
  or repository document. Only split independently useful work.

## Verification and review
Use [tiers/area commands](../../../.codex/engineering/VERIFICATION.md).
Iterate with FAST/AFFECTED. FULL is a final gate for significant/cross-boundary/high-risk
changes, not a loop after every edit; RELEASE belongs to `omni-release`.
Re-use evidence on unchanged inputs; record what it covers and invalidate it when
source, dependency, build input or environment changes affect it.

Primary runs obvious tests. Delegate a tester only for a distinct missing test
surface, complex fixture/browser investigation or independent high-risk validation.
A reviewer may run a focused reproduction; do not assign a tester to repeat it.
Normal work uses at most one reviewer if justified. High-risk uses security reviewer
instead of a parallel general reviewer; a second reviewer/tester needs a distinct
documented risk/evidence gap. Never let the implementer label self-checks independent.

Return findings to the implementer, recheck the changed slice, and repeat only
invalidated tests/review. Preserve a completed FULL gate if fixes cannot affect it;
otherwise rerun relevant coverage and the final FULL gate as required.
Do not waive architecture/high-risk independent review to save tokens: disclose
unavailability and request a scoped waiver or leave a clear handoff.

## Context discipline
Read relevant symbols/usages, not entire trees. Repository map is optional:
[boundary hints](../../../.codex/engineering/REPOSITORY.md), then verify from source.
Return concise artifacts/findings/checks, not reasoning transcripts or duplicated logs.
Necessary documentation is batched at completion; no extra docs agent for a few lines.
