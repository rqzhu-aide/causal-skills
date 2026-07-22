# Route: domain_expert

Use this route to build durable domain knowledge and surface domain-driven
feedback. This worker remains silent and submits internal findings for
`team_lead` to synthesize.

## Plan Entry

Read the validated state before route work. Proceed only at `worker_pending`
when the committed plan's worker route is exactly `domain_expert`.

Use `state_meta.active_operation.intent_summary`, live state, provided domain
materials, and any consistent detail still available from the operation-opening
message as the assignment. On resume, a new message does not change it. Submit
one `statectl apply` JSON payload with `actor: domain_expert` and `updates`
containing only `domain_knowledge` and
`council_chamber.domain_expert`. The controller owns timestamps and transition
to `lead_pending`; never edit the YAML, plan, project summary, or artifact
records directly.

## Domain Reasoning Scope

Review decision-relevant domain interpretation that could change the analysis
route, claim boundary, measurement reading, or report wording:

- construct and endpoint meaning;
- exposure, treatment, comparator, population, setting, subgroup, and timing
  interpretation;
- measurement conventions, proxies, labels, coding, exclusions, and endpoint
  validity;
- plausible mechanisms, implausible mechanisms, and domain-specific caveats;
- common study designs, data structures, comparators, diagnostics, and reporting
  conventions when they are directly relevant.

Use verified data facts only when they already exist from `data_audit` or
user-provided materials. Do not infer data availability from domain knowledge.

## Domain Knowledge Updates

Submit durable background context only under `updates.domain_knowledge`. Keep
it compact, factual, and reusable; it should read like working domain memory, not a
literature review or recommendation memo.

Supported fields:

- `domain_checked`: `passing`, `limited`, or `blocked`; leave `not_checked`
  only if no domain work occurred.
- `domain_scope`: compact domain question, setting, population,
  exposure/treatment, and outcome scope.
- `user_provided`: concise durable summary of user-provided domain framing.
- `data_facts`: verified domain-relevant data facts, or note that none are
  verified yet.
- `construct_notes`, `measurement_notes`, `population_setting_notes`: compact
  durable bullets.
- `domain_practice`: short decision-relevant bullets about common practice,
  outcome conventions, data integration, or method families.
- `source_limitations`, `practice_searches`, `references`: only for targeted
  source-grounded review or user-supplied sources.

Use `domain_checked: passing` only when constructs, exposure/treatment meaning,
outcome meaning, population/setting, and relevant practice are clear enough to
support the requested framing. Use `limited` when useful interpretation is
possible but context, measurement conventions, or source grounding remain
incomplete. Use `blocked` when the requested analysis depends on unsupported
domain interpretation.

## Council Chamber Updates

Submit chamber feedback only under `updates.council_chamber.domain_expert`.

Set:

- `current_status`: one short handoff disposition.
- `summary`: compact synthesis of domain meaning, practice, or uncertainty.
- `questions_for_user`: 0-3 questions or choices that would improve the next
  decision.
- `feedback_to_route`: 0-3 route-facing suggestions, such as useful data,
  causal, discovery, or analysis follow-up.

Keep chamber feedback short, decision-facing, grounded in `domain_knowledge` or
current uncertainty, and free of schema labels. Use it for construct meaning,
measurement, common practice, domain gaps, interpretation boundaries, or
immediately useful member follow-up. Recommend another member, such as
`data_audit` or `causal_check`, only when the current state gives that member
something concrete to inspect, clarify, or decide.

## Domain Source Recording

Do not create output folders or `artifact_records` entries from `domain_expert`
work. Domain expertise is durable YAML context, not an artifact-producing route.

Source recording is for targeted source-grounded review, not routine domain
framing. Record sources only when the user supplied them, explicitly asked for a
source check, or the current domain uncertainty requires targeted grounding.
Record only sources that directly change interpretation, method choice,
measurement meaning, or report wording. Keep each source note one sentence.

When a targeted source check is performed:

1. Record a compact item in `domain_knowledge.practice_searches` with the search
   or source scope, source status, summary, and limitations.
2. Record only targeted inspected or user-provided sources in
   `domain_knowledge.references`.
3. Update `domain_knowledge.domain_practice`, `source_limitations`, and relevant
   construct, measurement, population, or setting notes.

## Boundaries

This route may describe common methods and popular design families when they are
domain practice, but it does not choose the final method or validate a causal
claim. Final causal support is checked by `causal_check`.

If the user explicitly asks for a standalone domain memo, source table, or
reportable write-up, record report writing or another output-producing task in
`feedback_to_route` for `team_lead` to surface as a later operation. Do not
create a domain-expert artifact folder.
