# Omni: engineering router

## Always
- Product: Chromium MV3 extension; React 19, strict TypeScript, Vite 6, npm; Node 24 in CI.
- `src/app` composes; `src/features` owns domain UI/logic; `src/components` reusable UI; `src/services` transport. Privileged code: `extension`, shared adapter: `shared/omni-agent.mjs`; `server` is dev bridge, `desktop` a prototype. Trace touched contract consumers.
- Preserve real Omni data/actions. No invented API, records or live demo fallback.
  Keep explicit Save, identity/context/baseline checks, confirmed readback and no blind write retries.
- Never hand-edit generated `dist*`, `desktop/generated`, `bin/obj`; keep secrets/PII/private evidence ignored.
- Work only in the requested repository/scope. Live academic writes, publishing,
  visibility changes and destructive operations need explicit authority.

## Route by behavior/risk, not file count
Default: primary handles cheap work. Before spawning ask:
"Does this agent provide enough independent value to justify another context/model invocation?"
If not, stay in primary. No role exists merely to check a workflow box.

| IF | THEN |
| --- | --- |
| Typo/docs, small local bug, obvious CSS fix | Primary only; diff + FAST/AFFECTED checks. |
| Normal bug/feature or bounded refactor | Primary or one bounded worker; reviewer/tester only for a concrete risk or evidence gap. |
| New screen/UX flow, substantial layout/interaction/responsive/a11y decision | Designer when that decision adds value; not for every UI edit. |
| Boundary/public command or storage contract, major cross-module redesign/refactor | ExecPlan + architect; independent compatibility review before completion. |
| Auth/identity, permissions, trust boundary, preview security or real-record mutation behavior | ExecPlan + one independent security reviewer with negative-path evidence. |
| Release | Load `omni-release`; preparation is not publishing authority. |

For non-trivial development load `omni-workflow`; not for cheap local work or
bounded specialist assignments. It routes to security/UI/delegation details only
when relevant. If skills are not discovered, read their repository SKILL.md directly.
Use [verification tiers](.codex/engineering/VERIFICATION.md) when selecting checks;
do not load the repository map or every reference by default.

## Delegation and completion
Primary owns integration and risk decisions. Prefer no history fork
(`fork_turns="none"` where supported); supply task/acceptance, exact owned files,
DO NOT TOUCH, DONE WHEN and expected output. Preserve concurrent changes.
At most two children open; primary alone delegates; no recursive teams, commits,
publishing or live writes by specialists without explicit bounded authority.
One reviewer normally suffices; security reviewer replaces general reviewer for
the same scope. Tester owns missing executable evidence, not a second code review.

Done: relevant regression/verification evidence, resolved material findings and
required independent review for architecture/high-risk changes; inspect final diff
for scope/generated files/PII. No configured lint/formatter. Report actual
PASS/FAIL/NOT RUN and limits; fixtures do not prove live Omni or actual payments.
Update docs only when behavior/contracts/setup change; batch at completion,
obtain approval for unrelated overwrites. Prefer KISS and existing commands.

Use available `openai-docs` for Codex/OpenAI configuration, `skill-creator` for
skills, Figma skills for Figma implementation, `imagegen` for bitmap assets only.
Activation/model limitations: [.codex/README.md](.codex/README.md).
