const vectorSearchConfig = require("../config/embeddingChunks.vector-index.json");

let extractorPromise;

function outputToVectors(output, expectedCount) {
    if (Array.isArray(output) && output.every((item) => item?.data)) {
        return output.map((item) => Array.from(item.data));
    }

    const dimensions = output?.dims;
    if (!Array.isArray(dimensions) || dimensions.length !== 2 || dimensions[0] !== expectedCount) {
        throw new Error(`Embedding model returned an unexpected output shape: ${JSON.stringify(dimensions)}.`);
    }

    const [count, width] = dimensions;
    return Array.from({ length: count }, (_, index) =>
        Array.from(output.data.subarray(index * width, (index + 1) * width)));
}

async function getExtractor() {
    if (!extractorPromise) {
        extractorPromise = import("@huggingface/transformers")
            .then(({ pipeline }) => pipeline(
                "feature-extraction",
                vectorSearchConfig.modelId,
                { device: "cpu" },
            ))
            .catch((error) => {
                extractorPromise = null;
                throw error;
            });
    }
    return extractorPromise;
}

async function embedTexts(texts) {
    if (!Array.isArray(texts) || texts.length === 0
        || texts.some((text) => typeof text !== "string" || !text.trim())) {
        throw new TypeError("texts must be a non-empty array of non-empty strings.");
    }

    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const vectors = outputToVectors(output, texts.length);
    if (vectors.length !== texts.length || vectors.some((vector) => (
        vector.length !== vectorSearchConfig.dimensions
        || vector.some((value) => !Number.isFinite(value))
        || !vector.some((value) => value !== 0)
    ))) {
        throw new Error(`Embedding model must return ${texts.length} non-zero finite vectors of ${vectorSearchConfig.dimensions} dimensions.`);
    }
    return vectors;
}

module.exports = { embedTexts };
