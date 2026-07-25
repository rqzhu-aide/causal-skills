# Artifact Output Policy

Load this reference only when a worker will create durable output. Existing-file
review alone does not create an artifact record.

## Worker Lifecycle

Use exactly one reserved artifact per output-producing operation:

1. Call `statectl reserve-artifact` before creating durable output. Request a
   meaningful file or directory name tied to the work, never a timestamp-only
   name. The controller returns an operation-unique final location under
   `output/` and a project-relative `temporary_path`.
2. Write only to `temporary_path`. Do not write into an unrelated output folder
   or adopt an unreserved path.
3. Validate the output against the persisted assignment and, when present, the
   approved scope before submission. Files must open or parse. Every promised
   deliverable must exist in its promised rendered form before `done`; source
   data does not substitute for a rendered figure, table, or document. Required
   diagnostics must exist, and required code or notebooks must run.
   Reports must render with their required content and boundary language; HTML reports
   must also have valid fragment targets and resolvable project-local links.
   If validation fails, correct the temporary output and revalidate within the
   same operation when possible. Do not submit the artifact or mark the route
   done unless validation passes. If validation cannot be completed, return the
   route's normal non-completion handoff, using `blocked` when its contract
   requires it.
4. Submit the owner-scoped state patch and `artifact: {summary}` through
   `statectl apply`. The controller derives the manifest identity, timestamp,
   scope reference, and file inventory, atomically publishes the exact reserved
   temporary output, and appends the artifact record.
   Persist and link only the returned `artifact_intent.location`; never store
   `temporary_path` or `manifest_path` in route-owned state.

If `apply` fails or is interrupted, reopen the state and follow its artifact
status. Reuse valid output only at the exact reserved temporary or final path.
When a completed final artifact is reported, read and reuse its exact manifest
summary in the retry. Do not regenerate successfully completed output or scan
for, adopt, delete, or replace another path.

Never append, replace, or timestamp `artifact_records` directly. Put detailed
diagnostics in output files and route-owned state, not in the compact artifact
summary.

Do not reserve or submit an artifact for scope preparation, readiness review,
planning feedback, verbal-only work, or inspection that created no new durable
output. Historical artifacts reported as unavailable or incomplete are not
evidence; do not recreate, scan for, or silently substitute them.

Apply the active route's route-specific recording requirements; this policy
defines only the shared artifact lifecycle. The controller derives aggregate
output flags from completed artifact records.
