const assert = require("node:assert/strict");
const test = require("node:test");
const InterviewReport = require("../src/models/interviewReport.models");

function reportWithMatch(match) {
    return new InterviewReport({
        title: "Synthetic role",
        jobDescription: "Synthetic job description",
        skillMatches: [{
            requiredSkill: "Synthetic required skill",
            classification: "Missing Skill",
            explanation: "Synthetic test result.",
            ...match,
        }],
    });
}

test("skill match schema accepts signed cosine similarity and known classifications", async () => {
    const report = reportWithMatch({ similarity: -0.25 });
    await assert.doesNotReject(report.validate());
});

test("skill match schema rejects out-of-range similarity and unknown classifications", async () => {
    const report = reportWithMatch({ similarity: 1.01, classification: "Unclassified" });
    const error = await report.validate().catch((validationError) => validationError);
    assert.ok(error.errors);
    assert.ok(error.errors["skillMatches.0.similarity"]);
    assert.ok(error.errors["skillMatches.0.classification"]);
});
