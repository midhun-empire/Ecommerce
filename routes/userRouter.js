const express = require('express')
const  router = express.Router()
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController')
const passport = require('passport');
const {userAuth} =require('../middlewares/auth')
const productController = require('../controllers/user/productController')
const { profile } = require('console');



//login management 

router.get("/login",userController.loadLoginPage)
router.post("/login",userController.login)
router.post("/signup",userController.signup)
router.get("/signup",userController.loadSignupPage) 
router.get("/logout",userController.logout)

//home and shopping 
router.get("/", userController.loadHomepage);
router.get("/pageNotFound", userController.pageNotFound);
router.get("/shop",userController.loadShopPage);
router.get("/about", userController.loadAboutPage);
router.get("/contact", userController.loadContactPage);
router.get("/cart",userController.loadCartPage)
router.get('/filter',userController.filterProduct)
router.get('/filterPrice',userController.filterByPrice)
router.post('/search',userController.searchProducts)
router.get('/sort',userController.sort)

//product management

router.get('/productDetails/:productId', productController.productDetails);


router.get('/wishlist',userController.loadWishlist)
router.get('/profile',userController.loadProfilePage)
router.post('/verify-otp',userController.VerifyOtp)
router.post('/resend-otp',userController.resendOtp)
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/signup' }),
    userController.handleGoogleCallback
  );



//profile management 
router.get('/forgot-password',profileController.getForgotPassPage)
router.post('/forgot-email-valid',profileController.forgotEmailValid)
router.post('/verify-passForgot-otp',profileController.VerifyForgotPassOtp)
router.get('/reset-password',profileController.getResetPassPage)
router.post('/resend-forgot-otp',profileController.resendOtp)
router.post('/reset-password',profileController.postNewPassword)








module.exports= router