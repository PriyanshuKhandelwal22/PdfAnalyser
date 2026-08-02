const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.models")

async function authUser(req, res, next) {
    const token = req.cookies.token
    if (!token) {
        return res.status(401).json({
            message: "Unauthorized, token not found"
        })
    }

    // Check if token is blacklisted (user already logged out)
    const isBlacklisted = await tokenBlacklistModel.findOne({ token })
    if (isBlacklisted) {
        return res.status(401).json({
            message: "Token is invalid. Please login again"
        })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        next()
    }
    catch (err) {
        return res.status(401).json({
            message: "Unauthorized, invalid token"
        })
    }
}

module.exports = authUser