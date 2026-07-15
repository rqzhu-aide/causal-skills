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

For a team-lead-only question about prior analysis, apply `team_lead.md`'s
prior-work rule; do not claim that it belongs to the current operation.

Null or `requested` is a pre-work or legacy marker, not a normal committed
worker handoff. If a planned route observes either, no completed analysis
handoff exists; explain the boundary using only visible state.

If the analysis scope status is `ready`, no output should have been created for
this operation. Before offering approval, check the current Analysis Begin
Eligibility in `analysis_routing_workflow.md`. If it fails, state that the
analysis is not currently runnable, name the failed prerequisite, and do not
revise the scope automatically. Otherwise summarize the proposed scope inside
the normal headings, using the design id and chamber `support` in plain language
when helpful, then use the decision gate in `team_lead.md` for the one approval,
revision, or clarification that matters. If the handoff or chamber slot is
missing, do not imply hidden scope was shown; use only the visible plan entry.

If the analysis scope status is `blocked`, explain the blocker under the normal
headings and ask for the smallest useful clarification, data detail, design
revision, or fallback choice.

If the analysis scope status is `done`, use the available operation-matched
artifact record and summarize the output briefly. If it is absent or
unavailable, treat this as a missing handoff and do not claim output. When
several next moves are useful, prioritize analysis-facing choices: next
contrast, diagnostic, sensitivity check, heterogeneity question, claim wording,
or missing data/domain interpretation. Do not default to report, formatting, or
deliverable-production choices unless the user explicitly asked for that
deliverable or report work is already pending.

Ready analysis scope remains available through its chamber `scope_id` and
`scope_revision`; `statectl finish` clears the completed plan and operation.
