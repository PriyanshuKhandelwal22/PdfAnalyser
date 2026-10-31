const mongoose = require("mongoose");
//set connection to database
async function connectToDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI)

        console.log("Connected to MongoDB");
        
    }
    catch (err) {
        console.error("Error connecting to MongoDB:", err);
        throw err;
    }
}

module.exports = connectToDB;
