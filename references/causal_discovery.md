# Candidate-Only Causal Discovery

Use `causal_discovery` / `discovery` for one bounded graph, local-neighborhood,
edge/path, feature-group or stability question that can inform the causal project.
Discovery is a hypothesis tool. It does not prove directions, validate adjustment
sets, choose the final design, estimate treatment effects or upgrade a claim.

Reviewing existing graph objects, edge tables, code or diagnostics may need no
new output. Scoping a future run is also a meaningful review when it resolves
the graph target, assumptions or feasibility. Do not create an artifact merely
to record verbal framing. A clear request with sufficient inputs may proceed
directly to a bounded run without another approval checkpoint.

## Method and Assumptions

Choose from the target, data structure and assumptions:

- PC/stable-PC, GES or score search for IID CPDAG/DAG exploration when causal
  sufficiency is plausible enough to state explicitly.
- FCI, RFCI, GFCI or PAG-style output when latent confounding is plausible.
- LiNGAM/DirectLiNGAM only with plausible non-Gaussian linear assumptions.
- PCMCI/PCMCI+/LPCMCI, VAR-LiNGAM or Granger-style screening for lagged structure
  with explicit sampling interval, lags, stationarity and temporal ordering.
- Local discovery, screening and stability selection for high-dimensional
  variable sets or bounded neighborhoods.

Optimization or neural DAG learners need explicit tuning, regularization,
stability checks and strong caveats; they are not causal authorities. Verify
installed availability and current package APIs before code execution.

Specify focal variables and their possible roles, temporal tiers, required and
forbidden edges, impossible directions, known interventions and background
constraints. Record whether the output is a DAG, CPDAG, PAG, lagged graph,
ranking, local neighborhood or stability table. Do not collapse equivalence
classes or uncertain orientations into confident causal arrows.

## Diagnostics and Output

For new computation or artifacts, load [runs.md](runs.md). Record a discovery
plan before running: objective and promised output, actual input files, variables,
named method/settings, required diagnostics and the `candidate_only` claim
boundary. State constraints in the method description and save exact configuration
and code. Do not substitute a different target or algorithm after an inconvenient
result without recording the change in a new run or explicit deviation.

Check the material sensitivities: tests/scores, alpha, seed, tuning, regularization,
lags, preprocessing, missingness handling and variable set. Use bootstrap,
subsampling, perturbation or multi-method stability when feasible. Check temporal
and domain constraints. Distinguish edge stability from orientation stability.
State the implications of hidden confounding, selection, non-IID observations,
measurement error, missingness, dimensionality and nonstationarity.

Label unperformed diagnostics as unperformed, not passed. Discovery and effect
estimation on the same data create post-selection inference risks. A stable edge
still does not establish valid adjustment or a causal effect.

Preserve graph objects, edge/stability tables, plots, diagnostics, code and
environment as relevant to the promised output. If a run fails, keep its state
and reason visible; a transient tool failure is not scientific infeasibility.
Review existing artifacts at their exact source rather than inventing a replacement.

## Handoff

Commit one review with sources, method, candidate findings, performed diagnostics,
limitations and what structural hypotheses were weakened or remain plausible.
Use language such as "compatible with", "candidate edge" or "unstable orientation".
New computed evidence points to the finalized run and manifested file.

When the result could affect adjustment, variable roles, estimand or claim strength,
return the concrete implication and its unresolved assumption to the lead. Do
not certify it or start a causal-check or estimation specialist in this turn.
