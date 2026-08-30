# Legacy Evidence And Migrated Protocols

Load this reference only when the controller returns it (the active operation
uses migrated completion protocol 1) or when a closeout must interpret a
historical schema-1, schema-2, or schema-3 artifact manifest.

## Protocol-1 Worker Recovery

A protocol-1 operation is a migrated legacy operation recovered mid-flight. It
still requires a full execution receipt on completion:

- When a completed historical manifest exposes an exact schema-2 receipt,
  reuse that receipt unchanged in the retry.
- If publication remains incomplete, inspect the preserved reserved output and
  submit the full protocol-2 receipt shape from
  `references/artifact_output_policy.md`; the controller records it as
  schema 3.
- A protocol-0 operation, including migrated protocol-0 core work, uses
  `artifact: {summary}` as normal; it does not need this reference.

## Historical Manifest Review

Interpret historical output at its own evidence boundary; never rewrite old
manifests merely to add schema-3 receipt fields.

- Schema-3 manifests persist the exact ordered operation-packet
  `requirements`, so their `requirement_evidence` stays interpretable after a
  later scope revision: compare using the manifest's persisted requirement
  descriptions with that mapping.
- Schema-1 and schema-2 manifests remain valid for recovery and reuse, but
  they cannot prove requirement-level implementation. State the narrower
  historical evidence boundary rather than inventing verification, and do not
  claim `exactly` or `every requirement` from them.
- A migrated ready analysis slot may carry a null contract and causal basis.
  Preserve it as prior scope context, but revise it before new approval or
  execution. A pre-migration operation already bound to that scope may still
  resume under its legacy completion protocol.
