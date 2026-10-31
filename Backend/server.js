require("dotenv").config()
const app =require("./src/app")
const connectToDB = require("./src/config/database")

async function startServer() {
    await connectToDB()

    const port = process.env.PORT || 3000
    app.listen(port, () => {
        console.log(`Server started on port ${port}`)
    })
}

startServer().catch((err) => {
    console.error("Server startup failed because the database connection could not be established.", err.message)
    process.exitCode = 1
})
