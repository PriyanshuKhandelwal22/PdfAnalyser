const fs = require("node:fs");
const path = require("node:path");
const { canonicalizeSkill, normalizeSkillKey } = require("../../src/service/text.preprocessing.service");
const {
    cosineSimilarity,
    CLASSIFICATIONS,
    analyzeSkillMatches,
} = require("../../src/service/semanticSkillMatching.service");
const { classifySkillEvidence, EVIDENCE_CLASSIFICATIONS } = require("../../src/service/skillEvidence.service");

const DATASET_PATH = path.join(__dirname, "dataset.json");
const RESULTS_PATH = path.join(__dirname, "results.json");
const EXACT_LABELS = new Set([CLASSIFICATIONS.EXACT, CLASSIFICATIONS.ALIAS]);
const SEMANTIC_LABELS = [
    CLASSIFICATIONS.RELATED,
    CLASSIFICATIONS.REVIEW,
    CLASSIFICATIONS.MISSING,
];
const RELATIONSHIPS = new Set(["exact", "alias", "true_semantic", "related_non_equivalent", "unrelated", "ambiguous"]);
const EVIDENCE_LABELS = Object.values(EVIDENCE_CLASSIFICATIONS);

function readDataset() {
    const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
    const ids = new Set();
    for (const pair of dataset.pairs || []) {
        if (!pair.id || ids.has(pair.id)) throw new Error(`Missing or duplicate pair id '${pair.id}'.`);
        ids.add(pair.id);
        if (typeof pair.requiredSkill !== "string" || !pair.requiredSkill.trim()
            || typeof pair.candidateSkill !== "string" || !pair.candidateSkill.trim()
            || ![...EXACT_LABELS, ...SEMANTIC_LABELS].includes(pair.label)
            || !RELATIONSHIPS.has(pair.relationship)) {
            throw new Error(`Invalid skill pair '${pair.id}'.`);
        }
    }
    for (const label of SEMANTIC_LABELS) {
        if (!dataset.pairs.some((pair) => pair.label === label)) {
            throw new Error(`Dataset must contain at least one '${label}' example.`);
        }
    }
    const evidenceIds = new Set();
    for (const example of dataset.evidenceCases || []) {
        if (!example.id || evidenceIds.has(example.id)
            || typeof example.skill !== "string" || !example.skill.trim()
            || typeof example.evidence !== "string"
            || !EVIDENCE_LABELS.includes(example.expected)
            || !Object.values(CLASSIFICATIONS).includes(example.expectedMatch)) {
            throw new Error(`Invalid evidence example '${example.id}'.`);
        }
        evidenceIds.add(example.id);
    }
    if (!dataset.evidenceCases?.length) throw new Error("Dataset must contain labeled evidence cases.");
    return dataset;
}

function classifyPair(pair, score, thresholds) {
    const required = canonicalizeSkill(pair.requiredSkill);
    const candidate = canonicalizeSkill(pair.candidateSkill);
    if (normalizeSkillKey(required) === normalizeSkillKey(candidate)) {
        return normalizeSkillKey(pair.requiredSkill) === normalizeSkillKey(pair.candidateSkill)
            ? CLASSIFICATIONS.EXACT
            : CLASSIFICATIONS.ALIAS;
    }
    if (score >= thresholds.semanticThreshold) return CLASSIFICATIONS.RELATED;
    if (score >= thresholds.reviewThreshold) return CLASSIFICATIONS.REVIEW;
    return CLASSIFICATIONS.MISSING;
}

function calculateMetrics(pairs, predictions, classes) {
    const confusion = Object.fromEntries(classes.map((label) => [
        label,
        Object.fromEntries(classes.map((predicted) => [predicted, 0])),
    ]));
    for (const pair of pairs) confusion[pair.label][predictions.get(pair.id)] += 1;

    const perClass = Object.fromEntries(classes.map((label) => {
        const truePositive = confusion[label][label];
        const actual = Object.values(confusion[label]).reduce((sum, count) => sum + count, 0);
        const predicted = classes.reduce((sum, actualLabel) => sum + confusion[actualLabel][label], 0);
        const precision = predicted ? truePositive / predicted : 0;
        const recall = actual ? truePositive / actual : 0;
        const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
        return [label, { precision, recall, f1, support: actual }];
    }));
    const correct = pairs.filter((pair) => predictions.get(pair.id) === pair.label).length;
    return {
        accuracy: pairs.length ? correct / pairs.length : 0,
        macroF1: classes.reduce((sum, label) => sum + perClass[label].f1, 0) / classes.length,
        perClass,
        confusionMatrix: confusion,
    };
}

function calculateClassMetrics(pairs, predictions) {
    return calculateMetrics(pairs, predictions, [...EXACT_LABELS, ...SEMANTIC_LABELS]);
}

function candidateThresholds(pairs) {
    const scores = [...new Set(pairs.map(({ score }) => score))].sort((a, b) => a - b);
    const values = new Set([0, 1]);
    scores.forEach((score) => values.add(Math.min(1, Math.max(0, score))));
    for (let index = 1; index < scores.length; index += 1) {
        values.add((scores[index - 1] + scores[index]) / 2);
    }
    return [...values].sort((a, b) => a - b);
}

function calibrateThresholds(scoredPairs) {
    const calibrationPairs = scoredPairs.filter((pair) => !EXACT_LABELS.has(pair.label));
    if (SEMANTIC_LABELS.some((label) => !calibrationPairs.some((pair) => pair.label === label))) {
        throw new Error("Threshold calibration needs semantic, review, and missing examples.");
    }

    const candidates = candidateThresholds(calibrationPairs);
    let best = null;
    for (const reviewThreshold of candidates) {
        for (const semanticThreshold of candidates) {
            if (reviewThreshold >= semanticThreshold) continue;
            const predictions = new Map(calibrationPairs.map((pair) => [
                pair.id,
                classifyPair(pair, pair.score, { reviewThreshold, semanticThreshold }),
            ]));
            const actualMetrics = calculateClassMetrics(calibrationPairs, predictions);
            const macroF1 = SEMANTIC_LABELS.reduce((sum, label) => sum + actualMetrics.perClass[label].f1, 0) / SEMANTIC_LABELS.length;
            const tieBreak = actualMetrics.perClass[CLASSIFICATIONS.RELATED].precision;
            if (!best || macroF1 > best.macroF1 + 1e-12
                || (Math.abs(macroF1 - best.macroF1) <= 1e-12 && tieBreak > best.semanticPrecision)) {
                best = { reviewThreshold, semanticThreshold, macroF1, semanticPrecision: tieBreak };
            }
        }
    }
    if (!best) throw new Error("Unable to calibrate skill similarity thresholds.");
    return {
        reviewThreshold: best.reviewThreshold,
        semanticThreshold: best.semanticThreshold,
        calibrationMacroF1: best.macroF1,
        calibrationSemanticPrecision: best.semanticPrecision,
        calibrationPairCount: calibrationPairs.length,
    };
}

function evaluateThresholds(scoredPairs, thresholds) {
    return calculateClassMetrics(scoredPairs, new Map(scoredPairs.map((pair) => [
        pair.id,
        classifyPair(pair, pair.score, thresholds),
    ])));
}

function evaluateBaseline(scoredPairs) {
    return calculateClassMetrics(scoredPairs, new Map(scoredPairs.map((pair) => {
        const required = canonicalizeSkill(pair.requiredSkill);
        const candidate = canonicalizeSkill(pair.candidateSkill);
        if (normalizeSkillKey(required) !== normalizeSkillKey(candidate)) {
            return [pair.id, CLASSIFICATIONS.MISSING];
        }
        return [pair.id, normalizeSkillKey(pair.requiredSkill) === normalizeSkillKey(pair.candidateSkill)
            ? CLASSIFICATIONS.EXACT
            : CLASSIFICATIONS.ALIAS];
    })));
}

function evaluateLeaveOneOut(scoredPairs) {
    const predictions = new Map();
    for (const heldOut of scoredPairs) {
        const trainingPairs = scoredPairs.filter((pair) => pair.id !== heldOut.id);
        const thresholds = calibrateThresholds(trainingPairs);
        predictions.set(heldOut.id, classifyPair(heldOut, heldOut.score, thresholds));
    }
    return calculateClassMetrics(scoredPairs, predictions);
}

async function runBenchmark() {
    const dataset = readDataset();
    const texts = [...new Set(dataset.pairs.flatMap(({ requiredSkill, candidateSkill }) => [
        requiredSkill,
        candidateSkill,
    ]))];
    const { embedTexts } = require("../../src/service/embedding.service");
    const vectors = await embedTexts(texts);
    const vectorByText = new Map(texts.map((text, index) => [text, vectors[index]]));
    const scoredPairs = dataset.pairs.map((pair) => ({
        ...pair,
        score: cosineSimilarity(vectorByText.get(pair.requiredSkill), vectorByText.get(pair.candidateSkill)),
    }));
    const thresholds = calibrateThresholds(scoredPairs);
    const predictions = new Map(scoredPairs.map((pair) => [pair.id, classifyPair(pair, pair.score, thresholds)]));
    const evidenceResults = await Promise.all(dataset.evidenceCases.map(async (example) => {
        const predictedEvidence = classifySkillEvidence({
            evidence: example.evidence,
            matchedText: example.skill,
            section: example.section,
        });
        const candidateSkills = predictedEvidence === EVIDENCE_CLASSIFICATIONS.NONE ? [] : [{
            skill: example.skill,
            matchedText: example.skill,
            section: example.section,
            source: "resume",
            evidence: example.evidence,
        }];
        const [match] = await analyzeSkillMatches({
            candidateSkills,
            jobSkills: [{ skill: example.skill }],
            embedTexts: async () => { throw new Error("Evidence fixtures should not require semantic embeddings."); },
        });
        return {
            ...example,
            predictedEvidence: predictedEvidence,
            predictedMatch: match.classification,
        };
    }));
    const evidencePredictions = new Map(evidenceResults.map(({ id, predictedEvidence }) => [id, predictedEvidence]));
    const evidenceMatchPredictions = new Map(evidenceResults.map(({ id, predictedMatch }) => [id, predictedMatch]));
    const results = {
        dataset: { name: dataset.name, pairCount: scoredPairs.length },
        model: { id: require("../../src/config/embeddingChunks.vector-index.json").modelId, dimensions: vectors[0].length },
        thresholds: {
            reviewThreshold: thresholds.reviewThreshold,
            semanticThreshold: thresholds.semanticThreshold,
        },
        calibration: {
            ...thresholds,
            macroF1: thresholds.calibrationMacroF1,
            semanticPrecision: thresholds.calibrationSemanticPrecision,
            pairCount: thresholds.calibrationPairCount,
            method: "Joint macro-F1 threshold search over the labeled synthetic semantic/review/missing pairs; leave-one-out metrics are reported separately.",
        },
        comparison: {
            exactAliasBaseline: evaluateBaseline(scoredPairs),
            hybridOnCalibrationSet: calculateClassMetrics(scoredPairs, predictions),
            hybridLeaveOneOut: evaluateLeaveOneOut(scoredPairs),
        },
        relationshipCounts: Object.fromEntries([...RELATIONSHIPS].map((relationship) => [
            relationship,
            scoredPairs.filter((pair) => pair.relationship === relationship).length,
        ])),
        evidenceEvaluation: {
            evidenceClassification: calculateMetrics(
                evidenceResults.map((example) => ({ ...example, label: example.expected })),
                evidencePredictions,
                EVIDENCE_LABELS,
            ),
            matchClassification: calculateMetrics(
                evidenceResults.map((example) => ({ ...example, label: example.expectedMatch })),
                evidenceMatchPredictions,
                Object.values(CLASSIFICATIONS),
            ),
            examples: evidenceResults,
        },
        pairs: scoredPairs.map(({ id, requiredSkill, candidateSkill, label, relationship, score }) => ({
            id,
            requiredSkill,
            candidateSkill,
            expected: label,
            relationship,
            predicted: predictions.get(id),
            cosineSimilarity: score,
        })),
        limitations: [
            "This small synthetic fixture is for initial threshold calibration, not production-quality validation.",
            "Semantically Related is a reviewable association, not evidence of equivalent proficiency.",
            "Expand and independently review a representative labeled dataset before changing thresholds for production use.",
        ],
        measuredAt: new Date().toISOString(),
    };
    fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
    return results;
}

if (require.main === module) {
    runBenchmark()
        .then((results) => console.log(JSON.stringify(results, null, 2)))
        .catch((error) => {
            console.error(`Skill matching benchmark failed: ${error.stack || error.message}`);
            process.exitCode = 1;
        });
}

module.exports = {
    calibrateThresholds,
    classifyPair,
    evaluateBaseline,
    evaluateLeaveOneOut,
    evaluateThresholds,
    readDataset,
    runBenchmark,
};
