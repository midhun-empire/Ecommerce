const express = require('express')
const  router = express.Router()
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController')
const passport = require('passport');
const {userAuth} =require('../middlewares/auth')
const productController = require('../controllers/user/productController')
const cartController = require('../controllers/user/cartController')
const checkoutController = require('../controllers/user/checkoutController')
const orderController = require('../controllers/user/orderController')
const wishlistController = require('../controllers/user/wishlistController')
const walletController = require('../controllers/user/walletController')
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
router.get('/filter', (req, res) => {
  const queryParams = { ...req.query };
  res.redirect(`/shop?${new URLSearchParams(queryParams).toString()}`);
});

router.get('/filterPrice', (req, res) => {
  const queryParams = { ...req.query };
  res.redirect(`/shop?${new URLSearchParams(queryParams).toString()}`);
});

router.post('/search', (req, res) => {
  const query = req.body.query || req.query.query;
  if (!query || query.trim() === '') {
    return res.redirect('/shop');
  }
  const queryParams = { ...req.query, query };
  res.redirect(`/shop?${new URLSearchParams(queryParams).toString()}`);
});

router.get('/sort', (req, res) => {
  const queryParams = { ...req.query };
  res.redirect(`/shop?${new URLSearchParams(queryParams).toString()}`);
});

//product management

router.get('/productDetails/:productId',productController.productDetails);
router.post('/cart/add', userAuth,cartController.addToCart);

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
router.get('/profile',userAuth,profileController.loadProfilePage)
router.get('/change-email',userAuth,profileController.changeEmail)
router.post('/change-email',userAuth,profileController.changeEmailValid)
router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp)
router.get('/new-email',userAuth,profileController.newEmail)
router.post('/update-email',userAuth,profileController.updateEmail)
router.get('/change-password',userAuth,profileController.changePassword)
router.get('/change-password',userAuth,profileController.changePassword)
router.post('/change-password',userAuth,profileController.changePasswordValid)
router.post('/verify-changepassword-otp',userAuth,profileController.verifyChangePasswordOtp)
router.get('/getOrders',userAuth,profileController.loadProfileOrder)

//address management 
router.get('/addAddress',userAuth,profileController.addAddress)
router.post('/addAddress',userAuth,profileController.postAddAddress)
router.get('/editAddress',userAuth,profileController.editAddress)
router.post('/editAddress',userAuth,profileController.postEditAddress)
router.get('/deleteAddress',userAuth,profileController.deleteAddress)

//cart management
router.get("/cart",userAuth,cartController.loadCartPage)
router.post('/remove-product',userAuth,cartController.removeProduct)
router.post('/addToCart',userAuth,cartController.addToCart)
router.post('/update-quantity', userAuth, cartController.updateCartQuantity); 

//checkout management

router.get('/checkout',userAuth,checkoutController.getCheckoutPage)
router.post('/checkout-addAddress',userAuth,checkoutController.checkoutAddAddress)
router.post('/checkout-editAddress',userAuth,checkoutController.checkoutEditAddress)


//order management 
router.post('/place-order',userAuth,orderController.placeOrder)
router.get('/order-success/:orderId',userAuth,orderController.orderSuccessPage)
router.get('/order-details/:orderId',userAuth,orderController.getOrderDetails)
router.get('/download-invoice/:orderId',userAuth,orderController.generateInvoice )
router.post('/cancel-product',userAuth,orderController.cancelProductOrder)
router.post('/return-product', orderController.returnProduct);
router.post('/verify-payment',userAuth,orderController.verifyPayment);
router.get('/payment-failed/:orderId',userAuth,orderController.handleFailedPayment);
router.post('/retry-payment',userAuth,orderController.retryPayment);
router.post('/verify-retry-payment',userAuth,orderController.verifyRetryPayment)
                                                                                  

//wishlist Mmanagement
router.get('/wishlist',userAuth,wishlistController.loadWishlist)
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist)
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct);

//coupon management 

router.get('/get-available-coupons',userAuth,checkoutController.getAvailableCoupons)
router.post('/applycouponcode',userAuth,checkoutController.applyCoupon);
router.post('/removecoupon',userAuth,checkoutController.removeCoupon);


// wallet management

router.post("/addMoney",userAuth, walletController.addMoneyToWallet);
router.post('/verifyPayment', userAuth, walletController.verifyWalletPayment);
router.get('/walletDetails', userAuth, walletController.getWalletDetails);
router.get('/get-wallet-balance',userAuth,walletController.getWalletBalanceOrder)

module.exports= router