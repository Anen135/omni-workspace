# Optional boundary hints

Not a startup read or static repository inventory. Verify current source/scripts;
use only the matching hint when the owner is unclear.

| Responsibility | Start here |
| --- | --- |
| Workspace/state | `src/app/LiveWorkspace.tsx`, `src/app/components`, `src/features` |
| Controls/design | `src/components`, `src/styles/styles.css`; Golos Text, purple-light, dense |
| Extension mount/styles | `src/app/extension/extension-entry.tsx` (Shadow DOM) |
| Transport | `src/services/omni-client.ts` and transport clients |
| Privileged commands | `extension/background.mjs`, `extension/policy.mjs`, handler modules |
| Shared page adapter | `shared/omni-agent.mjs` (extension + desktop consumers) |
| Dev bridge | `server/omni-bridge.mjs`, `server/bridge-protocol.mjs` |
| Desktop prototype | `desktop/Program.cs`, `PreviewFiles.cs`, `Omni.Desktop.csproj` |
| Demo/Pages | `src/demo`, Vite pages mode, not live fallback |
| Checks/releases | `package.json`, `.github/workflows`, `extension/build.mjs` |

Omni API is external/authenticated/undocumented: use source/tests or sanitized
authorized evidence, never infer endpoints. Preview hosts/paths come from policy,
not from arbitrary failing URLs. Income is schedule estimation, not payroll;
five-coin lesson allocation is local policy, not an API balance.

`main` releases; `develop` development. Inspect current remote refs for releases.
No configured lint/formatter/database migrations. Public docs: README, extension/
desktop README, CHANGELOG; PROJECT_REVIEW is historical, not current authority.
Private profiles/exports/diagnostics belong in ignored paths, never `public/`
(copied to releases). Read source for current env/toolchain rather than duplicating it.
