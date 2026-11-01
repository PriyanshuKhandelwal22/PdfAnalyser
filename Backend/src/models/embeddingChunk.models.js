const mongoose = require("mongoose");
const vectorSearchConfig = require("../config/embeddingChunks.vector-index.json");

const embeddingChunkSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    reportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "InterviewReport",
        required: true,
    },
    chunkId: {
        type: String,
        required: true,
        trim: true,
    },
    source: {
        type: String,
        enum: ["resume", "selfDescription", "jobDescription"],
        required: true,
    },
    section: {
        type: String,
        default: "unknown",
    },
    text: {
        type: String,
        required: true,
    },
    contentHash: {
        type: String,
        default: null,
    },
    modelId: {
        type: String,
        required: true,
        enum: [vectorSearchConfig.modelId],
    },
    embedding: {
        type: [Number],
        required: true,
        validate: {
            validator: (embedding) => embedding.length === vectorSearchConfig.dimensions
                && embedding.every(Number.isFinite)
                && embedding.some((value) => value !== 0),
            message: `Embedding must contain ${vectorSearchConfig.dimensions} finite numbers and cannot be a zero vector.`,
        },
    },
}, {
    timestamps: true,
    versionKey: false,
    collection: vectorSearchConfig.collectionName,
});

embeddingChunkSchema.index(
    { ownerId: 1, reportId: 1, source: 1, chunkId: 1, modelId: 1 },
    { unique: true, name: "owner_report_source_chunk_model_unique" },
);

const embeddingChunkModel = mongoose.model("EmbeddingChunk", embeddingChunkSchema);

module.exports = embeddingChunkModel;
