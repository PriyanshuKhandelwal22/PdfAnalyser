
const multer = require("multer");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
    },
    fileFilter: (req, file, cb) => {
        // Initial check only; actual file content is checked below.
        const isPdf =
            file.mimetype === "application/pdf" &&
            file.originalname.toLowerCase().endsWith(".pdf");

        if (!isPdf) {
            return cb(new Error("Only PDF files are allowed."));
        }

        cb(null, true);
    },
});

// Verify the actual file signature, not just its extension or MIME type.
function uploadResume(req, res, next) {
    upload.single("resume")(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                const message =
                    err.code === "LIMIT_FILE_SIZE"
                        ? "Resume must be 5 MB or smaller."
                        : "Invalid file upload.";

                return res.status(400).json({ message });
            }

            return res.status(400).json({
                message: err.message || "Invalid resume file.",
            });
        }

        if (!req.file) {
            return next();
        }

        const signature = req.file.buffer.subarray(0, 5).toString("ascii");

        if (signature !== "%PDF-") {
            return res.status(400).json({
                message: "The uploaded file is not a valid PDF.",
            });
        }

        next();
    });
}

module.exports = uploadResume;
