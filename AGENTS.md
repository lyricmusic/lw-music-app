# Repository instructions

## Project-scoped agent skills

- The repository vendors its Codex skills under `.agents/skills`. Keep this directory tracked in Git so a fresh clone or pull receives the same skill instructions without a separate installation step.
- Codex may activate these skills implicitly when a task matches their descriptions. For deterministic use, invoke the required skill explicitly by name (for example, `$firebase-security-rules-auditor`). If newly pulled skills are not discovered, restart Codex.
- Use the following skills when their scope matches the task:
  - `firebase-firestore` for Firestore data modeling, queries, indexes, SDK integration, and security-rule-aware client work. This is the current upstream replacement for the former `firebase-firestore-standard` skill.
  - `firebase-security-rules-auditor` for a red-team review whenever `firestore.rules` or Firestore write behavior changes, before handing the work off.
  - `firebase-auth-basics` for Firebase Authentication, anonymous accounts, provider linking, custom-token flows, and auth-dependent rules.
  - `firebase-hosting-basics` for Firebase Hosting configuration, SPA rewrites, caching headers, preview channels, and hosting diagnostics. The repository deployment runbook and approval requirements still take precedence.
  - `vercel-react-best-practices` when writing, reviewing, refactoring, or performance-tuning React code.
  - `vercel-composition-patterns` when designing reusable React APIs, context providers, shared state, compound components, or React 19 component architecture.
  - `frontend-design` for new or changed UI. Adapt its design guidance to the established Syncly visual identity and the mandatory dark-purple, responsive requirements below.
  - `webapp-testing` for local browser-based verification, screenshots, console inspection, and multi-step UI smoke tests when the changed workflow warrants browser coverage.
- Repository instructions, the existing product design system, and explicit user requirements override generic skill guidance when they conflict.
- Treat the vendored skills as reviewed snapshots. Do not refresh or replace them from upstream unless the user requests an update; review any such update as a normal dependency change.
- Upstream sources are `firebase/agent-skills`, `vercel-labs/agent-skills`, and `anthropics/skills` on GitHub.

## UI and responsive design

- Make all new functionality responsive across mobile, tablet, and desktop layouts.
- Build all new or changed UI in the project's dark-purple color scheme.
- In any UI touched by the change, replace existing light background colors with the corresponding dark-purple background colors; do not retain or introduce light backgrounds.

## Firestore changes

- Treat client code and `firestore.rules` as a single change whenever a task adds, removes, or renames Firestore fields, documents, collections, or write operations.
- Before handing off such a change, verify that every new client write is allowed by `firestore.rules` and that removed or changed writes are no longer relying on the old schema.
- Compile and publish the updated rules to the configured Firebase project when the user has authorized deployment:

  ```powershell
  pnpm exec firebase deploy --only firestore:rules --project lwmusic-ffe83
  ```

- Firebase deployment changes external project state. If deployment was not explicitly authorized, request approval before running it.
- Do not describe a Firestore-backed feature as fully working while the client and deployed rules are out of sync. If rules cannot be published, clearly state that the feature may fail with `403 Missing or insufficient permissions` until deployment.
- After deployment, confirm that Firebase reports both successful rules compilation and release.
- For queue-related rule changes, run `pnpm verify:queue-rules` before deployment. It covers leaving while waiting, leaving with a next participant, and leaving as the last active participant.

## Verification

- Run TypeScript, ESLint, and the production build after application changes.
- For Firestore-related work, include the rules compilation/deployment result in the final handoff.

## Deployment runbook

- Before any dev or production deployment, read and follow `DEPLOYMENT.md`.
- Treat its environment mapping, verification order, explicit production flags,
  secret-handling rules, smoke tests, and post-deployment checks as mandatory.

## Git publishing

- When the user asks to upload or push the current changes without explicitly requesting a pull request, include all current working-tree changes, commit them, and push directly to `develop`.
- Do not create a pull request or a separate publishing branch unless the user explicitly requests one.

## Changelog posts

- When the user asks for a changelog, write it as a ready-to-publish Russian Telegram post for Syncly.
- Follow this structure: an emoji and a short benefit-led title; a concise introduction; numbered steps when the feature has a sequence; user-facing capabilities listed with `•`; important limitations or safeguards in plain language; and a final availability line with `https://syncly.lyricweb.ru` and an emoji.
- Return the finished Telegram post inside one plain-text fenced code block so the user can copy it in one action without losing line breaks or spacing.
- Put a blank line between the title, introduction, each logical list section, explanatory paragraphs, and the final availability line. Do not place commentary inside the copyable block.
- Keep paragraphs short, avoid developer jargon, implementation details, filenames, commit references, and test results unless the user explicitly requests them.
- Describe the practical value for listeners, guests, room owners, or moderators instead of merely enumerating technical changes.
- Use reactions and emojis more generously than in technical handoffs, while keeping the post readable and professional.
