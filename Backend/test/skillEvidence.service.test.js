const assert = require("node:assert/strict");
const test = require("node:test");
const {
    classifySkillEvidence,
    EVIDENCE_CLASSIFICATIONS,
} = require("../src/service/skillEvidence.service");
const { analyzeSkillMatches, CLASSIFICATIONS } = require("../src/service/semanticSkillMatching.service");
const { preprocessDocument } = require("../src/service/text.preprocessing.service");

test("detects a structured negative assertion and preserves its wording", async () => {
    const evidence = "No hands-on experience with Docker.";
    assert.equal(classifySkillEvidence({ evidence, matchedText: "Docker", section: "experience" }), EVIDENCE_CLASSIFICATIONS.NEGATIVE);

    const [match] = await analyzeSkillMatches({
        candidateSkills: [{ skill: "Docker", matchedText: "Docker", section: "experience", evidence }],
        jobSkills: [{ skill: "Docker" }],
        embedTexts: async () => { throw new Error("Exact negative evidence must not use embeddings."); },
    });
    assert.equal(match.classification, CLASSIFICATIONS.MISSING);
    assert.equal(match.candidateEvidenceClassification, EVIDENCE_CLASSIFICATIONS.NEGATIVE);
    assert.equal(match.candidateEvidence, evidence);
});

test("resume preprocessing carries negated Docker evidence into Needs Review-safe matching", async () => {
    const resume = preprocessDocument({
        text: "Professional Experience\nNo hands-on experience with Docker.",
        source: "resume",
        documentType: "resume",
    });
    const [match] = await analyzeSkillMatches({
        candidateSkills: resume.skills,
        jobSkills: [{ skill: "Docker" }],
        embedTexts: async () => { throw new Error("Exact negative evidence must not use embeddings."); },
    });

    assert.equal(match.classification, CLASSIFICATIONS.MISSING);
    assert.equal(match.candidateEvidenceClassification, EVIDENCE_CLASSIFICATIONS.NEGATIVE);
    assert.equal(match.candidateSource, "resume");
    assert.equal(match.candidateSection, "experience");
    assert.equal(match.candidateEvidence, "No hands-on experience with Docker.");
});

test("classifies familiarity and limited-exposure language as uncertain", () => {
    for (const evidence of ["Familiar with Docker.", "Only basic knowledge of Docker.", "Limited experience with Docker."]) {
        assert.equal(classifySkillEvidence({ evidence, matchedText: "Docker", section: "summary" }), EVIDENCE_CLASSIFICATIONS.UNCERTAIN);
    }
});

test("classifies learning and in-progress language separately", () => {
    for (const evidence of ["Currently learning Docker.", "Studying Docker.", "Docker training in progress."]) {
        assert.equal(classifySkillEvidence({ evidence, matchedText: "Docker", section: "summary" }), EVIDENCE_CLASSIFICATIONS.LEARNING);
    }
});

test("requires an affirmative use or experience assertion for positive evidence", () => {
    for (const evidence of ["Built deployment workflows with Docker.", "I used Docker in production.", "Experienced with Docker."]) {
        assert.equal(classifySkillEvidence({ evidence, matchedText: "Docker", section: "experience" }), EVIDENCE_CLASSIFICATIONS.POSITIVE);
    }
    assert.equal(classifySkillEvidence({ evidence: "Docker", matchedText: "Docker", section: "skills" }), EVIDENCE_CLASSIFICATIONS.UNCERTAIN);
});

test("returns no evidence when the excerpt does not contain the matched skill", () => {
    assert.equal(classifySkillEvidence({ evidence: "Built a web application.", matchedText: "Docker", section: "experience" }), EVIDENCE_CLASSIFICATIONS.NONE);
});
