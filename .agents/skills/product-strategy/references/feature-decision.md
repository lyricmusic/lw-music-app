# Feature decision

Use this mode to decide whether and how a product opportunity should move forward.

## Frame the opportunity

State the target segment, job or pain, current workaround, desired behavior change, business outcome, and evidence. Reframe solution-shaped requests into an opportunity statement before scoring them.

Define the riskiest assumptions across desirability, viability, usability, feasibility, trust, and measurement. Technical feasibility and effort must come from repository evidence or the technical analyst, not product guesswork.

## Select a decision method

Choose the lightest method supported by the evidence:

- Use RICE when reach, impact, confidence, and effort inputs have defensible sources.
- Use ICE for early hypotheses when reach and effort are still rough, and label it as directional.
- Use Kano when evidence distinguishes basic expectations, performance needs, and delighters.
- Use Jobs-to-be-Done or opportunity scoring when the problem space is still being discovered.
- Use ROI or payback analysis when credible revenue, cost, and timing inputs exist.
- Use a qualitative matrix of user impact, business impact, confidence, effort, risk, and strategic fit when numeric inputs would be fictional.

Show the inputs and explain uncertainty. A high score cannot compensate for missing problem evidence or an unmeasurable outcome.

## Compare options

Compare at least:

1. Do nothing now.
2. Run a discovery or measurement step.
3. Make the smallest product or operational change.
4. Build the proposed feature or a thinner MVP.

Identify non-feature alternatives such as clearer onboarding, policy, content, pricing, instrumentation, or operational changes when they address the same outcome more cheaply.

## Decision output

Return:

- decision: `BUILD`, `VALIDATE`, `DEFER`, or `REJECT`;
- opportunity and target segment;
- user and business outcomes;
- evidence, assumptions, and confidence;
- comparison of alternatives;
- prioritization method and transparent inputs;
- primary metric, guardrail metrics, baseline status, and target or target-setting plan;
- MVP boundary and explicit non-goals when the decision is `BUILD`;
- validation experiment and stop rule when the decision is `VALIDATE`;
- conditions for reconsideration when the decision is `DEFER` or `REJECT`.

Advance to the feature handoff only after the decision and evidence gaps are visible.
