const EVIDENCE_CLASSIFICATIONS = Object.freeze({
    POSITIVE: "Positive Assertion",
    NEGATIVE: "Negative Assertion",
    UNCERTAIN: "Uncertain/Familiarity-only",
    LEARNING: "Learning/In-progress",
    NONE: "No Evidence",
});

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMention(evidence, matchedText) {
    if (typeof evidence !== "string" || typeof matchedText !== "string" || !matchedText.trim()) {
        return null;
    }
    const pattern = escapeRegExp(matchedText.trim()).replace(/\s+/g, "\\s+");
    const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?=$|[^\\p{L}\\p{N}])`, "iu").exec(evidence);
    if (!match) return null;
    const start = match.index + match[1].length;
    return { start, end: start + match[2].length };
}

function getClauseContext(value) {
    return value.split(/[;.!?\n]/).at(-1).trim().toLowerCase();
}

function getFollowingClauseContext(value) {
    return value.split(/[;.!?\n]/)[0].trim().toLowerCase();
}

function classifySkillEvidence({ evidence, matchedText, section } = {}) {
    if (typeof evidence !== "string" || !evidence.trim()) {
        return EVIDENCE_CLASSIFICATIONS.NONE;
    }
    const mention = findMention(evidence, matchedText);
    if (!mention) return EVIDENCE_CLASSIFICATIONS.NONE;

    const before = getClauseContext(evidence.slice(Math.max(0, mention.start - 120), mention.start));
    const after = getFollowingClauseContext(evidence.slice(mention.end, mention.end + 100));

    const negativeBefore = /(?:\bno\s+(?:(?:prior|previous|practical|hands[- ]on|professional|direct|any|real|workplace|industry)\s+)*(?:experience|proficiency|knowledge|exposure|familiarity|skills?)\s+(?:(?:with|in|of|using)\s*)?|\bwithout\s+(?:(?:prior|previous|practical|hands[- ]on|professional|any)\s+)?(?:experience|proficiency|knowledge|exposure|familiarity)\s+(?:(?:with|in|of|using)\s*)?|\b(?:lack|lacks|lacked|lacking)\s+(?:of\s+)?(?:(?:prior|previous|practical|hands[- ]on|professional|any)\s+)?(?:experience|proficiency|knowledge|exposure|familiarity)\s+(?:(?:with|in|of|using)\s*)?|\b(?:not|never|haven't|hasn't|hadn't|didn't|doesn't|don't)\s+(?:(?:ever|previously)\s+)?(?:used|use|worked\s+(?:with|on)|experienced|proficient|familiar|skilled|comfortable|knowledgeable)(?:\s+(?:with|in|at|using))?\s*|\bnot\s+(?!only\b))$/i.test(before);
    const negativeAfter = /^\s*(?:(?:is|was|were|has been|have been)\s+)?(?:not|never)\s+(?:used|utilized|supported|implemented|experienced|proficient|familiar|skilled|available)\b/i.test(after);
    if (negativeBefore || negativeAfter) return EVIDENCE_CLASSIFICATIONS.NEGATIVE;

    const learningBefore = /\b(?:currently\s+)?(?:learning|studying|training|taking\s+(?:a\s+)?course|working\s+toward)(?:\s+(?:about|to\s+use|in|on|with))?$/i.test(before);
    const learningAfter = /^\s*(?:(?:is|am|are)\s+)?(?:currently\s+)?(?:learning|studying|training|in\s+progress)\b/i.test(after);
    if (learningBefore || learningAfter) return EVIDENCE_CLASSIFICATIONS.LEARNING;

    const uncertainBefore = /\b(?:familiar\s+with|basic\s+knowledge\s+of|some\s+knowledge\s+of|limited\s+experience\s+with|exposure\s+to|aware\s+of|beginner(?:'s)?\s+(?:in|with)|novice\s+with|understanding\s+of|little\s+experience\s+with)\s*$/i.test(before);
    const uncertainAfter = /^\s*(?:(?:only|some|basic|limited)\s+)?(?:familiarity|exposure|knowledge)\b/i.test(after);
    if (uncertainBefore || uncertainAfter) return EVIDENCE_CLASSIFICATIONS.UNCERTAIN;

    // A skills-list entry is a self-reported keyword, not evidence of practical use.
    if (typeof section === "string" && /^(?:skills|technologies|technical skills|core skills|skills and technologies|technical skills and tools)$/i.test(section.trim())) {
        return EVIDENCE_CLASSIFICATIONS.UNCERTAIN;
    }

    const positiveAssertion = /\b(?:experienced|proficient|skilled|expert|certified)\s+(?:in|with|at)\s*$/i.test(before);
    const positiveAction = /\b(?:built|developed|designed|implemented|deployed|maintained|operated|configured|administered|managed|used|created|delivered|debugged|optimized|tested|integrated|migrated|automated|wrote|authored|led|supported|contributed|worked\s+(?:with|on))\b(?:\s+[\w+#.-]+){0,7}$/i.test(before)
        || /^\s*(?:(?:was|were|is|are)\s+)?(?:successfully\s+)?(?:used|implemented|configured|deployed|integrated|maintained|tested)\b/i.test(after);
    if (positiveAssertion || positiveAction) return EVIDENCE_CLASSIFICATIONS.POSITIVE;

    return EVIDENCE_CLASSIFICATIONS.UNCERTAIN;
}

module.exports = { EVIDENCE_CLASSIFICATIONS, classifySkillEvidence };
