const mongoose = require("mongoose");
const embeddingChunkModel = require("../models/embeddingChunk.models");
const interviewReportModel = require("../models/interviewReport.models");
const vectorSearchConfig = require("../config/embeddingChunks.vector-index.json");

const MAX_RESULTS = 50;
const MAX_CANDIDATES = 1000;
const CHUNK_SOURCES = new Set(["resume", "selfDescription", "jobDescription"]);

function toObjectId(value, name) {
    const stringValue = typeof value === "string" ? value : value?.toString();
    if (!stringValue || !mongoose.Types.ObjectId.isValid(stringValue)) {
        throw new TypeError(`${name} must be a valid MongoDB ObjectId.`);
    }
    return new mongoose.Types.ObjectId(stringValue);
}

function validateVector(vector, name = "embedding") {
    if (!Array.isArray(vector)
        || vector.length !== vectorSearchConfig.dimensions
        || !vector.every((value) => typeof value === "number" && Number.isFinite(value))
        || !vector.some((value) => value !== 0)) {
        throw new TypeError(`${name} must contain ${vectorSearchConfig.dimensions} finite numbers and cannot be a zero vector.`);
    }
    return vector;
}

function validateSource(source) {
    if (!CHUNK_SOURCES.has(source)) {
        throw new TypeError("source must be resume, selfDescription, or jobDescription.");
    }
}

function createVectorStore({ ChunkModel, ReportModel }) {
    if (!ChunkModel || !ReportModel) {
        throw new TypeError("ChunkModel and ReportModel are required.");
    }

    async function assertOwnedReport(ownerId, reportId) {
        const report = await ReportModel.exists({ _id: reportId, user: ownerId });
        if (!report) {
            const error = new Error("Interview report not found for this owner.");
            error.code = "REPORT_NOT_FOUND";
            throw error;
        }
    }

    async function upsertChunks({ ownerId: rawOwnerId, reportId: rawReportId, chunks }) {
        const ownerId = toObjectId(rawOwnerId, "ownerId");
        const reportId = toObjectId(rawReportId, "reportId");
        if (!Array.isArray(chunks) || chunks.length === 0) {
            throw new TypeError("chunks must be a non-empty array.");
        }
        await assertOwnedReport(ownerId, reportId);

        const operations = chunks.map((chunk) => {
            if (!chunk || typeof chunk.chunkId !== "string" || !chunk.chunkId.trim()) {
                throw new TypeError("Each chunk must have a non-empty chunkId.");
            }
            if (typeof chunk.text !== "string" || !chunk.text.trim()) {
                throw new TypeError("Each chunk must have non-empty text.");
            }
            validateSource(chunk.source);
            validateVector(chunk.embedding);

            const identity = {
                ownerId,
                reportId,
                source: chunk.source,
                chunkId: chunk.chunkId.trim(),
                modelId: vectorSearchConfig.modelId,
            };
            return {
                updateOne: {
                    filter: identity,
                    update: {
                        $set: {
                            ...identity,
                            section: typeof chunk.section === "string" && chunk.section.trim()
                                ? chunk.section.trim()
                                : "unknown",
                            text: chunk.text.trim(),
                            contentHash: typeof chunk.contentHash === "string" ? chunk.contentHash : null,
                            embedding: chunk.embedding,
                        },
                    },
                    upsert: true,
                },
            };
        });

        const result = await ChunkModel.bulkWrite(operations, { ordered: true });
        return {
            upsertedCount: result.upsertedCount || 0,
            modifiedCount: result.modifiedCount || 0,
            matchedCount: result.matchedCount || 0,
        };
    }

    async function searchChunks({
        ownerId: rawOwnerId,
        reportId: rawReportId,
        queryVector,
        limit = 5,
        numCandidates,
        source,
    }) {
        const ownerId = toObjectId(rawOwnerId, "ownerId");
        const reportId = toObjectId(rawReportId, "reportId");
        validateVector(queryVector, "queryVector");
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
            throw new RangeError(`limit must be an integer between 1 and ${MAX_RESULTS}.`);
        }
        const candidates = numCandidates === undefined ? Math.max(limit * 10, 100) : numCandidates;
        if (!Number.isInteger(candidates) || candidates < limit || candidates > MAX_CANDIDATES) {
            throw new RangeError(`numCandidates must be an integer from limit (${limit}) to ${MAX_CANDIDATES}.`);
        }
        if (source !== undefined) validateSource(source);
        await assertOwnedReport(ownerId, reportId);

        const filter = {
            ownerId,
            reportId,
            modelId: vectorSearchConfig.modelId,
        };
        if (source !== undefined) filter.source = source;

        return ChunkModel.aggregate([
            {
                $vectorSearch: {
                    index: vectorSearchConfig.indexName,
                    path: vectorSearchConfig.embeddingField,
                    queryVector,
                    numCandidates: candidates,
                    limit,
                    filter,
                },
            },
            {
                $project: {
                    _id: 1,
                    ownerId: 1,
                    reportId: 1,
                    chunkId: 1,
                    source: 1,
                    section: 1,
                    text: 1,
                    contentHash: 1,
                    modelId: 1,
                    score: { $meta: "vectorSearchScore" },
                },
            },
        ]).exec();
    }

    async function deleteChunks({ ownerId: rawOwnerId, reportId: rawReportId, source }) {
        const ownerId = toObjectId(rawOwnerId, "ownerId");
        const reportId = toObjectId(rawReportId, "reportId");
        if (source !== undefined) validateSource(source);
        await assertOwnedReport(ownerId, reportId);

        const filter = { ownerId, reportId };
        if (source !== undefined) filter.source = source;
        const result = await ChunkModel.deleteMany(filter);
        return { deletedCount: result.deletedCount || 0 };
    }

    async function deleteChunk({ ownerId: rawOwnerId, reportId: rawReportId, source, chunkId }) {
        const ownerId = toObjectId(rawOwnerId, "ownerId");
        const reportId = toObjectId(rawReportId, "reportId");
        if (typeof chunkId !== "string" || !chunkId.trim()) {
            throw new TypeError("chunkId must be a non-empty string.");
        }
        validateSource(source);
        await assertOwnedReport(ownerId, reportId);

        const result = await ChunkModel.deleteOne({
            ownerId,
            reportId,
            source,
            chunkId: chunkId.trim(),
            modelId: vectorSearchConfig.modelId,
        });
        return { deletedCount: result.deletedCount || 0 };
    }

    return { upsertChunks, searchChunks, deleteChunks, deleteChunk };
}

module.exports = {
    ...createVectorStore({ ChunkModel: embeddingChunkModel, ReportModel: interviewReportModel }),
    createVectorStore,
    validateVector,
};
