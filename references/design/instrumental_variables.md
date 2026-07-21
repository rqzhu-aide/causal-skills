# Design: instrumental_variables

Use this file to plan or review an instrumental-variables analysis: encouragement, lottery, assignment-as-instrument, noncompliance, fuzzy RD, judge/provider/distance/preference instruments, LATE/CACE, Wald ratios, 2SLS, LIML, control functions, weak instruments, overidentification, IV-DML, Mendelian randomization, or IV report support.

This design route is the accountable owner for whether analysis execution remains consistent with the IV design. Support routes may add analytic tools, but they must stay inside this design scope.

Work in this order: define the instrument source, treatment/exposure moved by the instrument, timing, relevance, independence, exclusion, monotonicity/complier logic, measurement level, inference route, then claim boundary. Do not let first-stage strength or software hide a weak exclusion story.

Runtime contract: follow `references/design_execution_contract.md` using design
id `instrumental_variables`. Keep any named support route inside this IV design
scope.

## Use When

Use when the project has, or may have:

- an instrument-like source of variation: lottery, encouragement, assignment, eligibility, distance, provider preference, judge leniency, policy rule, genetic variant, or polygenic score
- noncompliance, uptake, receipt, treatment choice, or exposure moved by an instrument
- a question about LATE, CACE, first stage, exclusion, monotonicity, weak-IV inference, fuzzy RD, MR, IV-DML, or local/complier-specific effects

Do not use merely because a variable predicts treatment. If the candidate instrument is just an observed covariate or proxy for access, severity, geography, provider quality, preference, or baseline risk, treat IV as blocked until the validity story is repaired.

## Data Contract

Before analysis, build or specify an IV-ready dataset. Minimum facts:

- instrument source, timing, units, assignment mechanism, and domain story
- treatment/exposure moved by the instrument, including receipt, dose, biomarker, behavior, or service use
- outcome and follow-up timing after instrument and treatment/exposure
- covariates measured before instrument and not post-instrument/post-treatment controls
- first-stage evidence and whether relevance is strong enough for the intended analysis
- independence/as-if-randomness or conditional independence rationale
- exclusion restriction: plausible direct paths, alternate treatments, resources, information, spillovers, or biological pleiotropy
- monotonicity/no-defier or equivalent local-effect logic when LATE/CACE is claimed
- measurement compatibility across instrument, treatment, outcome, clusters, compliance, and windows
- weak-instrument, many-instrument, overidentification, clustering, fixed-effect, heteroskedasticity, and selected-sample issues
- MR-specific facts when relevant: allele harmonization, LD, ancestry, sample overlap, variant-exposure relevance, population stratification, pleiotropy, and exposure/outcome source compatibility

Facts that usually must be inspected, not merely assumed: instrument timing, first stage, reduced form, covariate balance, exclusion paths, local/complier interpretation, weak-IV diagnostics, and MR harmonization/sensitivity when applicable.

## Design-Specific Twists

- `direct_fit`: the instrument is credible, precedes treatment/outcome, has a first stage, and supports a local/complier claim with explicit assumptions.
- `data_shape_twist`: build instrument/treatment/outcome role table, compliance flow, instrument-level clusters, harmonized SNP table, first-stage rows, or local-window data for fuzzy RD.
- `estimand_twist`: convert a broad treatment-effect request into ITT/reduced form, Wald ratio, LATE/CACE, local fuzzy-RD effect, PLIV/IIVM, MR effect, or diagnostic-only evidence.
- `diagnostic_twist`: prioritize first stage, reduced form, covariate balance, weak-IV inference, overidentification sensitivity, pleiotropy checks, or assumption table.
- `implementation_twist`: use 2SLS, LIML, Fuller, weak-robust intervals, IV-DML, MR-Egger/median/mode, or multivariable MR only after the IV assumptions and target are clear.
- `fallback_twist`: if relevance, timing, exclusion, monotonicity, or MR assumptions fail, use ITT/reduced form, sensitivity memo, descriptive association, or stronger-design recommendation.

## Required Diagnostics

Perform the analytic diagnostics relevant to the IV design and chosen estimator lane:

- Instrument role table: instrument, treatment/exposure, outcome, confounders, mediators, clusters, and possible direct paths.
- Timing audit: instrument precedes treatment/exposure and outcome; covariates are pre-instrument or justified.
- First-stage diagnostic: instrument-to-treatment/exposure relationship, partial F/R2, effective F, first-stage plot/table, and weak-instrument concern.
- Reduced-form diagnostic: instrument-to-outcome relationship and whether it matches the claimed path.
- Compliance/encouragement flow: instrument groups, receipt, crossover, missingness, and complier interpretation.
- As-if-randomness evidence: pre-instrument covariate balance or design source credibility.
- Assumption table: relevance, independence, exclusion, monotonicity, consistency/treatment versions, and local interpretation.
- Weak-IV inference: Anderson-Rubin, CLR, LIML/Fuller, or other weak-robust route when feasible.
- Multiple-instrument sensitivity: overidentification, leave-one-out, many-instrument, heterogeneity, and validity caveats.
- MR diagnostics: harmonized SNPs, clumping/LD, allele alignment, F statistics, heterogeneity, MR-Egger intercept, MR-PRESSO/outliers, weighted median/mode, leave-one-out, Steiger directionality, colocalization, and multivariable MR when relevant.
- Support-route diagnostics: if a support file is active, run only the IV diagnostics needed by that support task, such as IV-DML score checks, local heterogeneity, non-continuous outcome scale, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- the instrument has weak or absent relevance
- instrument timing follows treatment, outcome risk, selection, or a mediator
- the instrument proxies baseline risk, access, preference, geography, provider quality, severity, or unmeasured confounding
- exclusion is implausible because of alternate treatments, behavior, resources, information, spillovers, pathways, or pleiotropic biology
- monotonicity or the complier group is incoherent for the intervention versions
- treatment/exposure versions differ across instrument levels in ways that make one causal contrast unclear
- weak instruments, many instruments, many fixed effects, or selected samples make conventional inference fragile
- overidentification, balance, or pleiotropy tests are treated as proof of validity
- post-instrument or post-treatment controls block part of the causal path or induce collider bias
- MR ignores population stratification, LD, allele harmonization, sample overlap, horizontal pleiotropy, winner's curse, or exposure/outcome source mismatch
- the desired claim is a population ATE but the evidence is local, complier-specific, or genetic-IV specific

Never rescue these failures by adding more controls, more instruments, or a more complex estimator. Name the fallback, repair, or local claim.

## Packages

Choose the estimator lane before choosing software. Package lanes are reference cues, not execution permission. Verify current docs before running code.

- Transparent IV and encouragement: R `ivreg`, `AER::ivreg`, `estimatr::iv_robust`; Python `linearmodels`, `statsmodels` support; Stata `ivreg2`.
- Fixed effects and clustered IV: R `fixest`; Python `linearmodels`; supplement weak-IV diagnostics.
- Weak-IV inference: R `ivmodel`, `ivDiag`; Python `ivmodels`; Stata `ivreg2`, `weakiv`, `weakivtest`.
- High-dimensional IV: R/Python `DoubleML` PLIV/IIVM; Python `EconML` DMLIV, OrthoIV, DRIV; use only with clear IV score and assumptions.
- Fuzzy RD: RD packages plus local IV/Wald logic; return to `causal_check` for
  `regression_discontinuity` when the cutoff design is primary.
- Mendelian randomization: R `TwoSampleMR`, `MendelianRandomization`, `MRPRESSO`, `MVMR`, `CAUSE`, `coloc`; use sensitivity methods as probes, not automatic validation.

Key literature anchors: LATE/CACE, Wald estimands, 2SLS, weak instruments, monotonicity, exclusion restriction, encouragement designs, fuzzy RD, PLIV/IIVM, and Mendelian randomization assumptions including pleiotropy and population stratification.

## Support And Rerouting Connections

- Use `statistical-validity` only when unresolved weak-IV inference, fold
  integrity, sensitivity, MR robustness, or reproducibility concerns exceed the
  IV diagnostics above.
- When the candidate instrument is a cutoff, return to `causal_check` for
  `regression_discontinuity` unless the instrument rather than the cutoff is the
  primary identification frame.
- Use `heterogeneous-effects` when IV evidence is about complier heterogeneity, local effect variation, or heterogeneous IV/DRIV.
- Use `dose-response` when the instrument shifts exposure intensity, dose, duration, or continuous exposure.
- Use `non-continuous-outcomes` for binary, survival, competing-risk, count, or recurrent-event outcomes where IV scale matters.
- Use `policy-making-and-transportability` when local/complier evidence is being used for broader policy or target-population decisions.
- Return to `causal_check` for `interference_spillovers` when peer or market
  exposure becomes the primary estimand; otherwise retain it as an IV threat.

## Execution Record

Follow the shared completion-summary and artifact rules in
`references/design_execution_contract.md`. Emphasize the instrument source,
treatment moved and IV estimand, first-stage and weak-IV diagnostics, exclusion
and local-effect assumptions, and the resulting claim boundary.
