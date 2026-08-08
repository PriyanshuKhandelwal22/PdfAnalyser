const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const interviewController = require("../controllers/interview.controllers")
const upload = require("../middleware/file.middleware")

const interviewRouter = express.Router()


/**
 * @route POST /api/interview/
 * @description Generate a new interview report (multipart/form-data with optional resume PDF)
 * @access Private
 */
interviewRouter.post(
    "/",
    authMiddleware,
    upload.single("resume"),
    interviewController.generateInterviewReportController
)

/**
 * @route GET /api/interview/all
 * @description Get all interview reports of the logged-in user
 * @access Private
 */
interviewRouter.get(
    "/all",
    authMiddleware,
    interviewController.getAllInterviewReportsController
)

/**
 * @route GET /api/interview/:interviewId
 * @description Get a single interview report by ID
 * @access Private
 */
interviewRouter.get(
    "/:interviewId",
    authMiddleware,
    interviewController.getInterviewReportByIdController
)

/**
 * @route POST /api/interview/resume/pdf/:interviewReportId
 * @description Generate a resume PDF for a given interview report
 * @access Private
 */
interviewRouter.post(
    "/resume/pdf/:interviewReportId",
    authMiddleware,
    interviewController.generateResumePdfController
)

module.exports = interviewRouter
