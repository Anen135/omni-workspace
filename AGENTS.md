# Omni: engineering router

## Always
- Chromium MV3; React 19, strict TypeScript, Vite 6, npm; Node 24 in CI.
- `src/app` composes; `src/features` domain UI/logic; `src/components` reusable UI; `src/services` transport. Privileged: `extension`; shared adapter: `shared/omni-agent.mjs`; `server` dev bridge; `desktop` prototype. Trace changed-contract consumers.
- Real Omni data/actions only; no invented API/records/live fallback. Preserve explicit Save, identity/context/baseline checks, confirmed readback and no blind write retries.
- Preserve unrelated edits. Never hand-edit generated `dist*`, `desktop/generated`, `bin/obj`; keep secrets/PII/private evidence ignored.
- Stay in requested scope. Live academic writes, publishing, visibility changes and destructive operations require explicit authority.

## Default: primary only
Ordinary bugs, features, UI and bounded refactors use one agent. Delegate only a
concrete independent chunk/question worth the extra context. Use exact `omni_*`
roles; generic roles may select heavier models. Details only when spawning:
[assignment contract](.agents/skills/omni-workflow/references/delegation.md).
At most two children; primary alone delegates, no recursive teams.

| Change | Required route |
| --- | --- |
| Typo/docs/config/local fix | Primary; FAST/AFFECTED. |
| Ordinary feature/UI/refactor | Primary; AFFECTED. Reviewer/tester only for a concrete risk/evidence gap. |
| Substantial unresolved UX | Designer only when useful. |
| Public command/shared storage contract or major redesign | ExecPlan + architect + independent compatibility review. |
| Auth/identity, permissions, trust/preview boundary, real-record mutation behavior | ExecPlan + one independent security reviewer + negative paths. |
| Release | `omni-release`; preparation does not authorize publishing. |

Cosmetic breadth and private UI preferences alone are not architecture/high risk.
For non-trivial development load `omni-workflow` once; skip cheap local fixes,
process-only edits and bounded assignments. Load only relevant references; do not
reread available instructions or open every role/repository map. Use `rg` then
bounded source reads; filter large outputs before returning them to context.

Choose [verification](.codex/engineering/VERIFICATION.md) by behavior/risk, not file
count. Reuse passing evidence; builds include TypeScript. Stop after acceptance
and selected checks pass. More tests/reviews/reruns need a concrete gap/change;
retain failures and explain retries. Architecture/high-risk independent gates stay.

Done: resolved material findings, affected evidence, final scope/generated/PII diff
check. Brief outcome and actual PASS/FAIL/NOT RUN/limits; agents only if used.
No configured lint/formatter; fixtures do not prove live Omni/payments. Batch needed
docs at completion; obtain approval for unrelated overwrites. Prefer KISS.
Use `openai-docs` for Codex/OpenAI setup, `skill-creator` for skills, Figma skills
for Figma, `imagegen` for bitmaps. [Activation](.codex/README.md) only for setup issues.
