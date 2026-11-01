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

function createHarness({ ownsReport = true, ownedReports } = {}) {
    const reports = ownedReports || new Map([
        [`${ownerId}:${reportId}`, ownsReport],
    ]);
    const records = new Map();
    const calls = { reportChecks: [], writes: [], pipelines: [], deletions: [] };
    const ReportModel = {
        exists: async (filter) => {
            calls.reportChecks.push(filter);
            return reports.get(`${filter.user}:${filter._id}`)
                ? { _id: reportId }
                : null;
        },
    };
    const ChunkModel = {
        bulkWrite: async (operations, options) => {
            calls.writes.push({ operations, options });
            let upsertedCount = 0;
            let modifiedCount = 0;
            let matchedCount = 0;
            for (const { updateOne } of operations) {
                const identity = updateOne.filter;
                const key = [identity.ownerId, identity.reportId, identity.source, identity.chunkId, identity.modelId]
                    .map(String)
                    .join(":");
                const existing = records.get(key);
                if (existing) {
                    matchedCount += 1;
                    if (JSON.stringify(existing) !== JSON.stringify(updateOne.update.$set)) {
                        modifiedCount += 1;
                    }
                } else {
                    upsertedCount += 1;
                }
                records.set(key, { ...updateOne.update.$set });
            }
            return { upsertedCount, modifiedCount, matchedCount };
        },
        aggregate: (pipeline) => {
            calls.pipelines.push(pipeline);
            return { exec: async () => [{ chunkId: "chunk-1", score: 0.92 }] };
        },
        deleteMany: async (filter) => {
            calls.deletions.push(filter);
            return { deletedCount: 2 };
        },
        deleteOne: async (filter) => {
            calls.deletions.push(filter);
            const key = [filter.ownerId, filter.reportId, filter.source, filter.chunkId, filter.modelId]
                .map(String)
                .join(":");
            const deletedCount = records.delete(key) ? 1 : 0;
            return { deletedCount };
        },
    };
    return { store: createVectorStore({ ChunkModel, ReportModel }), calls, records };
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

test("multi-chunk upsert inserts multiple chunks and repeat upsert updates without duplicates", async () => {
    const { store, calls, records } = createHarness();
    const firstChunk = chunk();
    const secondChunk = chunk({ chunkId: "chunk-2", text: "Designed a synthetic data pipeline." });

    const inserted = await store.upsertChunks({ ownerId, reportId, chunks: [firstChunk, secondChunk] });
    assert.deepEqual(inserted, { upsertedCount: 2, modifiedCount: 0, matchedCount: 0 });
    assert.equal(records.size, 2);

    const repeated = await store.upsertChunks({ ownerId, reportId, chunks: [firstChunk] });
    assert.deepEqual(repeated, { upsertedCount: 0, modifiedCount: 0, matchedCount: 1 });
    assert.equal(records.size, 2);

    const updated = await store.upsertChunks({
        ownerId,
        reportId,
        chunks: [chunk({ text: "Updated synthetic chunk text." })],
    });
    assert.deepEqual(updated, { upsertedCount: 0, modifiedCount: 1, matchedCount: 1 });
    assert.equal(records.size, 2);
    assert.equal([...records.values()].find(({ chunkId }) => chunkId === "chunk-1").text, "Updated synthetic chunk text.");
    assert.equal(calls.writes.length, 3);
    assert.ok(calls.writes.every(({ options }) => options.ordered === true));
});

test("upserts keep identical chunk IDs isolated by owner and report", async () => {
    const otherReportId = new mongoose.Types.ObjectId();
    const ownedReports = new Map([
        [`${ownerId}:${reportId}`, true],
        [`${ownerId}:${otherReportId}`, true],
        [`${otherOwnerId}:${reportId}`, true],
    ]);
    const { store, records } = createHarness({ ownedReports });

    await store.upsertChunks({ ownerId, reportId, chunks: [chunk()] });
    await store.upsertChunks({ ownerId, reportId: otherReportId, chunks: [chunk({ text: "Other report." })] });
    await store.upsertChunks({ ownerId: otherOwnerId, reportId, chunks: [chunk({ text: "Other user." })] });

    assert.equal(records.size, 3);
    assert.deepEqual([...records.values()].map(({ text }) => text).sort(), [
        "Built an API using Node.js.",
        "Other report.",
        "Other user.",
    ]);
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

test("single chunk deletion includes owner, report, source, chunk and model scope", async () => {
    const { store, calls, records } = createHarness();
    await store.upsertChunks({ ownerId, reportId, chunks: [chunk()] });

    assert.deepEqual(await store.deleteChunk({ ownerId, reportId, source: "resume", chunkId: " chunk-1 " }), { deletedCount: 1 });
    assert.equal(records.size, 0);
    const deletionFilter = calls.deletions.at(-1);
    assert.equal(deletionFilter.ownerId.equals(ownerId), true);
    assert.equal(deletionFilter.reportId.equals(reportId), true);
    assert.equal(deletionFilter.source, "resume");
    assert.equal(deletionFilter.chunkId, "chunk-1");
    assert.equal(deletionFilter.modelId, vectorSearchConfig.modelId);
    assert.deepEqual(await store.deleteChunk({ ownerId, reportId, source: "resume", chunkId: "chunk-1" }), { deletedCount: 0 });
});

test("single chunk deletion refuses foreign reports and malformed identity", async () => {
    const foreign = createHarness({ ownsReport: false });
    await assert.rejects(
        foreign.store.deleteChunk({ ownerId: otherOwnerId, reportId, source: "resume", chunkId: "chunk-1" }),
        { code: "REPORT_NOT_FOUND" },
    );
    assert.equal(foreign.calls.deletions.length, 0);

    const own = createHarness();
    await assert.rejects(
        own.store.deleteChunk({ ownerId, reportId, source: "resume", chunkId: " " }),
        /chunkId must be a non-empty string/,
    );
    await assert.rejects(
        own.store.deleteChunk({ ownerId, reportId, source: undefined, chunkId: "chunk-1" }),
        /source must be resume/,
    );
    assert.equal(own.calls.deletions.length, 0);
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
    const uniqueIndex = embeddingChunkModel.schema.indexes().find(([keys, options]) => (
        options.name === "owner_report_source_chunk_model_unique"
    ));
    assert.ok(uniqueIndex);
    assert.deepEqual(uniqueIndex[0], { ownerId: 1, reportId: 1, source: 1, chunkId: 1, modelId: 1 });
    assert.equal(uniqueIndex[1].unique, true);
});
