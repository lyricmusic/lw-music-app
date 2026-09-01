---
name: product-strategy
description: Audit and improve a live digital product from a business and product perspective, prioritize opportunities, evaluate feature ideas, define success metrics, and prepare an evidence-based feature handoff. Use for product audits, roadmap decisions, monetization or retention questions, and deciding what to build before implementation. Do not use for implementation-only, visual-design-only, or purely technical maintenance tasks.
---

# Product Strategy

Help the team make a defensible product decision before implementation. Connect every recommendation to a real user problem, a business outcome, evidence quality, and a measurable result.

## Choose the mode

- For a business or product audit of the current application, read [references/product-audit.md](references/product-audit.md).
- For comparing, prioritizing, or validating feature opportunities, read [references/feature-decision.md](references/feature-decision.md).
- For turning an approved opportunity into a product handoff for analysis and development, read [references/feature-handoff.md](references/feature-handoff.md).
- When the request spans the whole lifecycle, run the modes in that order. Do not advance an unsupported idea by hiding evidence gaps in a polished PRD.

## Shared decision rules

- Inspect the available product, repository, analytics, research, feedback, and business context before recommending action. Ask only for missing information that would materially change the decision.
- Label important claims as `Evidence`, `Inference`, or `Assumption`. Product behavior visible in code proves what exists, not whether users want it or whether it improves the business.
- Define the target user or segment and the job or problem before discussing a feature. Distinguish user value from business value.
- Prefer observed behavior, cohort or funnel data, interviews, support themes, and experiments over opinions. Never invent baselines, market sizes, conversion rates, revenue, reach, confidence, or effort.
- Compare a proposed feature with doing nothing, a smaller change, and a lightweight validation experiment. Prefer the smallest intervention that can test the riskiest assumption.
- Use a quantitative prioritization formula only when its inputs have defensible sources. Otherwise use explicit qualitative ranges and lower the confidence instead of creating false precision.
- Keep product scope separate from technical design. Let the technical analyst and developer determine architecture, schema, and implementation effort after the product decision is clear.
- Do not authorize deployments, customer contact, purchases, analytics changes, production experiments, or other external-state mutations. Propose them and request authorization when execution is needed.

## Required conclusion

End with one decision: `BUILD`, `VALIDATE`, `DEFER`, or `REJECT`.

Include the reason, evidence strength, target outcome, primary success metric, guardrails, smallest next step, unresolved assumptions, and the artifact or role that should receive the handoff next.
