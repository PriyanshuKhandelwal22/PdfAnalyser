
const { PDFParse } = require("pdf-parse");
const { generateInterviewReport } = require("../service/ai.service");
const {
    formatDocumentSections,
    preprocessDocument,
} = require("../service/text.preprocessing.service");
const {
    analyzeSkillMatches,
    createSkillReviewFallback,
} = require("../service/semanticSkillMatching.service");
const interviewReportModel = require("../models/interviewReport.models");

/**
 * Generate and save an interview report.
 */
async function generateInterviewReportController(req, res) {
    let pdf;

    try {
        const { jobDescription, selfDescription } = req.body;
        const resumeFile = req.file;

        if (!jobDescription?.trim()) {
            return res.status(400).json({
                message: "Job description is required.",
            });
        }

        let resumeText = "";

        if (resumeFile) {
            pdf = new PDFParse({
                data: new Uint8Array(resumeFile.buffer),
            });

            await pdf.load();

            const parsedResult = await pdf.getText();
            resumeText = parsedResult.text?.trim() || "";

            if (!resumeText) {
                return res.status(400).json({
                    message:
                        "No readable text found in the PDF. Please upload a text-based resume.",
                });
            }
        }

        if (!resumeText && !selfDescription?.trim()) {
            return res.status(400).json({
                message:
                    "Please upload a resume or provide a self-description.",
            });
        }

        if (!req.user?.id) {
            return res.status(401).json({
                message: "User authentication is required.",
            });
        }

        const resumeDocument = preprocessDocument({
            text: resumeText,
            source: "resume",
            documentType: "resume",
        });
        const selfDescriptionDocument = preprocessDocument({
            text: selfDescription,
            source: "selfDescription",
            documentType: "resume",
        });
        const jobDescriptionDocument = preprocessDocument({
            text: jobDescription,
            source: "jobDescription",
            documentType: "jobDescription",
        });

        const candidateSkillEvidence = [
            ...resumeDocument.skills,
            ...selfDescriptionDocument.skills,
        ];
        let skillMatches;
        try {
            skillMatches = await analyzeSkillMatches({
                candidateSkills: candidateSkillEvidence,
                jobSkills: jobDescriptionDocument.skills,
            });
        } catch (embeddingError) {
            console.error("Semantic skill analysis unavailable; retaining conservative review classifications.", embeddingError.message);
            skillMatches = createSkillReviewFallback({
                candidateSkills: candidateSkillEvidence,
                jobSkills: jobDescriptionDocument.skills,
            });
        }

        const interviewReportByAi = await generateInterviewReport({
            resume: formatDocumentSections(resumeDocument),
            selfDescription: formatDocumentSections(selfDescriptionDocument),
            jobDescription: formatDocumentSections(jobDescriptionDocument),
            candidateSkillEvidence,
            jobSkillEvidence: jobDescriptionDocument.skills,
        });

        const interviewReport = new interviewReportModel({
            user: req.user.id,
            resume: resumeText,
            selfDescription,
            jobDescription,
            skillMatches,
            ...interviewReportByAi,
        });

        await interviewReport.save();

        return res.status(201).json({
            message: "Interview report generated and saved successfully.",
            interviewReport,
        });
    } catch (err) {
        console.error("Error generating interview report:", err);

        return res.status(500).json({
            message: "Failed to generate interview report.",
        });
    } finally {
        if (pdf) {
            try {
                await pdf.destroy();
            } catch (cleanupError) {
                console.error("PDF parser cleanup failed:", cleanupError);
            }
        }
    }
}

/**
 * Get one report belonging to the logged-in user.
 */
async function getInterviewReportByIdController(req, res) {
    try {
        const { interviewId } = req.params;

        const interviewReport = await interviewReportModel.findOne({
            _id: interviewId,
            user: req.user.id,
        });

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found.",
            });
        }

        return res.status(200).json({
            message: "Interview report fetched successfully.",
            interviewReport,
        });
    } catch (err) {
        console.error("Error fetching interview report:", err);

        return res.status(500).json({
            message: "Failed to fetch interview report.",
        });
    }
}

/**
 * Get all reports belonging to the logged-in user.
 */
async function getAllInterviewReportsController(req, res) {
    try {
        const interviewReports = await interviewReportModel
            .find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .select(
                "-resume -selfDescription -jobDescription -__v"
            );

        return res.status(200).json({
            message: "Interview reports fetched successfully.",
            interviewReports,
        });
    } catch (err) {
        console.error("Error fetching interview reports:", err);

        return res.status(500).json({
            message: "Failed to fetch interview reports.",
        });
    }
}

/**
 * PDF generation is not implemented yet.
 */
async function generateResumePdfController(req, res) {
    return res.status(501).json({
        message: "Resume PDF generation is not implemented yet.",
    });
}

module.exports = {
    generateInterviewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController,
};
