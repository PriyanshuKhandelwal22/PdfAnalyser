const express = require("express");
const router = express.Router();
const authUser = require("../middleware/auth.middleware");
const { uploadResume } = require("../middleware/file.middleware");
const { generateReportController, getUserReportsController } = require("../controllers/interview.controllers");

// POST /api/interview/generate - Generate a new report (Requires Authentication and PDF File Upload)
router.post("/generate", authUser, uploadResume, generateReportController);

// GET /api/interview/all - Get all reports for the current user (Requires Authentication)
router.get("/all", authUser, getUserReportsController);

module.exports = router;
