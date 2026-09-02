# Team Lead Carried Questions

The controller returns this reference when the ledger has open questions or the
current handoff raised `questions_for_user`. Load it yourself when team-lead
synthesis identifies a material fact only the user can supply.

## What Belongs In The Ledger

A carried question is a durable `carried_questions` entry whose answer could
change the design, scope, method, or claim boundary, and that the user is
unlikely to volunteer unprompted: availability of further data, the real
meaning of a coded field, which decision the evidence must serve, the effect
size that would change the user's mind. A preference the user already stated,
and anything the data or a route can settle without them, is not a carried
question. Candidates come from a route's `questions_for_user` or from team-lead
synthesis across committed evidence; team lead decides what is material.

## Acting Through `question_actions`

`turn_context.directives` lists what the ledger needs this turn: handoff
questions to record, overdue questions to surface or retire, surfaced questions
awaiting an answer, and a summary of open entries. Act on each directive;
omitting an open question from `question_actions` holds it unchanged.

- `record`: use the exact committed `questions_for_user` text when the question
  comes from the current handoff; otherwise supply one concise canonical
  `source_text`. Reuse an existing `question_id` when a later operation raises
  the same material question; use `null` only for a genuinely distinct one. Set
  `surface: true` to record and ask atomically.
- `surface`: a later standalone surface uses the existing ID.
- `retire`: `resolution.kind` is `answered`, `immaterial`, or `unavailable`,
  with a short evidence-based `note`.

The controller owns identity, provenance, recurrence counts, and lifecycle
fields, verifies that a surfaced question appears verbatim in the rendered
presentation, and rejects fabricated history. A migrated source may carry
`source_kind: legacy_v8` with `source_text: null`; never reconstruct missing
wording.

## Surfacing

Surface at most one question per turn: the one whose answer would change the
most. Ask for the fact, not for a method or estimator, and say in the same
breath what changes if the answer goes each way. With no options, append it to
`next_steps` after the approval or follow-on question, in the same single line;
with options, put it in `framing`. Use the canonical text verbatim so the
controller can verify it was rendered.

A material question must not decay silently into a limitation. Report it as a
limitation only after it was surfaced and left unanswered, or when the user
cannot be expected to resolve it. An overdue question (recorded by two or more
operations, never surfaced) must be surfaced or explicitly retired.

## After Retirement

Retirement closes the workflow, not the fact: later phases still receive a
compact content-only record of the resolution, so an answer can be used and an
unavailable fact can be preserved as a limitation. `immaterial` tells later
routes not to spend work on it under the current objective. When a question
stays unanswered and work must proceed, convert it into an explicit, named
construct rather than a silent assumption: run the alternative as a sensitivity
check, hold the weaker wording both answers support, or record it as a stated
limitation on the claim.
