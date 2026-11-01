const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const vectorSearchConfig = require("../src/config/embeddingChunks.vector-index.json");
const embeddingChunkModel = require("../src/models/embeddingChunk.models");
const { createVectorStore } = require("../src/service/vectorStore.service");

const ownerId = new mongoose.Types.ObjectId();
const otherOwnerId = new mongoose.Types.ObjectId();
const reportId = new mongoose.Types.ObjectId();
const validVector = () => Array(vectorSearchConfig.dimensions).fill(0.125);

function createHarness({ ownsReport = true } = {}) {
    const calls = { reportChecks: [], writes: [], pipelines: [], deletions: [] };
    const ReportModel = {
        exists: async (filter) => {
            calls.reportChecks.push(filter);
            return ownsReport && filter.user.equals(ownerId) && filter._id.equals(reportId)
                ? { _id: reportId }
                : null;
        },
    };
    const ChunkModel = {
        bulkWrite: async (operations, options) => {
            calls.writes.push({ operations, options });
            return { upsertedCount: operations.length, modifiedCount: 0, matchedCount: 0 };
        },
        aggregate: (pipeline) => {
            calls.pipelines.push(pipeline);
            return { exec: async () => [{ chunkId: "chunk-1", score: 0.92 }] };
        },
        deleteMany: async (filter) => {
            calls.deletions.push(filter);
            return { deletedCount: 2 };
        },
    };
    return { store: createVectorStore({ ChunkModel, ReportModel }), calls };
}

const chunk = (overrides = {}) => ({
    chunkId: "chunk-1",
    source: "resume",
    section: "experience",
    text: "Built an API using Node.js.",
    contentHash: "sha256:synthetic",
    embedding: validVector(),
    ...overrides,
});

test("upsert writes only under the authenticated owner and owned report", async () => {
    const { store, calls } = createHarness();
    const result = await store.upsertChunks({ ownerId, reportId, chunks: [chunk()] });

    assert.deepEqual(result, { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 });
    assert.equal(calls.reportChecks.length, 1);
    const operation = calls.writes[0].operations[0].updateOne;
    assert.equal(operation.upsert, true);
    assert.equal(operation.filter.ownerId.equals(ownerId), true);
    assert.equal(operation.filter.reportId.equals(reportId), true);
    assert.equal(operation.filter.modelId, vectorSearchConfig.modelId);
    assert.equal(operation.update.$set.embedding.length, vectorSearchConfig.dimensions);
});

test("upsert refuses another owner's report and invalid vectors", async () => {
    const foreign = createHarness({ ownsReport: false });
    await assert.rejects(
        foreign.store.upsertChunks({ ownerId: otherOwnerId, reportId, chunks: [chunk()] }),
        { code: "REPORT_NOT_FOUND" },
    );
    assert.equal(foreign.calls.writes.length, 0);

    const own = createHarness();
    await assert.rejects(
        own.store.upsertChunks({ ownerId, reportId, chunks: [chunk({ embedding: [1, 2] })] }),
        /384 finite numbers/,
    );
    assert.equal(own.calls.writes.length, 0);
});

test("search prefilters by owner, report, model and optional source", async () => {
    const { store, calls } = createHarness();
    const results = await store.searchChunks({
        ownerId,
        reportId,
        queryVector: validVector(),
        limit: 3,
        source: "resume",
    });

    assert.equal(results[0].chunkId, "chunk-1");
    const vectorStage = calls.pipelines[0][0].$vectorSearch;
    assert.equal(vectorStage.index, vectorSearchConfig.indexName);
    assert.equal(vectorStage.path, "embedding");
    assert.equal(vectorStage.filter.ownerId.equals(ownerId), true);
    assert.equal(vectorStage.filter.reportId.equals(reportId), true);
    assert.equal(vectorStage.filter.modelId, vectorSearchConfig.modelId);
    assert.equal(vectorStage.filter.source, "resume");
    assert.equal(calls.pipelines[0][1].$project.score.$meta, "vectorSearchScore");
});

test("search refuses a foreign report before running vector search", async () => {
    const { store, calls } = createHarness({ ownsReport: false });
    await assert.rejects(
        store.searchChunks({ ownerId: otherOwnerId, reportId, queryVector: validVector() }),
        { code: "REPORT_NOT_FOUND" },
    );
    assert.equal(calls.pipelines.length, 0);
});

test("same owner cannot use chunks from another report", async () => {
    const { store, calls } = createHarness();
    const otherReportId = new mongoose.Types.ObjectId();
    const attempts = await Promise.allSettled([
        store.upsertChunks({ ownerId, reportId: otherReportId, chunks: [chunk()] }),
        store.searchChunks({ ownerId, reportId: otherReportId, queryVector: validVector() }),
        store.deleteChunks({ ownerId, reportId: otherReportId }),
    ]);

    assert.ok(attempts.every(({ status, reason }) => status === "rejected" && reason.code === "REPORT_NOT_FOUND"));
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.pipelines.length, 0);
    assert.equal(calls.deletions.length, 0);
});

test("deletion is scoped to owner and report, with optional source narrowing", async () => {
    const { store, calls } = createHarness();
    const result = await store.deleteChunks({ ownerId, reportId, source: "jobDescription" });

    assert.deepEqual(result, { deletedCount: 2 });
    assert.equal(calls.deletions.length, 1);
    assert.equal(calls.deletions[0].ownerId.equals(ownerId), true);
    assert.equal(calls.deletions[0].reportId.equals(reportId), true);
    assert.equal(calls.deletions[0].source, "jobDescription");
});

test("deletion refuses another owner's report before deleting chunks", async () => {
    const { store, calls } = createHarness({ ownsReport: false });
    await assert.rejects(
        store.deleteChunks({ ownerId: otherOwnerId, reportId }),
        { code: "REPORT_NOT_FOUND" },
    );
    assert.equal(calls.deletions.length, 0);
});

test("Atlas index config matches the Mongoose collection and embedding dimensions", () => {
    assert.equal(vectorSearchConfig.collectionName, "embeddingchunks");
    assert.equal(embeddingChunkModel.collection.name, vectorSearchConfig.collectionName);
    const vectorField = vectorSearchConfig.definition.fields.find(({ type }) => type === "vector");
    assert.equal(vectorField.path, vectorSearchConfig.embeddingField);
    assert.equal(vectorField.numDimensions, vectorSearchConfig.dimensions);
    assert.deepEqual(
        vectorSearchConfig.definition.fields.filter(({ type }) => type === "filter").map(({ path }) => path),
        ["ownerId", "reportId", "source", "modelId"],
    );
});
