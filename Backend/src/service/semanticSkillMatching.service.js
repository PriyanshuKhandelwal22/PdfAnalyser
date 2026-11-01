const matchingConfig = require("../config/semanticSkillMatching.json");
const { embedTexts: defaultEmbedTexts } = require("./embedding.service");
const { canonicalizeSkill, normalizeSkillKey } = require("./text.preprocessing.service");

const CLASSIFICATIONS = Object.freeze({
    EXACT: "Exact Match",
    ALIAS: "Alias Match",
    RELATED: "Semantically Related",
    MISSING: "Missing Skill",
    REVIEW: "Needs Review",
});

function readSkill(value, label) {
    const entry = typeof value === "string" ? { skill: value, matchedText: value } : value;
    if (!entry || typeof entry.skill !== "string" || !entry.skill.trim()) {
        throw new TypeError(`${label} entries must contain a non-empty skill string.`);
    }

    const matchedText = typeof entry.matchedText === "string" && entry.matchedText.trim()
        ? entry.matchedText.trim()
        : entry.skill.trim();
    return {
        skill: canonicalizeSkill(entry.skill),
        matchedText,
        source: typeof entry.source === "string" ? entry.source : null,
        section: typeof entry.section === "string" ? entry.section : null,
        evidence: typeof entry.evidence === "string" ? entry.evidence : null,
    };
}

function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
        throw new TypeError("Embedding vectors must be non-empty arrays with matching dimensions.");
    }

    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) {
            throw new TypeError("Embedding vectors must contain only finite numbers.");
        }
        dot += left[index] * right[index];
        leftNorm += left[index] ** 2;
        rightNorm += right[index] ** 2;
    }
    if (leftNorm === 0 || rightNorm === 0) {
        throw new TypeError("Cosine similarity cannot be calculated for a zero vector.");
    }
    return dot / Math.sqrt(leftNorm * rightNorm);
}

function validateThresholds(thresholds) {
    const { reviewThreshold, semanticThreshold } = thresholds;
    if (!Number.isFinite(reviewThreshold) || !Number.isFinite(semanticThreshold)
        || reviewThreshold < 0 || semanticThreshold > 1 || reviewThreshold >= semanticThreshold) {
        throw new RangeError("Thresholds must satisfy 0 <= reviewThreshold < semanticThreshold <= 1.");
    }
}

function exactOrAlias(candidateSkills, requiredSkill) {
    const canonicalKey = normalizeSkillKey(requiredSkill.skill);
    const candidates = candidateSkills.filter((candidate) => (
        normalizeSkillKey(candidate.skill) === canonicalKey
    ));
    if (!candidates.length) return null;

    const requiredTextKey = normalizeSkillKey(requiredSkill.matchedText);
    return candidates.find((candidate) => normalizeSkillKey(candidate.matchedText) === requiredTextKey)
        || candidates[0];
}

function describeMatch(requiredSkill, candidateSkill, classification, similarity = null) {
    const reason = {
        [CLASSIFICATIONS.EXACT]: `Candidate evidence explicitly names ${candidateSkill?.matchedText || "the required skill"}.`,
        [CLASSIFICATIONS.ALIAS]: `${candidateSkill?.matchedText || "Candidate evidence"} is a catalogued alias of ${requiredSkill.skill}.`,
        [CLASSIFICATIONS.RELATED]: `Candidate evidence for ${candidateSkill?.skill || "a skill"} is semantically similar; this does not establish equivalent proficiency.`,
        [CLASSIFICATIONS.REVIEW]: `Candidate evidence is near the calibrated similarity boundary and needs human review.`,
        [CLASSIFICATIONS.MISSING]: `No candidate skill evidence met the calibrated review threshold for ${requiredSkill.skill}.`,
    }[classification];

    return {
        requiredSkill: requiredSkill.skill,
        candidateSkill: candidateSkill?.matchedText || null,
        classification,
        similarity,
        candidateSource: candidateSkill?.source || null,
        candidateSection: candidateSkill?.section || null,
        candidateEvidence: candidateSkill?.evidence || null,
        explanation: reason,
    };
}

async function analyzeSkillMatches({
    candidateSkills,
    jobSkills,
    embedTexts = defaultEmbedTexts,
    thresholds = matchingConfig,
} = {}) {
    if (!Array.isArray(candidateSkills) || !Array.isArray(jobSkills)) {
        throw new TypeError("candidateSkills and jobSkills must be arrays.");
    }
    validateThresholds(thresholds);

    const candidates = candidateSkills.map((entry) => readSkill(entry, "candidateSkills"));
    const requirements = jobSkills.map((entry) => readSkill(entry, "jobSkills"));
    const exactMatches = new Map();
    const unmatchedRequirements = [];

    for (const requiredSkill of requirements) {
        const candidateSkill = exactOrAlias(candidates, requiredSkill);
        if (candidateSkill) {
            const classification = normalizeSkillKey(candidateSkill.matchedText)
                === normalizeSkillKey(requiredSkill.matchedText)
                ? CLASSIFICATIONS.EXACT
                : CLASSIFICATIONS.ALIAS;
            exactMatches.set(requiredSkill, describeMatch(requiredSkill, candidateSkill, classification));
        } else {
            unmatchedRequirements.push(requiredSkill);
        }
    }

    if (!unmatchedRequirements.length || !candidates.length) {
        return requirements.map((requiredSkill) => exactMatches.get(requiredSkill)
            || describeMatch(requiredSkill, null, CLASSIFICATIONS.MISSING));
    }

    if (typeof embedTexts !== "function") {
        throw new TypeError("embedTexts must be a function.");
    }
    const termByKey = new Map();
    for (const skill of [...unmatchedRequirements, ...candidates]) {
        termByKey.set(normalizeSkillKey(skill.skill), skill.skill);
    }
    const terms = [...termByKey.values()];
    const vectors = await embedTexts(terms);
    if (!Array.isArray(vectors) || vectors.length !== terms.length || vectors.some((vector) => (
        !Array.isArray(vector)
        || vector.length !== matchingConfig.dimensions
        || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
        || !vector.some((value) => value !== 0)
    ))) {
        throw new TypeError(`embedTexts must return one non-zero finite ${matchingConfig.dimensions}-dimensional vector per input.`);
    }
    const vectorByKey = new Map(terms.map((term, index) => [normalizeSkillKey(term), vectors[index]]));

    const semanticMatches = new Map();
    for (const requiredSkill of unmatchedRequirements) {
        let best = null;
        for (const candidateSkill of candidates) {
            const similarity = cosineSimilarity(
                vectorByKey.get(normalizeSkillKey(requiredSkill.skill)),
                vectorByKey.get(normalizeSkillKey(candidateSkill.skill)),
            );
            if (!best || similarity > best.similarity) best = { candidateSkill, similarity };
        }

        const classification = best.similarity >= thresholds.semanticThreshold
            ? CLASSIFICATIONS.RELATED
            : best.similarity >= thresholds.reviewThreshold
                ? CLASSIFICATIONS.REVIEW
                : CLASSIFICATIONS.MISSING;
        semanticMatches.set(requiredSkill, describeMatch(
            requiredSkill,
            classification === CLASSIFICATIONS.MISSING ? null : best.candidateSkill,
            classification,
            best.similarity,
        ));
    }

    return requirements.map((requiredSkill) => exactMatches.get(requiredSkill)
        || semanticMatches.get(requiredSkill));
}

function createSkillReviewFallback({ candidateSkills, jobSkills } = {}) {
    if (!Array.isArray(candidateSkills) || !Array.isArray(jobSkills)) {
        throw new TypeError("candidateSkills and jobSkills must be arrays.");
    }
    const candidates = candidateSkills.map((entry) => readSkill(entry, "candidateSkills"));
    return jobSkills.map((entry) => {
        const requiredSkill = readSkill(entry, "jobSkills");
        const candidateSkill = exactOrAlias(candidates, requiredSkill);
        if (candidateSkill) {
            const classification = normalizeSkillKey(candidateSkill.matchedText)
                === normalizeSkillKey(requiredSkill.matchedText)
                ? CLASSIFICATIONS.EXACT
                : CLASSIFICATIONS.ALIAS;
            return describeMatch(requiredSkill, candidateSkill, classification);
        }
        return {
            ...describeMatch(requiredSkill, null, CLASSIFICATIONS.REVIEW),
            explanation: "Local embedding inference was unavailable; semantic coverage needs human review.",
        };
    });
}

module.exports = {
    CLASSIFICATIONS,
    analyzeSkillMatches,
    cosineSimilarity,
    createSkillReviewFallback,
};
