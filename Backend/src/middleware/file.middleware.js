const multer= require("multer")


const upload = multer({

    //temporary storage in memory, you can change it to disk storage if needed
    storage: multer.memoryStorage(),
    limits:{
        fileSize: 3 * 1024 * 1024 // 3MB
    }

})

module.exports = upload