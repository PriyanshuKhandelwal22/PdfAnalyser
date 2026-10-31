# Embedding benchmark

This benchmark compares a local ONNX export of `all-MiniLM-L6-v2` with Google's hosted `gemini-embedding-2` using synthetic technical text only. No resume, self-description, job description, or production account data is read by this benchmark.

## Setup

From `Backend/`:

```powershell
npm install --save-dev @huggingface/transformers
```

Set `GEMINI_GENAI_API_KEY` in the ignored `Backend/.env` file or in the process environment. Do not add the key to a tracked file. The script uses the existing `@google/genai` dependency.

## Run

```powershell
node benchmarks/embeddings/benchmark.js benchmarks/embeddings/results.json
```

The local model files are downloaded on first use and cached by Transformers.js. The initialization time includes model loading and, on the first run, that download. Later warm batch timings exclude initialization. `EMBEDDING_BENCHMARK_ITERATIONS` can be set from 1 to 10 (default 2); the free API tier may limit the number of inputs embedded per minute. Gemini uses 768 output dimensions, one of the dimensions Google recommends for `gemini-embedding-2`.

## Method

The fixture contains ten English and two Spanish skill-style queries against a synthetic English evidence corpus. The Spanish queries check cross-language retrieval, while the broader language-support comparison also uses the model cards and provider documentation. Each query labels direct evidence separately from related context. Related snippets can help explain a nearby technology but do not establish equivalent proficiency.

The benchmark embeds all queries and corpus snippets, ranks each query against the whole corpus using cosine similarity, and reports Recall@1, Recall@3, direct-evidence Recall@3, related-context Recall@3, mean reciprocal rank and pairwise AUC, both overall and grouped by query language. It also records vector dimensions, local initialization time, each warm local batch measurement, hosted end-to-end batch measurements, and estimated hosted input cost. Google usage metadata is used for token counts when returned; otherwise cost uses an explicitly approximate 1.3 tokens per word conversion across all repetitions. Set `GEMINI_EMBEDDING_PRICE_PER_MILLION` to override the default rate used for that estimate.

## Results and deployment considerations

Measured 2026-10-31 on a warm model cache, with 12 queries, 33 synthetic snippets and two timed batches of 45 texts each:

| Measure | Local MiniLM | Gemini Embedding 2 |
| --- | ---: | ---: |
| Output dimensions | 384 | 768 |
| Mean warm batch latency (45 texts) | 143.4 ms | 2,432.4 ms |
| Mean latency per text | 3.19 ms | 54.05 ms |
| Overall Recall@3 | 0.847 | 0.944 |
| Direct-evidence Recall@3 | 1.000 | 1.000 |
| English Recall@3 (10 queries) | 0.900 | 0.933 |
| Spanish Recall@3 (2 queries) | 0.583 | 1.000 |
| Estimated cost for both 45-text batches | No per-request API charge | About $0.00024, using approximate token count |

The hosted model retrieved more related context, especially for the two cross-language queries. Both models retrieved direct evidence in the top three for all tested queries. The local model was about 18 times faster per text in this run; its 287 ms initialization was measured with model files already cached, so it excludes the first-run download. Latency depends on hardware, model cache, API region, network and service load.

**Provisional recommendation:** begin with local MiniLM when keeping candidate documents on the application host and low latency are priorities; it found direct evidence reliably in this small fixture and avoids sending resume/JD text to an embedding provider. Consider Gemini Embedding 2 when multilingual recall and richer context are important and the application's privacy and data-handling requirements permit hosted processing. Its pricing is low at this fixture size, but API/network dependency and external processing remain deployment factors. Neither result establishes production quality; expand the reviewed dataset before locking a production choice.

Deployment trade-offs: MiniLM requires downloading and hosting the ONNX model and operating CPU/memory capacity, but can run offline after its files are cached. Gemini avoids hosting model weights and supports 128–3072 output dimensions (768 used here), but needs a protected API key, outbound connectivity, and monitoring for provider limits and pricing changes. Google's documentation describes Gemini embeddings as supporting over 100 languages; the MiniLM model card describes English sentence embeddings. The two Spanish fixture queries are only a tiny spot check, not a language benchmark.

This small synthetic set is suitable for comparing candidates and finding obvious retrieval failures. It is not large enough to choose a production similarity threshold or claim performance on real resumes. Build a larger, reviewed, representative labeled set before production model selection.

## Model references

- [`all-MiniLM-L6-v2` model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2): 384-dimensional sentence embeddings; inputs longer than 256 word pieces are truncated by the model.
- [Transformers.js feature extraction examples](https://huggingface.co/buckets/huggingface/skills/tree/skills/transformers-js/references/EXAMPLES.md): Node.js example using the ONNX community export and mean pooling.
- [Gemini Embedding 2 model](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2): hosted model limits and recommended output dimensions.
- [Gemini embedding language support](https://ai.google.dev/gemini-api/docs/embeddings): documentation describes support across over 100 languages.
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing): current embedding price. Pricing can change; verify before rerunning.
