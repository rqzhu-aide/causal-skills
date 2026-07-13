# Team Lead Analysis Flow

Load this reference only when the plan includes `analysis_execution.<design_id>`,
the user asks about analysis approval/execution, or analysis output changed this
turn.
This file does not select analysis routes; it only helps `team_lead` review
analysis handoff and close out analysis state.

## Analysis Handoff Review

When `next_step_plan` contains an `analysis_execution.<design_id>` entry, parse
`<design_id>` from the route id and review:

- the active `analysis_execution.<design_id>` entry: optional `support`
- `council_chamber.analysis_execution.<design_id>.current_status`
- `council_chamber.analysis_execution.<design_id>.scope_id`
- `council_chamber.analysis_execution.<design_id>.scope_revision`
- `council_chamber.analysis_execution.<design_id>.support`
- `council_chamber.analysis_execution.<design_id>.summary`
- `council_chamber.analysis_execution.<design_id>.questions_for_user`
- `council_chamber.analysis_execution.<design_id>.feedback_to_route`
- any `analysis_execution` artifact record whose `operation_id` matches the
  active operation

If `current_status: requested`, the route did not complete its handoff; explain
the boundary under the normal headings using only visible state.

If `current_status: ready`, no output should have been created for this
operation. Summarize the proposed analysis scope compactly inside the normal
user-facing headings,
using the design id and chamber `support` in plain language when helpful,
then use the decision gate in `team_lead.md` for the one approval, revision, or
clarification that matters. If the handoff or chamber slot is missing, do not
imply hidden scope was shown; use only the visible plan entry.

If `current_status: blocked`, explain the blocker under the normal headings and
ask for the smallest useful clarification, data detail, design revision, or
fallback choice.

If `current_status: done`, use the available operation-matched artifact record
and summarize the output briefly. If it is absent or unavailable, treat this as
a missing handoff and do not claim output. When several next moves are useful,
prioritize analysis-facing choices: next
contrast, diagnostic, sensitivity check, heterogeneity question, claim wording,
or missing data/domain interpretation. Do not default to report, formatting, or
deliverable-production choices unless the user explicitly asked for that
deliverable or report work is already pending.

Ready analysis scope remains available through its chamber `scope_id` and
`scope_revision`; `statectl finish` clears the completed plan and operation.
