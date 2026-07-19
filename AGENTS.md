# Repository instructions

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
