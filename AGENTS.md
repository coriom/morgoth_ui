# AGENTS.md — Codex Behavior Instructions for Morgoth UI

Read this file AND SPEC_UI.md before touching any code.

## Identity & Context
You are building the Morgoth UI, a Next.js 14 frontend.
SPEC_UI.md is your single source of truth.
The backend API runs on http://localhost:8000.

## Rules
- TypeScript strict mode throughout
- Tailwind only for styling, no inline styles
- No hardcoded URLs — use .env.local variables
- Dark mode only
- Never use localStorage or sessionStorage
- Follow design system in SPEC_UI.md section 3 exactly
- Update PROGRESS.md after each completed file

## What NOT to do
- Never create separate CSS files — styles in components only
- Never use default exports for components — named exports only
- Never hardcode colors — use Tailwind classes from the design system
- Never use useState for global state — use Zustand stores
- Never fetch data directly in components — use TanStack Query hooks
