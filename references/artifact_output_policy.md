# Artifact Output Policy

Load this reference only when a worker will create durable output. Existing-file
review alone does not create an artifact record.

## Worker Lifecycle

Use exactly one reserved artifact per output-producing operation:

1. Inspect the active capsule before reserving. If
   `turn_context.operation.artifact_intent` and
   `turn_context.artifact_status.temporary_path` are present, use that exact
   reservation and do not call `reserve-artifact` again. Exact approved
   analysis and report execution should normally receive this reservation from
   `begin`. If no reservation exists, call `statectl reserve-artifact` before
   creating durable output, passing the `operation_id`, `kind` (`file` or
   `directory`), a meaningful `slug`, and an `extension` only for a file.
   Include `discovery_scope` when that route must freeze a new or revised
   discovery contract; this discovery reservation remains a worker-stage call.
   The controller returns an operation-unique final location under `output/`
   and a project-relative `temporary_path`.
2. Resolve `temporary_path` against the project root and write only to that
   absolute path. Do not write into an unrelated output folder or adopt an
   unreserved path.
3. Use the returned full `operation_packet`, or reuse the prior packet's
   immutable contract when `operation_packet_ref.contract_unchanged` is `true`
   and its operation ID, protocol, and hash match. Take current stage and action
   from the reference or `turn_context`. When `completion_protocol` is `1` or
   `2`, its
   requirements are the minimum work for a completion handoff. Validate each
   requirement against the actual code, settings, diagnostics, and output.
   Supplemental work is allowed when it stays within the route's authority and
   claim boundary; list it under `supplemental_work` rather than treating it as
   required coverage.
   A substituted estimator, weighting or support rule, diagnostic, promised
   output, or claim boundary leaves that requirement unmet; it is not
   supplemental work.
   Plan one reproducible execution pass that covers the complete frozen
   contract. Reuse unchanged verified inputs, evidence, and references instead
   of repeating unaffected work. If data, code, settings, assumptions, scope,
   or dependent results change, rerun and revalidate every affected component.
4. Validate the produced files. Files must open or parse, required code or
   notebooks must run, and every promised deliverable must exist in its promised
   rendered form. Source data does not substitute for a rendered figure, table,
   or document. Reports must contain their required content and boundary
   language; HTML reports must also have valid fragment targets and resolvable
   project-local links.
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

   New protocol-2 output uses artifact manifest schema 3. Its manifest stores
   the exact ordered operation-packet `requirements`, including each ID, kind,
   and description, so its evidence remains interpretable after a later scope
   revision. Its `requirement_evidence` must
   contain exactly one object for every ID in `completed_requirements`, with no
   unknown, unmet, or duplicate ID. Each object contains exactly
   `requirement_id`, `file`, and `locator`. `file` is a canonical
   project-relative output path present in both `evidence_files` and the final
   manifest inventory. `locator` is a trimmed, nonempty, single-line anchor no
   longer than 500 characters. Point to the narrowest useful section, table,
   object, function, or code location that lets the lead inspect the claimed
   implementation. The controller validates coverage, paths, and shape, not
   scientific meaning.

   `deviations` is a list of unique, trimmed, nonempty, single-line descriptions
   of departures from the frozen implementation, output, or claim boundary,
   with at most 20 items and 500 characters per item. Use `[]` when none. A
   disclosed deviation does not make an unmet requirement complete or authorize
   a scope change.

   A `completion` receipt lists every required ID under
   `completed_requirements` and none under `unmet_requirements`. An
   `infeasibility_evidence` receipt is valid only when work on the exact bound
   scope shows that its promised output cannot responsibly be produced. Keep
   the route `blocked`, preserve the scope, partition every required ID between
   the completed and unmet lists, map only its completed requirements in
   `requirement_evidence`, and leave at least one unmet. This preserves useful
   evidence that the plan needs revision but does not count as the promised
   output. A tooling or execution failure alone is not infeasibility evidence;
   retry it or use the route's normal no-artifact handoff.

   Include at least one evidence file. Each path must exist inside the reserved
   output and appear in its final inventory. A protocol-1 migrated recovery
   still requires an execution receipt. Reuse the exact schema-2 receipt when a
   completed historical manifest exposes one. If publication remains
   incomplete, inspect the preserved output and submit the full receipt shape
   above; the controller records it as schema 3. A protocol-0 operation,
   including migrated protocol-0 core work, uses `artifact: {summary}`.

The controller derives manifest identity, timestamp, scope reference, frozen
discovery contract when applicable, and file inventory. It atomically publishes
the exact reserved temporary output and appends the artifact record. For newly
created output, persist and link only the returned `artifact_intent.location`;
separately identified input or historical paths remain governed by the active
route. Never store `temporary_path` or `manifest_path` in route-owned state.
Historical schema-1 and schema-2 manifests remain valid for recovery and reuse;
do not rewrite them merely to add schema-3 receipt fields.

If `apply` fails or is interrupted, reopen the state and follow its artifact
status. Reuse valid output only at the exact reserved temporary or final path.
When a completed final artifact is reported, read and reuse its exact manifest
`summary`, `artifact_role`, and `execution_receipt` in the retry. Do not
regenerate successfully completed output or scan for, adopt, delete, or replace
another path.

Never append, replace, or timestamp `artifact_records` directly. Put detailed
diagnostics in output files and route-owned state, not in the compact artifact
summary.

Do not reserve or submit an artifact for scope preparation, readiness review,
planning feedback, verbal-only work, or inspection that created no new durable
output. Historical artifacts reported as unavailable or incomplete are not
evidence; do not recreate, scan for, or silently substitute them.

Apply the active route's route-specific recording requirements; this policy
defines only the shared artifact lifecycle. The controller derives aggregate
output flags only from `completion` artifact records.
