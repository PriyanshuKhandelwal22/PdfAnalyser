const mongoose = require("mongoose");

const blacklistSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, "token is required to get added to blacklist"]
    }
}, {
    timestamps: true
})

const tokenBlacklistModel = mongoose.model("TokenBlacklist", blacklistSchema)

module.exports = tokenBlacklistModel