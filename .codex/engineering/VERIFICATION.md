# Verification tiers

Read package scripts/affected test imports when selecting commands. Prefer Node 24;
do not reinstall a working environment on every task. No configured lint/formatter.

| Tier | Minimum evidence | Use |
| --- | --- | --- |
| FAST | Diff/scope hygiene + one relevant focused test or static/link/config check | Typo/docs/config, obvious local fix; iteration |
| AFFECTED | Changed-behavior + consumer regressions; TS check when TS changes; build/browser for affected delivered UI/protocol | Normal bug/feature, bounded refactor; iteration |
| FULL | `npm test` + `npm run build:extension` + relevant affected browser/adapter evidence | Major cross-layer behavior change, architecture/high-risk; not cosmetic breadth |
| RELEASE | FULL + `npm run test:extension-ui`, versions/ZIP/privacy/SHA and remote CI | Release skill only |

A tier is evidence, not an agent count. Main can run it. A small edit changing
identity/trust/academic mutation behavior is high-risk regardless of line count.
FULL requires actual extension browser when worker/session/mutations or extension
interactions change. Configuration/process-only edits need config/skill/routing
validation, not an unrelated product build or entire unit suite.

## Avoid duplicate work

Choose the smallest check that covers the changed behavior and affected consumers.
For ordinary UI (including theme/colors across several stylesheets), use AFFECTED:
one delivery build and focused browser evidence. Do not add all unit tests or the
entire extension scenario solely because many CSS files changed. Use actual
extension evidence for Shadow DOM/injection behavior; full auth/mutation scenarios
are needed when those behaviors change, or when no smaller adequate check exists.

Do not run standalone TypeScript before/after a build on the same inputs. Build
only affected delivery targets; web + pages + extension are not an automatic set.
A new screenshot/assertion should use a focused check when possible, not repeat an
already passing full scenario. Stabilize transitions before capturing screenshots.
After selected checks pass, stop unless a concrete uncovered risk remains.

For failures, retain the first result and diagnose before retrying. A passing retry
does not erase a failure; report the cause or unresolved flakiness. Prefer a focused
reproduction over repeated full-suite attempts. Keep successful command output to
counts/summary and errors; save verbose logs under ignored tmp if needed, preserving
exit codes and enough failure detail to diagnose. No new logging framework required.

## Existing commands (select, do not run this as a checklist)

| Surface | Command |
| --- | --- |
| Focused regression(s) | `node --experimental-strip-types --test tests/<name>.test.mjs` (multiple paths allowed) |
| All unit/protocol tests | `npm test` |
| Source TypeScript | `npx tsc --noEmit` (src only; also in builds, don't duplicate on same input) |
| Extension delivery | `npm run build:extension` before `npm run test:extension-ui` |
| Color theme/preferences | `node tests/color-theme-browser.mjs`; extension evidence if injection changes |
| Shared shell/popovers/sidebar/lesson UI | `npm run test:workspace-ui` |
| Catalogue/filter/files UI | `npm run test:materials-ui` |
| Feature UI | `node tests/homework-browser.mjs`, `node tests/dossier-browser.mjs`, `node tests/income-browser.mjs`, `node tests/login-browser.mjs` (only matching feature) |
| Standard Vite entry/build config | `npm run build` |
| Pages/demo mode | `npm run build:pages` |
| Desktop prototype | `npm run desktop:build` on Windows with tooling |
| Desktop CI/artifact parity | `npm run build:pages`; `node desktop/build-agent.mjs`; `dotnet restore desktop/Omni.Desktop.csproj --locked-mode`; `dotnet build desktop/Omni.Desktop.csproj -c Release --no-restore` (only desktop scope) |
| Diff hygiene | `git diff --check`, plus final scope/untracked inspection; `--cached` before commit |
| Codex config only | `codex --strict-config doctor --summary`; skill validation + scenario routing check |

For AFFECTED, compile/integration check changed worker/adapter/build inputs and
delivered UI using extension build; pure local helper fixes may use focused tests/
types without rebuilding unrelated bundles. Real browser interaction changes need
matching browser evidence, not just typechecking. Do not run workspace, feature
and extension browsers for the same assertion when one covers it; add only missing
surface (extension-specific behavior still needs actual extension).

## Focused regression map
Names mean `tests/<name>.test.mjs`; trace imports/consumers before selection.
- Attendance/theme/marks: attendance, lesson-theme, lesson-mark, lesson-draft,
  present-lessons; Save/conflict/partial-confirmation browser cases.
- Rewards/copy: lesson-rewards, lesson-reward-ui, reward-budget, lesson-copy,
  lesson-draft; sliders/copy/budget browser cases.
- Schedule: schedule, schedule-layout, schedule-range, present-lessons.
- Homework: homework; materials: teaching-materials.
- Dossier/income: dossier, dossier-model, income, schedule-range.
- Auth/session/worker: extension, background-agent, poller, login, switch-teacher,
  desktop as relevant.
- Previews: file-preview, extension-files, extension/desktop as relevant.

## Scheduling/evidence
Build once on stable inputs before extension browser; no rebuild under loaded
extension or source edits during a fixture run. Browser scripts use fixed ports/
profiles: run sequentially, never kill unrelated processes. Extension uses Playwright
Chromium (CI prerequisite `npx playwright install chromium` on clean hosts); many
feature fixtures need Edge. Inspect script/availability before execution.

Use fictional schema-faithful fixtures; zero/missing/partial and date/payday
boundaries where relevant. Freeze time for calendar assertions; inspect screenshots
under ignored tmp at affected desktop/narrow sizes. `tests/file-preview-live.mjs`
needs separate authorized external/session scope, not an ordinary gate.

Keep concise evidence in task context (no routine ledger file): coverage, inputs, environment,
command/result and limits. Reuse unchanged evidence across roles and handoffs.
After fixes rerun affected checks/review, not the whole workflow; invalidate broad
evidence when dependencies/shared contracts/build inputs can affect it. Final FULL
is still required for major cross-layer behavior/architecture/high-risk work; release evidence covers final release inputs.
Record original failures and retry rationale; an unexplained flake is not PASS.
Mocks do not prove live Omni or actual payments.

CI on main/develop/PR: Ubuntu Node24 npm ci/test/extension build; Windows extension
workflow adds Chromium extension browser and package. Desktop/Pages are manual.
These CI gates are unchanged; local FAST/AFFECTED does not replace required CI.
