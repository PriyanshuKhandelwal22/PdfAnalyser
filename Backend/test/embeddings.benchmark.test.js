const test = require("node:test");
const assert = require("node:assert/strict");

const {
    cosineSimilarity,
    evaluateRetrieval,
    readDataset,
    summarize,
} = require("../benchmarks/embeddings/benchmark");

test("benchmark fixture has unique chunk ids and valid relevance labels", () => {
    const dataset = readDataset();
    const ids = dataset.chunks.map(({ id }) => id);

    assert.equal(new Set(ids).size, ids.length);
    assert.equal(dataset.queries.length, 12);
    assert.deepEqual(new Set(dataset.queries.map(({ language = "en" }) => language)), new Set(["en", "es"]));
});

test("cosine similarity rejects mismatched dimensions and zero vectors", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.throws(() => cosineSimilarity([1], [1, 0]), /dimension mismatch/);
    assert.throws(() => cosineSimilarity([0, 0], [1, 0]), /zero vector/);
});

test("retrieval metrics respect labeled direct and related evidence", () => {
    const dataset = {
        queries: [
            { id: "q-en", language: "en", directEvidenceChunkIds: ["irrelevant"], relatedContextChunkIds: [] },
            { id: "q-es", language: "es", directEvidenceChunkIds: ["direct"], relatedContextChunkIds: ["related"] },
        ],
        chunks: [{ id: "direct" }, { id: "related" }, { id: "irrelevant" }],
    };
    // Embeddings are in fixture order: queries first, then corpus chunks.
    const metrics = evaluateRetrieval(dataset, [[0, 1], [1, 0], [1, 0], [0.9, 0.1], [0, 1]], [dataset.queries[1]]);

    assert.equal(metrics.queryCount, 1);
    assert.equal(metrics.corpusCount, 3);
    assert.equal(metrics.directEvidenceRecallAt3, 1);
    assert.equal(metrics.relatedContextRecallAt3, 1);
    assert.equal(metrics.meanReciprocalRank, 1);
});

test("timing summary calculates the conventional median for even and odd samples", () => {
    assert.deepEqual(summarize([10, 30], 2), {
        meanBatchMs: 20,
        medianBatchMs: 20,
        batchMeasurementsMs: [10, 30],
        meanMsPerInput: 10,
    });
    assert.equal(summarize([30, 10, 20], 1).medianBatchMs, 20);
});
