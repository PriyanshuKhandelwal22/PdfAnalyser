const mongoose = require('mongoose');


const technicalQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: [ true, "Technical question is required" ]
    },
    intention: {
        type: String,
        required: [ true, "Intention is required" ]
    },
    answer: {
        type: String,
        required: [ true, "Answer is required" ]
    }
}, {
    _id: false
})

const behavioralQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: [ true, "Technical question is required" ]
    },
    intention: {
        type: String,
        required: [ true, "Intention is required" ]
    },
    answer: {
        type: String,
        required: [ true, "Answer is required" ]
    }
}, {
    _id: false
})

const skillGapSchema = new mongoose.Schema({
    skill: {
        type: String,
        required: [ true, "Skill is required" ]
    },
    severity: {
        type: String,
        enum: [ "low", "medium", "high" ],
        required: [ true, "Severity is required" ]
    }
}, {
    _id: false
})

const skillEvidenceSchema = new mongoose.Schema({
    matchedText: { type: String, default: null },
    source: { type: String, default: null },
    section: { type: String, default: null },
    evidence: { type: String, default: null },
}, {
    _id: false,
})

const skillMatchSchema = new mongoose.Schema({
    requiredSkill: {
        type: String,
        required: true,
    },
    candidateSkill: {
        type: String,
        default: null,
    },
    classification: {
        type: String,
        enum: [ "Exact Match", "Alias Match", "Semantically Related", "Missing Skill", "Needs Review" ],
        required: true,
    },
    similarity: {
        type: Number,
        min: -1,
        max: 1,
        default: null,
    },
    candidateSource: {
        type: String,
        enum: [ "resume", "selfDescription", null ],
        default: null,
    },
    candidateSection: {
        type: String,
        default: null,
    },
    candidateEvidence: {
        type: String,
        default: null,
    },
    candidateEvidenceClassification: {
        type: String,
        enum: [ "Positive Assertion", "Negative Assertion", "Uncertain/Familiarity-only", "Learning/In-progress", "No Evidence" ],
        default: "No Evidence",
    },
    requiredEvidence: {
        type: [ skillEvidenceSchema ],
        default: [],
    },
    explanation: {
        type: String,
        required: true,
    },
}, {
    _id: false,
})

const preparationPlanSchema = new mongoose.Schema({
    day: {
        type: Number,
        required: [ true, "Day is required" ]
    },
    focus: {
        type: String,
        required: [ true, "Focus is required" ]
    },
    tasks: [ {
        type: String,
        required: [ true, "Task is required" ]
    } ]
})

const interviewReportSchema = new mongoose.Schema({
    jobDescription: {
        type: String,
        required: [ true, "Job description is required" ]
    },
    resume: {
        type: String,
    },
    selfDescription: {
        type: String,
    },
    matchScore: {
        type: Number,
        min: 0,
        max: 100,
    },
    technicalQuestions: [ technicalQuestionSchema ],
    behavioralQuestions: [ behavioralQuestionSchema ],
    skillGaps: [ skillGapSchema ],
    skillMatches: {
        type: [ skillMatchSchema ],
        default: [],
    },
    preparationPlan: [ preparationPlanSchema ],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    },
    title: {
        type: String,
        required: [ true, "Job title is required" ]
    }
}, {
    timestamps: true
})


const interviewReportModel = mongoose.model("InterviewReport", interviewReportSchema);

module.exports = interviewReportModel;
