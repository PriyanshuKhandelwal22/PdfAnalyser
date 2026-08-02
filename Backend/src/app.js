const express = require ("express")
const cookieParser = require("cookie-parser")

const app =express()
//middleware
app.use(express.json())
app.use(cookieParser())

//require all auth routes
const authRouter = require("./routes/auth.routes")

//using auth routes
app.use("/api/auth",authRouter)

module.exports=app