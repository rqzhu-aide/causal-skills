# Artifact Output Policy

Load this reference only when a worker will create durable output. Existing-file
review alone does not create an artifact record.

## Worker Lifecycle

Use exactly one reserved artifact per output-producing operation:

1. Call `statectl reserve-artifact` before creating durable output. Request a
   meaningful file or directory name tied to the work, never a timestamp-only
   name. The controller returns an operation-unique
   `artifact_intent.location` directly under `output/`, a project-relative
   `temporary_path`, and `manifest_path`.
2. Write only to `temporary_path`. Do not write into an unrelated output folder
   or adopt an unreserved path.
3. Validate the output against the persisted assignment and approved scope
   before publication. Files must open or parse, required tables, figures, and
   diagnostics must exist, and required code or notebooks must run. Reports
   must render with their required content and boundary language; HTML reports
   must also have valid fragment targets and resolvable project-local links.
   If validation fails, correct the temporary output and revalidate within the
   same operation when possible. Do not publish, create the completion manifest,
   submit the artifact, or mark the route done unless validation passes. If
   validation cannot be completed, return the route's normal incomplete or
   blocked handoff.
4. Prepare the completion manifest using the exact shape below. `route` is
   `analysis_execution` for every design route; `files` contains
   project-relative final-output paths. Do not add design-specific fields or
   change controller-issued identity fields.

   ```json
   {
     "schema_version": 1,
     "operation_id": "<active operation UUID>",
     "route": "<artifact route>",
     "scope_ref": null,
     "files": ["<project-relative output path>"],
     "completed_at": "<RFC3339 UTC>",
     "summary": "<compact evidence and limitation summary>"
   }
   ```

   For approved analysis or report output, replace `null` with the exact active
   `{kind, id, revision}` scope object.
5. Publish by artifact kind:
   - For a directory, write and validate `artifact-manifest.json` inside the
     temporary directory, then atomically move that directory to
     `artifact_intent.location`.
   - For a file, atomically move the validated file to
     `artifact_intent.location`, then atomically install the manifest at
     `manifest_path` through a same-directory temporary file.
6. Submit the owner-scoped state patch and matching `artifact: {summary}`
   through `statectl apply`. The controller verifies the reservation, final
   location, manifest, and summary before recording the artifact.

If output succeeds but `apply` fails, preserve the completed output and
manifest. On resume, reuse them only when the controller reports that they match
the active operation; correct and retry the patch without regenerating output.

If interruption leaves the exact active operation's reserved final location
without a manifest, inspect only that location. Complete its manifest only after
the output validates against the persisted assignment; otherwise leave it
unrecorded and report the blocker through the worker handoff. Never scan for,
adopt, delete, or replace another path.

Never append, replace, or timestamp `artifact_records` directly. A successful
controller append has this identity-bearing form:

```yaml
- artifact_id: <controller UUID>
  operation_id: <active operation UUID>
  route: data_audit | causal_discovery | analysis_execution | report_writer
  location: output/<reserved name>
  created_at: <RFC3339 UTC>
  summary: <compact evidence and limitation summary>
```

The controller may add route-specific `design` and `support` fields for
analysis. Put individual file paths in manifest `files`; put detailed
diagnostics in output files and route-owned state, not in the artifact record or
as extra manifest fields.

Do not reserve or submit an artifact for scope preparation, readiness review,
planning feedback, verbal-only work, or inspection that created no new durable
output. Historical artifacts reported as unavailable or incomplete are not
evidence; do not recreate, scan for, or silently substitute them.

Apply the active route's route-specific recording requirements; this policy
defines only the shared artifact lifecycle. The controller derives aggregate
output flags from completed artifact records.
