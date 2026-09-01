# Feature handoff

Use this mode after a `BUILD` decision or after validation has met its predefined threshold. Produce a compact product brief that the technical analyst can turn into an implementation plan.

## Product brief

Include:

1. Decision summary and evidence.
2. Target users, job, and problem statement.
3. User outcome and business outcome.
4. Goals, primary success metric, baseline status, target, and guardrails.
5. MVP scope and explicit non-goals.
6. User journeys and functional requirements stated as observable behavior.
7. Important states, permissions, edge cases, trust or moderation constraints, and accessibility expectations.
8. Measurement and experiment requirements, including events or cohorts that must be defined before release.
9. Rollout, rollback, and learning plan proportional to risk.
10. Open product questions and assumptions still requiring validation.

Write acceptance criteria that are testable without prescribing architecture. Separate product requirements from possible implementation ideas.

## Technical-analysis handoff

Ask the technical analyst to confirm:

- affected code paths and product flows;
- data, authorization, security-rule, integration, and migration impact;
- technical options and effort range;
- observability and test coverage needed for the success metrics and guardrails;
- risks that could change the product scope or invalidate the prioritization decision.

If technical findings materially change cost, risk, or achievable scope, return to feature decision instead of silently weakening the product outcome.
