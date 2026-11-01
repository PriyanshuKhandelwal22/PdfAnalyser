# Semantic skill matching

The interview report generator adds an explainable `skillMatches` result for each
job-description skill. Exact and catalogued alias matches are resolved before
embedding inference. Remaining skills are compared with the local
`onnx-community/all-MiniLM-L6-v2-ONNX` model using 384-dimensional normalized
embeddings. Results are classified as `Semantically Related`, `Needs Review`,
or `Missing Skill` using the thresholds in
`src/config/semanticSkillMatching.json`.

`Semantically Related` means that two skill terms are close in the embedding
space. It does not establish equivalent proficiency or experience. The result
includes the candidate evidence source, section, excerpt, similarity and an
explanation so a reviewer can inspect why it was classified. If local embedding
inference is unavailable, exact and alias matches remain available and other
requirements are marked `Needs Review`.

The model is loaded lazily on CPU and cached for the process. The first use may
download model assets and needs network access unless the model is already
cached. `@huggingface/transformers` is a runtime dependency because report
generation uses it in production.

## Initial benchmark

Run `npm run benchmark:skills` from `Backend/`. The script embeds the labeled,
synthetic examples in `benchmarks/skills/dataset.json`, calibrates the review
and semantic thresholds, compares with exact/alias-only matching, and writes
the results to `benchmarks/skills/results.json`.

The initial 27-pair benchmark measured an exact/alias-only baseline accuracy of
0.481 and macro-F1 of 0.492. Hybrid matching measured calibration accuracy
0.889 and macro-F1 0.914. Leave-one-out evaluation, which recalibrates thresholds
without the held-out example, measured accuracy 0.815 and macro-F1 0.856. The
thresholds currently configured were measured from the full synthetic set:
review `0.24565`, semantic `0.51735`.

This small synthetic set is an initial engineering check, not an independent,
representative evaluation. Thresholds may be optimistic because calibration and
reporting use the same small set. The leave-one-out result reduces but does not
remove this limitation. Expand and independently label representative skill
pairs before treating the classifications as validated for hiring decisions.
