# Artifact Output Policy

Load this reference only when a worker will create durable output. Existing-file
review alone does not create an artifact record.

## Worker Lifecycle

Use exactly one reserved artifact per output-producing operation:

1. Call `statectl reserve-artifact` before creating durable output. Request a
   meaningful file or directory name tied to the work, never a timestamp-only
   name. The controller returns an operation-unique final location under
   `output/` and a project-relative `temporary_path`.
2. Resolve `temporary_path` against the project root and write only to that
   absolute path. Do not write into an unrelated output folder or adopt an
   unreserved path.
3. Read the returned `operation_packet`. When `completion_protocol` is `1`, its
   requirements are the minimum work for a completion handoff. Validate each
   requirement against the actual code, settings, diagnostics, and output.
   Supplemental work is allowed when it stays within the route's authority and
   claim boundary; list it under `supplemental_work` rather than treating it as
   required coverage.
   A substituted estimator, weighting or support rule, diagnostic, promised
   output, or claim boundary leaves that requirement unmet; it is not
   supplemental work.
4. Validate the produced files. Files must open or parse, required code or
   notebooks must run, and every promised deliverable must exist in its promised
   rendered form. Source data does not substitute for a rendered figure, table,
   or document. Reports must contain their required content and boundary
   language; HTML reports must also have valid fragment targets and resolvable
   project-local links.
5. Submit the owner-scoped state patch and artifact through `statectl apply`.
   For completion protocol 1, use:

   ```json
   {
     "summary": "compact description",
     "artifact_role": "completion | infeasibility_evidence",
     "execution_receipt": {
       "contract_hash": "operation packet contract hash",
       "completed_requirements": ["requirement IDs"],
       "unmet_requirements": [],
       "supplemental_work": [],
       "evidence_files": ["output/project-relative-file"]
     }
   }
   ```

   A `completion` receipt lists every required ID under
   `completed_requirements` and none under `unmet_requirements`. An
   `infeasibility_evidence` receipt is valid only when work on the exact bound
   scope shows that its promised output cannot responsibly be produced. Keep
   the route `blocked`, preserve the scope, partition every required ID between
   the completed and unmet lists, and leave at least one unmet. This preserves
   useful evidence that the plan needs revision but does not count as the
   promised output. A tooling or execution failure alone is not infeasibility
   evidence; retry it or use the route's normal no-artifact handoff.

   Include at least one evidence file. Each path must exist inside the reserved
   output and appear in its final inventory. A protocol 0 operation, including
   a core artifact or
   migrated resumption, uses `artifact: {summary}`.

The controller derives manifest identity, timestamp, scope reference, frozen
discovery contract when applicable, and file inventory. It atomically publishes
the exact reserved temporary output and appends the artifact record. For newly
created output, persist and link only the returned `artifact_intent.location`;
separately identified input or historical paths remain governed by the active
route. Never store `temporary_path` or `manifest_path` in route-owned state.

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
