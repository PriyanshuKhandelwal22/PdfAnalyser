const assert = require("node:assert/strict");
const test = require("node:test");
const { CLASSIFICATIONS, analyzeSkillMatches, cosineSimilarity } = require("../src/service/semanticSkillMatching.service");

const dimensions = 384;
const thresholds = { reviewThreshold: 0.5, semanticThreshold: 0.8 };

function vector(position, value = 1) {
    const result = Array(dimensions).fill(0);
    result[position] = value;
    return result;
}

function embedByKey(values) {
    return async (texts) => texts.map((text) => values[text] || vector(383));
}

test("classifies exact skills without invoking the embedder", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [{ skill: "React", matchedText: "React", section: "experience", evidence: "Used React." }],
        jobSkills: [{ skill: "React", matchedText: "React" }],
        thresholds,
        embedTexts: async () => { throw new Error("Exact matches must not need embeddings."); },
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.EXACT);
    assert.equal(matches[0].similarity, null);
    assert.equal(matches[0].candidateEvidence, "Used React.");
});

test("classifies catalogued aliases and preserves candidate provenance", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [{ skill: "React", matchedText: "React.js", source: "resume", section: "projects", evidence: "Built with React.js." }],
        jobSkills: [{ skill: "React", matchedText: "React" }],
        thresholds,
        embedTexts: async () => { throw new Error("Alias matches must not need embeddings."); },
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.ALIAS);
    assert.equal(matches[0].candidateSource, "resume");
    assert.equal(matches[0].candidateSection, "projects");
    assert.match(matches[0].explanation, /catalogued alias/);
});

test("classifies embedding matches and retains the strongest candidate evidence", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [
            { skill: "Automated testing", matchedText: "Automated testing", source: "resume", section: "experience", evidence: "Authored automated testing suites." },
            { skill: "Unrelated item", evidence: "Used unrelated item." },
        ],
        jobSkills: [{ skill: "Software testing" }],
        thresholds,
        embedTexts: embedByKey({
            "Software testing": vector(0),
            "Automated testing": vector(0, 0.9),
            "Unrelated item": vector(1),
        }),
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.RELATED);
    assert.equal(matches[0].candidateSkill, "Automated testing");
    assert.equal(matches[0].candidateEvidence, "Authored automated testing suites.");
    assert.ok(matches[0].similarity >= thresholds.semanticThreshold);
    assert.match(matches[0].explanation, /does not establish equivalent proficiency/);
});

test("keeps neighboring technologies in review and low similarity as missing", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [{ skill: "Express.js", matchedText: "Express.js" }],
        jobSkills: [{ skill: "Node.js" }, { skill: "CSS" }],
        thresholds,
        embedTexts: embedByKey({
            "Node.js": vector(0),
            "CSS": vector(2),
            "Express.js": [0.7, Math.sqrt(0.51), ...Array(dimensions - 2).fill(0)],
        }),
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.REVIEW);
    assert.equal(matches[0].candidateSkill, "Express.js");
    assert.equal(matches[1].classification, CLASSIFICATIONS.MISSING);
    assert.equal(matches[1].candidateSkill, null);
    assert.ok(matches[1].similarity < thresholds.reviewThreshold);
});

test("does not require embeddings when no candidate evidence exists", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [],
        jobSkills: [{ skill: "Kubernetes" }],
        thresholds,
        embedTexts: async () => { throw new Error("No candidate evidence should skip embedding."); },
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.MISSING);
    assert.equal(matches[0].similarity, null);
    assert.equal(matches[0].candidateEvidenceClassification, "No Evidence");
});

test("does not treat a bare skills-list entry as practical positive evidence", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [{ skill: "Docker", matchedText: "Docker", section: "skills", evidence: "Docker" }],
        jobSkills: [{ skill: "Docker" }],
        thresholds,
        embedTexts: async () => { throw new Error("Exact terms should use their evidence classification."); },
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.REVIEW);
    assert.equal(matches[0].candidateEvidenceClassification, "Uncertain/Familiarity-only");
});

test("does not use a negated technology as semantic evidence for another requirement", async () => {
    const matches = await analyzeSkillMatches({
        candidateSkills: [{
            skill: "Docker",
            matchedText: "Docker",
            section: "experience",
            evidence: "No hands-on experience with Docker.",
        }],
        jobSkills: [{ skill: "Container orchestration" }],
        thresholds,
        embedTexts: embedByKey({
            "Container orchestration": vector(0),
            Docker: vector(0),
        }),
    });

    assert.equal(matches[0].classification, CLASSIFICATIONS.MISSING);
    assert.equal(matches[0].candidateSkill, null);
    assert.equal(matches[0].candidateEvidenceClassification, "No Evidence");
});

test("rejects malformed embedding output and invalid thresholds", async () => {
    await assert.rejects(analyzeSkillMatches({
        candidateSkills: [{ skill: "One" }],
        jobSkills: [{ skill: "Two" }],
        thresholds,
        embedTexts: async () => [[1, 0]],
    }), /384-dimensional vector/);

    await assert.rejects(analyzeSkillMatches({
        candidateSkills: [],
        jobSkills: [],
        thresholds: { reviewThreshold: 0.8, semanticThreshold: 0.7 },
    }), /0 <= reviewThreshold < semanticThreshold <= 1/);
});

test("cosine similarity validates vector shape, finiteness, and non-zero values", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.throws(() => cosineSimilarity([1], [1, 0]), /matching dimensions/);
    assert.throws(() => cosineSimilarity([0, 0], [1, 0]), /zero vector/);
    assert.throws(() => cosineSimilarity([Number.NaN], [1]), /finite numbers/);
});
