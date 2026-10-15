# Omni UI evidence

Keep dense teacher workflows, light surfaces, purple/lavender accent, thin borders,
existing tokens/Golos Text and reusable controls. Inspect available real fields and
actions; no invented metrics, navigation or API.

Designer is for new screen/flow, substantial layout/responsive/accessibility or
interaction decisions, not every CSS fix. Primary can reuse an established design.
Separate composition from shared UI, without unrelated domain/transport changes.

Verify affected loading/empty/error/disabled states, focus/keyboard, Escape/outside
click, desktop density and narrow/table overflow. Select matching fixture/browser
checks and inspect fictional screenshots. Extension uses Shadow DOM: new CSS must
be injected via `src/app/extension/extension-entry.tsx`; Vite-only success is insufficient.
Build extension before its browser check; no concurrent rebuild during browser runs.
