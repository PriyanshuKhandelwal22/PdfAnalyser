
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const interviewController = require("../controllers/interview.controllers");
const uploadResume = require("../middleware/file.middleware");

const interviewRouter = express.Router();

/**
 * POST /api/interview/
 * Generate a new interview report.
 */
interviewRouter.post(
    "/",
    authMiddleware,
    uploadResume,
    interviewController.generateInterviewReportController
);

/**
 * GET /api/interview/all
 * Get all reports belonging to the logged-in user.
 */
interviewRouter.get(
    "/all",
    authMiddleware,
    interviewController.getAllInterviewReportsController
);

/**
 * GET /api/interview/:interviewId
 * Get a single report belonging to the logged-in user.
 */
interviewRouter.get(
    "/:interviewId",
    authMiddleware,
    interviewController.getInterviewReportByIdController
);

/**
 * POST /api/interview/resume/pdf/:interviewReportId
 * PDF generation is not implemented yet.
 */
interviewRouter.post(
    "/resume/pdf/:interviewReportId",
    authMiddleware,
    interviewController.generateResumePdfController
);

module.exports = interviewRouter;
