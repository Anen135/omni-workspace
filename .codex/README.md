# Repository-local Codex setup

Root AGENTS.md is the router. `.agents/skills/omni-workflow` contains conditional
development procedures; `omni-release` is release-only. Engineering references
are read on demand, not as startup context. Legacy WORKFLOWS/RELEASE links redirect
to these skills. Role names remain compatible; descriptions are not mandatory calls.

## Activation
- Checked with local CLI 0.162.1. Open this trusted repository in a **new session**
  after edits; this running conversation is not proof of role/model/skill reload.
- Run `codex --strict-config doctor --summary`. Distinguish inherited host warnings
  from project config errors; this is not product-test or model-access validation.
- Skills should be discovered from `.agents/skills`. If absent, read exact SKILL.md
  directly; do not duplicate it into a second directory. A bounded role may use
  the corresponding TOML instructions if custom agent discovery is unavailable;
  disclose fallback, not a fictitious successful agent launch.
- Do not change global trust, credentials, CODEX_HOME, permissions, MCPs or install
  tools/models to activate this setup. Read-only roles are instructions, not sandboxes.

## Cost policy
Two child threads maximum; zero for cheap work. Prefer fresh bounded assignments
without conversation history. One reviewer per risk scope; tester supplies missing
execution evidence rather than duplicate code review. Primary owns small searches,
fixes, obvious tests and short docs. Independent gates remain for architecture
and high-risk work; release checks/CI/artifact privacy remain mandatory.

Configured profiles:
- Luna low: explorer, simple_coder, docs; Luna medium: tester, mechanical release audit.
- Sol medium: coder, UI designer, general reviewer.
- Sol high: architect, security reviewer; promote difficult debug/complex refactor
  or release-critical reasoning explicitly, not every mechanical participant.
- Unspecified agents default Luna low; primary model is unchanged. Profile files
  override defaults. Availability/client policy can override selection: disclose
  fallback. This is a cost-conscious routing choice, not measured billing savings.

Keep commands aligned with package scripts/CI. No new product command, lint,
hook, plugin or permission policy was installed. See verification tiers for evidence.
Fictional fixtures do not prove live service or payments.

Configuration fields/role overrides: [official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
Skill discovery: [official repository skills guidance](https://developers.openai.com/blog/skills-agents-sdk).
