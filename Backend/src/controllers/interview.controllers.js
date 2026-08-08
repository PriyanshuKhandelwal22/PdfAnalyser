const { PDFParse } = require("pdf-parse")
const { generateInterviewReport } = require("../service/ai.service")
const interviewReportModel = require("../models/interviewReport.models")



/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */
async function generateInterviewReportController(req, res) {
    try {
        const { jobDescription, selfDescription } = req.body
        const resumeFile = req.file  // from multer upload.single("resume")

        let resumeText = ""
        if (resumeFile) {
            const pdf = new PDFParse(new Uint8Array(resumeFile.buffer))
            await pdf.load()
            const parsedResult = await pdf.getText()
            resumeText = parsedResult.text
        }

        const interviewReportByAi = await generateInterviewReport({
            resume: resumeText,
            selfDescription,
            jobDescription
        })

        const interviewReport = new interviewReportModel({
            user: req.user._id,
            resume: resumeText,
            selfDescription,
            jobDescription,
            ...interviewReportByAi
        })

        await interviewReport.save()

        res.status(200).json({
            message: "Interview Report Generated Successfully",
            interviewReport
        })
    } catch (err) {
        console.error("Error generating interview report:", err)
        res.status(500).json({
            message: "Internal server error while generating report",
            error: err.message
        })
    }
}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res) {
    try {
        const { interviewId } = req.params

        const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user._id })

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        res.status(200).json({
            message: "Interview report fetched successfully.",
            interviewReport
        })
    } catch (err) {
        console.error("Error fetching interview report:", err)
        res.status(500).json({
            message: "Internal server error while fetching report",
            error: err.message
        })
    }
}

/**
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res) {
    try {
        const interviewReports = await interviewReportModel
            .find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

        res.status(200).json({
            message: "Interview reports fetched successfully.",
            interviewReports
        })
    } catch (err) {
        console.error("Error fetching all interview reports:", err)
        res.status(500).json({
            message: "Internal server error while fetching reports",
            error: err.message
        })
    }
}

/**
 * @description Controller to generate a resume PDF for a given interview report.
 */
async function generateResumePdfController(req, res) {
    try {
        const { interviewReportId } = req.params

        const interviewReport = await interviewReportModel.findOne({ _id: interviewReportId, user: req.user._id })

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        // TODO: Implement PDF generation logic here
        res.status(200).json({
            message: "Resume PDF generation is not yet implemented."
        })
    } catch (err) {
        console.error("Error generating resume PDF:", err)
        res.status(500).json({
            message: "Internal server error while generating resume PDF",
            error: err.message
        })
    }
}


module.exports = {
    generateInterviewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController
}