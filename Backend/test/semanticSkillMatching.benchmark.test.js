const test = require("node:test");
const assert = require("node:assert/strict");
const {
    calibrateThresholds,
    evaluateBaseline,
    evaluateLeaveOneOut,
    readDataset,
} = require("../benchmarks/skills/benchmark");
const { CLASSIFICATIONS } = require("../src/service/semanticSkillMatching.service");

test("skill benchmark dataset has unique labeled synthetic pairs", () => {
    const dataset = readDataset();
    assert.ok(dataset.pairs.length >= 37);
    assert.equal(new Set(dataset.pairs.map(({ id }) => id)).size, dataset.pairs.length);
    assert.ok(dataset.pairs.every(({ requiredSkill, candidateSkill }) => (
        requiredSkill && candidateSkill
    )));
    assert.deepEqual(new Set(dataset.pairs.map(({ relationship }) => relationship)), new Set([
        "exact", "alias", "true_semantic", "related_non_equivalent", "unrelated", "ambiguous",
    ]));
    for (const [requiredSkill, candidateSkill] of [
        ["REST APIs", "API Development"],
        ["Frontend Development", "React.js"],
        ["Node.js", "Express.js"],
        ["Docker", "Kubernetes"],
        ["TensorFlow", "PyTorch"],
        ["Docker", "Python"],
        ["AWS", "MongoDB"],
        ["Java", "JavaScript"],
        ["React.js", "HTML"],
        ["TensorFlow", "SQL"],
        ["C++", "CPP"],
        ["Machine Learning", "ML"],
    ]) {
        assert.ok(dataset.pairs.some((pair) => pair.requiredSkill === requiredSkill && pair.candidateSkill === candidateSkill));
    }
    assert.ok(dataset.evidenceCases.some(({ expected }) => expected === "Negative Assertion"));
    assert.ok(dataset.evidenceCases.some(({ expected }) => expected === "Uncertain/Familiarity-only"));
});

test("calibration keeps deterministic baseline labels and learns semantic thresholds", () => {
    const scoredPairs = [
        { id: "exact", requiredSkill: "Python", candidateSkill: "Python", label: CLASSIFICATIONS.EXACT, score: 1 },
        { id: "alias", requiredSkill: "JavaScript", candidateSkill: "JS", label: CLASSIFICATIONS.ALIAS, score: 0.99 },
        { id: "related", requiredSkill: "React", candidateSkill: "Vue", label: CLASSIFICATIONS.RELATED, score: 0.78 },
        { id: "review", requiredSkill: "Docker", candidateSkill: "Kubernetes", label: CLASSIFICATIONS.REVIEW, score: 0.55 },
        { id: "missing", requiredSkill: "Rust", candidateSkill: "Salesforce", label: CLASSIFICATIONS.MISSING, score: 0.12 },
    ];

    const thresholds = calibrateThresholds(scoredPairs);
    assert.ok(thresholds.reviewThreshold < thresholds.semanticThreshold);
    assert.equal(evaluateBaseline(scoredPairs).perClass[CLASSIFICATIONS.EXACT].recall, 1);
    assert.equal(evaluateBaseline(scoredPairs).perClass[CLASSIFICATIONS.ALIAS].recall, 1);
    const labeledDataset = readDataset().pairs.map((pair) => ({
        ...pair,
        score: pair.label === CLASSIFICATIONS.RELATED ? 0.78
            : pair.label === CLASSIFICATIONS.REVIEW ? 0.4
                : pair.label === CLASSIFICATIONS.MISSING ? 0.12 : 1,
    }));
    assert.ok(evaluateLeaveOneOut(labeledDataset).accuracy > 0);
});
