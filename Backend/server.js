const dns = require("node:dns");

dns.setServers(["10.222.31.15"]);

require("dotenv").config()
const app =require("./src/app")
const connectToDB = require("./src/config/database")
const { resume, selfDescription, jobDescription } = require("./src/service/temp")
const { generateInterviewReport } = require("./src/service/ai.service")
connectToDB()
// generateInterviewReport({ resume, selfDescription, jobDescription })
//     .then(report => console.log("Generated Report Successfully:", report))
//     .catch(err => console.error("Error generating report:", err))
app.listen (3000,()=>{
    console.log("server Started on port 3000");
})