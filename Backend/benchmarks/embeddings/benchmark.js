const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { GoogleGenAI } = require("@google/genai");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const DATASET_PATH = path.join(__dirname, "dataset.json");
const LOCAL_MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";
const HOSTED_MODEL_ID = "gemini-embedding-2";
const HOSTED_DIMENSIONS = 768;

function readDataset() {
    const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
    const chunkIds = new Set();
    for (const { id } of dataset.chunks) {
        if (chunkIds.has(id)) throw new Error(`Duplicate corpus chunk id '${id}'.`);
        chunkIds.add(id);
    }
    const queryIds = new Set();
    for (const query of dataset.queries) {
        if (queryIds.has(query.id)) throw new Error(`Duplicate query id '${query.id}'.`);
        queryIds.add(query.id);
        const labeledChunkIds = [
            ...query.directEvidenceChunkIds,
            ...query.relatedContextChunkIds,
        ];
        if (!query.directEvidenceChunkIds.length || new Set(labeledChunkIds).size !== labeledChunkIds.length || labeledChunkIds.some((id) => !chunkIds.has(id))) {
            throw new Error(`Invalid relevance labels for query '${query.id}'.`);
        }
    }
    return dataset;
}

function vectorizeOutput(output, expectedCount) {
    if (Array.isArray(output) && output.every((item) => item?.data)) {
        return output.map((item) => Array.from(item.data));
    }

    const dimensions = output?.dims;
    if (!Array.isArray(dimensions) || dimensions.length !== 2 || dimensions[0] !== expectedCount) {
        throw new Error(`Expected ${expectedCount} independent embedding vectors; received output shape ${JSON.stringify(dimensions)}.`);
    }

    const [count, width] = dimensions;
    return Array.from({ length: count }, (_, index) =>
        Array.from(output.data.subarray(index * width, (index + 1) * width)));
}

function cosineSimilarity(left, right) {
    if (left.length !== right.length) {
        throw new Error(`Embedding dimension mismatch (${left.length} vs ${right.length}).`);
    }

    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftNorm += left[index] ** 2;
        rightNorm += right[index] ** 2;
    }
    if (!leftNorm || !rightNorm) {
        throw new Error("Cannot calculate cosine similarity for a zero vector.");
    }
    return dot / Math.sqrt(leftNorm * rightNorm);
}

function evaluateRetrieval(dataset, embeddings, queries = dataset.queries) {
    const queryEmbeddings = new Map();
    const chunkEmbeddings = new Map();
    let offset = 0;
    for (const query of dataset.queries) {
        queryEmbeddings.set(query.id, embeddings[offset++]);
    }
    for (const chunk of dataset.chunks) {
        chunkEmbeddings.set(chunk.id, embeddings[offset++]);
    }

    const reciprocalRanks = [];
    const recallsAt1 = [];
    const recallsAt3 = [];
    const directRecallsAt3 = [];
    const relatedRecallsAt3 = [];
    const positiveScores = [];
    const negativeScores = [];

    for (const query of queries) {
        const directEvidence = new Set(query.directEvidenceChunkIds);
        const relatedContext = new Set(query.relatedContextChunkIds);
        const relevant = new Set([...directEvidence, ...relatedContext]);
        const ranked = dataset.chunks.map((chunk) => ({
            id: chunk.id,
            score: cosineSimilarity(queryEmbeddings.get(query.id), chunkEmbeddings.get(chunk.id)),
        })).sort((left, right) => right.score - left.score);
        const firstRelevantRank = ranked.findIndex(({ id }) => relevant.has(id)) + 1;
        const top1Hits = ranked.slice(0, 1).filter(({ id }) => relevant.has(id)).length;
        const top3Hits = ranked.slice(0, 3).filter(({ id }) => relevant.has(id)).length;
        const top3Ids = new Set(ranked.slice(0, 3).map(({ id }) => id));
        const directHits = [...directEvidence].filter((id) => top3Ids.has(id)).length;
        const relatedHits = [...relatedContext].filter((id) => top3Ids.has(id)).length;

        reciprocalRanks.push(1 / firstRelevantRank);
        recallsAt1.push(top1Hits / relevant.size);
        recallsAt3.push(top3Hits / relevant.size);
        directRecallsAt3.push(directHits / directEvidence.size);
        if (relatedContext.size) {
            relatedRecallsAt3.push(relatedHits / relatedContext.size);
        }
        for (const candidate of ranked) {
            (relevant.has(candidate.id) ? positiveScores : negativeScores).push(candidate.score);
        }
    }

    let wins = 0;
    let ties = 0;
    for (const positive of positiveScores) {
        for (const negative of negativeScores) {
            if (positive > negative) wins += 1;
            else if (positive === negative) ties += 1;
        }
    }

    const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
        queryCount: queries.length,
        corpusCount: dataset.chunks.length,
        recallAt1: average(recallsAt1),
        recallAt3: average(recallsAt3),
        directEvidenceRecallAt3: average(directRecallsAt3),
        relatedContextRecallAt3: relatedRecallsAt3.length ? average(relatedRecallsAt3) : null,
        meanReciprocalRank: average(reciprocalRanks),
        pairwiseAuc: (wins + ties * 0.5) / (positiveScores.length * negativeScores.length),
    };
}

function summarize(values, inputCount) {
    const sorted = [...values].sort((left, right) => left - right);
    const total = values.reduce((sum, value) => sum + value, 0);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    return {
        meanBatchMs: total / values.length,
        medianBatchMs: median,
        batchMeasurementsMs: values,
        meanMsPerInput: total / (values.length * inputCount),
    };
}

function getEvaluationTexts(dataset) {
    return [
        ...dataset.queries.map(({ text }) => text),
        ...dataset.chunks.map(({ text }) => text),
    ];
}

async function runLocal(texts, iterations) {
    const { pipeline } = await import("@huggingface/transformers");
    const initializeStart = performance.now();
    const extractor = await pipeline("feature-extraction", LOCAL_MODEL_ID, { device: "cpu" });
    const initializationMs = performance.now() - initializeStart;

    const warmupOutput = await extractor(texts, { pooling: "mean", normalize: true });
    const warmupEmbeddings = vectorizeOutput(warmupOutput, texts.length);
    const batchMs = [];
    let embeddings = warmupEmbeddings;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const start = performance.now();
        const output = await extractor(texts, { pooling: "mean", normalize: true });
        batchMs.push(performance.now() - start);
        embeddings = vectorizeOutput(output, texts.length);
    }
    await extractor.dispose?.();

    return {
        model: LOCAL_MODEL_ID,
        dimensions: embeddings[0].length,
        initializationMs,
        warmupBatchMs: null,
        timings: summarize(batchMs, texts.length),
        embeddings,
    };
}

async function runHosted(texts, iterations) {
    const apiKey = process.env.GEMINI_GENAI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_GENAI_API_KEY is not configured in Backend/.env or the process environment.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const contents = texts.map((text) => ({ role: "user", parts: [{ text }] }));
    const batchMs = [];
    let embeddings = [];
    let reportedTokenCount = 0;
    let hasReportedTokenCount = false;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const start = performance.now();
        const response = await ai.models.embedContent({
            model: HOSTED_MODEL_ID,
            contents,
            config: { outputDimensionality: HOSTED_DIMENSIONS },
        });
        batchMs.push(performance.now() - start);
        embeddings = (response.embeddings || []).map(({ values }) => values);
        if (typeof response.usageMetadata?.promptTokenCount === "number") {
            reportedTokenCount += response.usageMetadata.promptTokenCount;
            hasReportedTokenCount = true;
        }
        if (embeddings.length !== texts.length) {
            throw new Error(`Hosted API returned ${embeddings.length} vectors for ${texts.length} separate inputs.`);
        }
    }

    const wordEstimate = texts.reduce((sum, text) => sum + text.trim().split(/\s+/).filter(Boolean).length, 0) * iterations;
    const tokenEstimateFromWords = Math.ceil(wordEstimate * 1.3);
    const pricePerMillionTokens = Number(process.env.GEMINI_EMBEDDING_PRICE_PER_MILLION || 0.2);
    return {
        model: HOSTED_MODEL_ID,
        dimensions: embeddings[0].length,
        timings: summarize(batchMs, texts.length),
        reportedInputTokenCount: hasReportedTokenCount ? reportedTokenCount : null,
        approximateWordCountForCostFallback: hasReportedTokenCount ? undefined : wordEstimate,
        approximateInputTokenCountForCostFallback: hasReportedTokenCount ? undefined : tokenEstimateFromWords,
        pricingRateUsdPerMillionTokens: pricePerMillionTokens,
        estimatedUsd: (hasReportedTokenCount ? reportedTokenCount : tokenEstimateFromWords) * pricePerMillionTokens / 1_000_000,
        embeddings,
    };
}

async function main() {
    const iterations = Number(process.env.EMBEDDING_BENCHMARK_ITERATIONS || 2);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) {
        throw new Error("EMBEDDING_BENCHMARK_ITERATIONS must be an integer between 1 and 10.");
    }

    const dataset = readDataset();
    const texts = getEvaluationTexts(dataset);
    const local = await runLocal(texts, iterations);
    const hosted = await runHosted(texts, iterations);
    const stripVectors = ({ embeddings, ...summary }) => summary;

    const byQueryLanguage = (embeddings) => Object.fromEntries(
        [...new Set(dataset.queries.map(({ language = "en" }) => language))].map((language) => [
            language,
            evaluateRetrieval(dataset, embeddings, dataset.queries.filter((query) => (query.language || "en") === language)),
        ]),
    );
    const result = {
        dataset: {
            name: dataset.name,
            language: dataset.language,
            queryCount: dataset.queries.length,
            corpusCount: dataset.chunks.length,
            embeddedTextCount: texts.length,
        },
        iterations,
        local: {
            ...stripVectors(local),
            retrieval: evaluateRetrieval(dataset, local.embeddings),
            retrievalByQueryLanguage: byQueryLanguage(local.embeddings),
        },
        hosted: {
            ...stripVectors(hosted),
            retrieval: evaluateRetrieval(dataset, hosted.embeddings),
            retrievalByQueryLanguage: byQueryLanguage(hosted.embeddings),
        },
        notes: [
            "Local initialization includes model loading and first-run model download; warm timings are reported separately.",
            "Hosted API time is end-to-end latency for one batched request; repeated requests are included in reported token usage when returned, otherwise the word-count cost estimate covers all repetitions.",
            "Retrieval relevance is a small synthetic context-relevance judgment and does not establish skill equivalence or proficiency.",
        ],
        measuredAt: new Date().toISOString(),
    };

    const outputPath = process.argv[2];
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (outputPath) {
        const resolvedOutputPath = path.resolve(outputPath);
        fs.writeFileSync(resolvedOutputPath, json, "utf8");
        console.log(`Wrote benchmark results to ${resolvedOutputPath}`);
    }
    console.log(json);
}

module.exports = { cosineSimilarity, evaluateRetrieval, readDataset, summarize };

if (require.main === module) {
    main().catch((error) => {
        console.error(`Embedding benchmark failed: ${error.stack || error.message}`);
        process.exitCode = 1;
    });
}
