# Design Frame: descriptive_association

Use this file to plan or execute non-causal descriptive or association analysis;
execute only after recording the non-causal target and pre-result plan. This is not a causal design. It
is the fallback when causal identification is not supportable, or when the user
explicitly wants association-only results.

Do not use this route to strengthen causal wording, choose adjustment sets for causal interpretation, or imply that observed associations estimate effects.

Use with [design_worker](../design_worker.md), design ID `descriptive_association`.
Feasibility uses the data requirements, assumptions, and planned diagnostics;
new target computation additionally follows the recorded-run instructions there.

## Use When

- current evidence does not support identification, but association-only analysis is useful
- the user asks for descriptive summaries, group comparisons, correlations, screening, exploratory associations, or non-causal pattern finding
- the task is to understand data structure, candidate relationships, signal strength, reporting limitations, or hypotheses for future causal work

Do not silently substitute this fallback for a requested causal analysis.
An explicit association-only request remains non-causal even if stronger study
designs could also be investigated.

## Data Contract

Record what is observed, not what is intervened on:

- analysis population and inclusion/exclusion rules
- variables to summarize or compare
- outcome scale, measurement timing, and missingness
- grouping/exposure variable, if any, without treating it as assigned treatment
- repeated measures, clusters, sites, batches, or other dependence
- transformations, winsorization, normalization, compositional handling, or zero handling
- planned multiplicity family for many tests or many outcomes

Facts that usually must be inspected: sample size, cell/event counts, missingness, dependence, outliers, sparse categories, skew, zero inflation, and whether variables were measured before or after each other.

## Analysis Lanes

Choose the simplest lane that answers the requested non-causal question:

- Descriptive summaries: counts, denominators, means/SDs, medians/IQRs, proportions, rates, standardized summaries, missingness tables, and plots.
- Two-group comparisons: Welch t-test, paired t-test, Mann-Whitney, Wilcoxon signed-rank, permutation tests, standardized mean differences, risk/rate/proportion differences.
- Multi-group comparisons: ANOVA, Welch ANOVA, Kruskal-Wallis, aligned-rank or permutation tests, post-hoc contrasts with multiplicity control.
- Categorical association: chi-square, Fisher/exact tests, trend tests, Cramer's V, odds/risk ratios as descriptive associations.
- Continuous association: Pearson, Spearman, Kendall, robust correlation, partial correlation as descriptive adjustment, spline/GAM summaries, scatter/smoother plots.
- Regression summaries: linear, logistic, ordinal, multinomial, Poisson, negative binomial, zero-inflated, mixed or clustered models when needed for dependence; report as adjusted associations, not effects.
- High-dimensional screening: univariate screening, penalized association models, dimension reduction, stability summaries, volcano/forest/heatmap displays, and validation splits when prediction-like screening is used.
- Time-to-event association: Kaplan-Meier summaries, log-rank tests, Cox or flexible survival regression as associational summaries only.

## Multiplicity And Robustness

For many outcomes, predictors, subgroups, taxa, features, or timepoints, define the testing family before interpreting results.

Common choices:

- Holm or Bonferroni for small confirmatory families
- Benjamini-Hochberg FDR for exploratory feature screens
- Benjamini-Yekutieli or permutation FDR when strong dependence is a concern
- q-values, local FDR, or empirical-null checks for high-dimensional screens
- bootstrap or permutation intervals when distributional assumptions are weak
- rank-based, robust, transformed, or sensitivity versions for skew, outliers, or sparse support

Report effect sizes and uncertainty next to p-values. Do not treat multiplicity-adjusted significance as causal evidence.

## Design Diagnostics

Run or request the diagnostics relevant to the selected lane:

- missingness and denominator table
- cell counts, sparse strata, event counts, and separation checks
- distribution, outlier, zero inflation, and transformation checks
- dependence checks for repeated measures, clusters, families, sites, batches, or time
- model residuals, calibration, influence, dispersion, and nonlinearity checks where models are used
- multiplicity family, adjusted p-values, and unadjusted p-values clearly labeled
- robustness to plausible transformations, nonparametric alternatives, and exclusion of extreme values

## Packages

Use package choice after the data shape and selected lane are clear.

- R: `stats`, `rstatix`, `coin`, `exact2x2`, `WRS2`, `broom`, `effectsize`, `emmeans`, `multcomp`, `qvalue`, `Hmisc`, `psych`, `mgcv`, `lme4`, `glmmTMB`, `survival`.
- Python: `pandas`, `scipy.stats`, `statsmodels`, `pingouin`, `scikit-posthocs`, `sklearn`, `lifelines`, `seaborn`, `matplotlib`, `numpy`.

## Execution Record

In the saved review and run summary, emphasize variables, analysis lane,
multiplicity, key/null/unstable patterns, material limits, and the explicit
non-causal boundary.

## Boundary

Use wording like "observed association," "descriptive difference," "pattern in this dataset," or "hypothesis-generating result." Avoid "effect," "impact," "caused by," "protective," "harmful," "mediated," or "adjusted causal estimate" unless a separate causal design supports that claim.
