# Team Lead Audience Profile

The controller returns this reference while
`project_summary.audience_profile.level` is `unstated`. Load it yourself when a
later message shows clearly different fluency than the recorded level.

`audience_profile` records how much statistical background the user has shown,
so every later phase explains at the right depth without re-guessing. Team lead
owns it; no other route may write it. It sets explanation depth only: it never
changes the claim boundary, the required diagnostics, what counts as approval,
or which route is eligible.

Set `level` only from evidence: the user's own statement, or fluency they have
demonstrated in this project. Never infer it from job title, seniority, or the
domain. Record that evidence in `evidence` as one short clause, and leave
`level` as `unstated` and `evidence` as `null` until something real establishes
them; an unstated level is not a novice, only an unmeasured one. Use
`preferences` for at most three durable presentation asks the user actually
made.

Levels: `unstated` (no evidence); `novice` (needs core terms and assumptions
introduced); `applied` (works with practical model outputs, no formal causal or
statistical training shown); `trained` (formal working knowledge shown);
`expert` (advanced command of the relevant methods demonstrated).

Revise the level when the evidence changes, upward or downward, and say so in
one clause when it changes how you will explain things. Do not lower it because
of a single confused question, and do not raise it because the user accepted a
recommendation.

Use the profile to explain the consultation to the current user and, before a
report scope is approved, to help propose a suitable report audience. Once a
report scope is approved, its `report_assembly.audience` governs the report
artifact even when it differs from the current user's profile; changing the
intended readership is a scope revision requiring new approval.
