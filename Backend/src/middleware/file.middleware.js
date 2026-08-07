const multer = require("multer");

// Use memory storage to store files temporarily in memory
const storage = multer.memoryStorage();

// Ensure only PDF files are allowed
const fileFilter = (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
        cb(null, true);
    } else {
        cb(new Error("Only PDF files are allowed!"), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // Limit size to 5MB
    }
});

// Middleware function to handle single file upload with field name "resume"
const uploadResume = upload.single("resume");

module.exports = { uploadResume };
