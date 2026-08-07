const interviewReportModel = require("../models/interviewReport.models");
const { generateInterviewReport } = require("../service/ai.service");
const { PDFParse } = require("pdf-parse");

/**
 * @name generateReportController
 * @description Generates an interview report using Gemini AI and saves it to the database
 * @access Private
 */
async function generateReportController(req, res) {
    try {
        const { selfDescription, jobDescription } = req.body || {};

        if (!jobDescription) {
            return res.status(400).json({
                message: "Job description is required"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                message: "Resume PDF file is required"
            });
        }

        // Parse PDF buffer to text
        let resumeText = "";
        try {
            const parser = new PDFParse({ data: req.file.buffer });
            const parsedPdf = await parser.getText();
            resumeText = parsedPdf.text;
        } catch (pdfError) {
            console.error("PDF Parsing error:", pdfError);
            return res.status(400).json({
                message: "Failed to parse PDF file. Ensure it is a valid, readable PDF.",
                error: pdfError.message
            });
        }

        // Call the AI Service to generate report
        const aiReport = await generateInterviewReport({
            resume: resumeText,
            selfDescription: selfDescription || "",
            jobDescription
        });

        // Save report to database linked to the authenticated user
        const newReport = await interviewReportModel.create({
            title: aiReport.title || "Job Interview Report",
            matchScore: aiReport.matchScore,
            technicalQuestions: aiReport.technicalQuestions,
            behavioralQuestions: aiReport.behavioralQuestions,
            skillGaps: aiReport.skillGaps,
            preparationPlan: aiReport.preparationPlan,
            resume: resumeText,
            selfDescription: selfDescription || "",
            jobDescription: jobDescription,
            user: req.user.id
        });

        return res.status(201).json({
            message: "Interview report generated successfully",
            report: newReport
        });
    } catch (err) {
        console.error("Error generating report:", err);
        return res.status(500).json({
            message: "Internal server error while generating report",
            error: err.message
        });
    }
}

/**
 * @name getUserReportsController
 * @description Fetches all interview reports for the logged-in user
 * @access Private
 */
async function getUserReportsController(req, res) {
    try {
        const reports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 });
        return res.status(200).json({
            message: "User interview reports fetched successfully",
            reports
        });
    } catch (err) {
        console.error("Error fetching reports:", err);
        return res.status(500).json({
            message: "Internal server error while fetching reports",
            error: err.message
        });
    }
}

module.exports = {
    generateReportController,
    getUserReportsController
};
