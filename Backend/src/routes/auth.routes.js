//aquring express module
const express = require("express");
const authController = require("../controllers/auth.controllers")
const authMiddleware = require("../middleware/auth.middleware")
//creating router instance
const authRouter = express.Router();



//creating api route for user registration
/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */

authRouter.post("/register", authController.registerUserController);


/**
 * @route POST /api/auth/login
 * @description Login a user with email and password
 * @access Public
 */
authRouter.post("/login", authController.loginUserController);

/**
 * @route GET /api/auth/logout
 * @description clear token from user cookies and add token to blacklist
 * @access Public
 */
authRouter.get("/logout", authController.logoutUserController);

/**
 * @route GET /api/auth/get-/**
  * @description Get user details from token
 * @access Private
 * 
 */

authRouter.get("/get-me", authMiddleware, authController.getMeController);
module.exports = authRouter;