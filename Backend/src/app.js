const express = require ("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

const app =express()
//middleware
app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))

//require all auth routes
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")

//using routes
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)

module.exports = app