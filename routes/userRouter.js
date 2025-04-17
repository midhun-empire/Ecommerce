const express = require('express')
const  router = express.Router()
const userController = require('../controllers/user/userController')




router.get("/", userController.loadHomepage);
router.get("/pageNotFound", userController.pageNotFound);
router.get("/shop", userController.loadShopPage);
router.get("/about", userController.loadAboutPage);
router.get("/contact", userController.loadContactPage);
router.get("/cart",userController.loadCartPage)
router.get("/signup",userController.loadSignupPage)
router.get("/login",userController.loadLoginPage)
router.post("/signup",userController.signup)
router.get('/wishlist',userController.loadWishlist)
router.get('/profile',userController.loadProfilePage)










module.exports= router