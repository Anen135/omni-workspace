---
name: omni-release
description: Prepare or publish an Omni extension release with versions, checks, ZIP, refs and CI. Publishing requires an explicit release request; skip normal development.
---

# Extension release

Preparation does not authorize publication, visibility changes, force pushes,
branch protection or Pages/desktop deployment. Primary owns external mutations.
Use release manager only for an independently useful artifact/ref/CI audit, not
to repeat completed tests. A release-critical ambiguity requires high-reasoning
analysis, not a rubber-stamp mechanical check.

1. Inspect worktree/scope, main/develop ancestry and remote tags/releases with
   git/gh. Preserve unrelated changes; never stage everything blindly.
2. Select next available beta. Synchronize package + lockfile root versions,
   manifest numeric version/version_name: `0.3.0-beta.N` / `0.3.0.N` / `v0.3.0-beta.N`.
3. Update authorized CHANGELOG, `.github/release-beta.md`, README version/ZIP links.
   Verify claims against source, not live/payroll assumptions; preserve GPL-3.0-only.
4. Apply RELEASE tier in [verification](../../../.codex/engineering/VERIFICATION.md):
   `npm test`, `npm run build:extension`, then `npm run test:extension-ui`.
   Reuse valid final-input evidence, run relevant uncovered feature browser checks.
   Resolve material review findings; architecture/high-risk work needs independent
   review, ordinary changes follow risk routing, not a new mandatory full team.
5. ZIP dist-extension **contents**, manifest at root; new ignored tmp filename.
   Inspect version, license/install docs, no profiles/PII/diagnostics/node_modules;
   record SHA-256. No desktop validation claim unless that artifact was tested.
6. Commit authorized files; promote tested develop to main without discarding
   either branch. Fast-forward only if valid; stop on divergence/conflict.
   Push scoped refs, keep development on develop; no reset/force workaround.
7. Draft GitHub prerelease targets the **full tested SHA**. Upload ZIP; verify
   asset name/digest/target. Wait for CI + Windows extension workflow for same SHA.
   Failed CI is not bypassed by local success.
8. Publish only with explicit authority after gates pass; verify draft=false,
   prerelease/tag/target/download. Report link/checks/update instructions.

Unpacked updates: replace files in original folder, Reload/Update in extensions
page, refresh Omni. No automatic GitHub update promise. Pages is optional demo,
not authenticated Omni hosting. For assignments read
[delegation](../omni-workflow/references/delegation.md) only if spawning.
