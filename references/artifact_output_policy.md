# Artifact Output Policy

Load this reference only when a worker will create durable output; the
controller returns it whenever output is already authorized. Existing-file
review alone does not create an artifact record.

## Worker Lifecycle

Use exactly one reserved artifact per output-producing operation:

1. Inspect the active capsule before reserving. If
   `turn_context.operation.artifact_intent` and
   `turn_context.artifact_status.temporary_path` are present, use that exact
   reservation and do not call `reserve-artifact` again. If no reservation
   exists, call `statectl reserve-artifact` before creating durable output,
   with the `operation_id`, `kind` (`file` or `directory`), a meaningful
   `slug`, and an `extension` only for a file. Include `discovery_scope` when
   that route must freeze a new or revised discovery contract. The controller
   returns an operation-unique final location under `output/` and a
   project-relative `temporary_path`.
2. Resolve `temporary_path` against the project root and write only to that
   absolute path. Never write into an unrelated output folder or adopt an
   unreserved path.
3. Use the returned full `operation_packet`, or reuse the prior packet's
   immutable contract when `operation_packet_ref.contract_unchanged` is `true`
   and its operation ID, protocol, and hash match; take the current stage and
   action from that reference or `turn_context`. When `completion_protocol`
   is `1` or `2`, its requirements are the minimum work for a completion
   handoff; validate each against the actual code, settings, diagnostics, and
   output. Supplemental work is allowed within the route's authority and claim
   boundary; list it under `supplemental_work`. A substituted estimator,
   weighting or support rule, diagnostic, promised output, or claim boundary
   leaves that requirement unmet; it is not supplemental work.
   Plan one reproducible execution pass that covers the complete frozen
   contract. Reuse unchanged verified inputs, evidence, and references instead
   of repeating unaffected work; if data, code, settings, assumptions, scope,
   or dependent results change, rerun and revalidate every affected component.
4. Validate the produced files. Files must open or parse, required code or
   notebooks must run, and every promised deliverable must exist in its
   promised rendered form; source data does not substitute for a rendered
   figure, table, or document. Reports must contain their required content and
   boundary language, with valid fragment targets and resolvable project-local
   links in HTML.
5. Submit the owner-scoped state patch and artifact through `statectl apply`.
   For current completion protocol 2, use:

   ```json
   {
     "summary": "compact description",
     "artifact_role": "completion | infeasibility_evidence",
     "execution_receipt": {
       "contract_hash": "operation packet contract hash",
       "completed_requirements": ["requirement IDs"],
       "unmet_requirements": [],
       "supplemental_work": [],
       "evidence_files": ["output/project-relative-file"],
       "requirement_evidence": [
         {
           "requirement_id": "requirement ID",
           "file": "output/project-relative-file",
           "locator": "concise section, object, or code anchor"
         }
       ],
       "deviations": []
     }
   }
   ```

   `requirement_evidence` maps every completed requirement to an evidence file
   present in the reserved output, with a locator pointing to the narrowest
   useful section, table, object, or code location the lead can inspect.
   `deviations` lists disclosed departures from the frozen implementation,
   output, or claim boundary; a disclosed deviation does not make an unmet
   requirement complete or authorize a scope change. Include at least one
   evidence file. The controller validates coverage, paths, and shape with
   precise errors, not scientific meaning.

   A `completion` receipt lists every required ID under
   `completed_requirements` and none under `unmet_requirements`. An
   `infeasibility_evidence` receipt is valid only when work on the exact bound
   scope shows that its promised output cannot responsibly be produced: keep
   the route `blocked`, preserve the scope, partition every required ID
   between the completed and unmet lists (at least one unmet), and map only
   completed requirements. This preserves evidence that the plan needs
   revision without counting as the promised output. A package, tool, or
   transient failure is not infeasibility evidence; retry it or use the
   route's normal no-artifact handoff.

   A protocol-0 operation, including migrated protocol-0 core work, uses
   `artifact: {summary}`. For a migrated protocol-1 operation or historical
   schema-1/2 manifests, follow `references/legacy_evidence.md`.

The controller derives manifest identity, timestamp, scope reference, frozen
discovery contract when applicable, and file inventory, then atomically
publishes the exact reserved temporary output and appends the artifact record.
For newly created output, persist and link only the returned
`artifact_intent.location`; never store `temporary_path` or `manifest_path` in
route-owned state.

If `apply` fails or is interrupted, reopen the state and follow its artifact
status. Reuse valid output only at the exact reserved temporary or final path;
when a completed final artifact is reported, read and reuse its exact manifest
`summary`, `artifact_role`, and `execution_receipt` in the retry. Do not
regenerate successfully completed output or scan for, adopt, delete, or
replace another path.

Never append, replace, or timestamp `artifact_records` directly. Put detailed
diagnostics in output files and route-owned state, not in the compact artifact
summary. Do not reserve or submit an artifact for scope preparation, readiness
review, planning feedback, verbal-only work, or inspection that created no new
durable output. Historical artifacts reported as unavailable or incomplete are
not evidence; do not recreate, scan for, or silently substitute them.

Apply the active route's route-specific recording requirements; this policy
defines only the shared artifact lifecycle. The controller derives aggregate
output flags only from `completion` artifact records.
