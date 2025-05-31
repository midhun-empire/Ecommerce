const express = require('express')
const router = express.Router()
const adminControler = require('../controllers/admin/adminController')
const customerController = require('../controllers/admin/customerController')
const categoryController = require('../controllers/admin/categoryController')
const productController = require('../controllers/admin/productController')
const brandController = require('../controllers/admin/brandController')
const {adminAuth} =require('../middlewares/auth')
const multer = require('multer')
const storage = require('../helpers/multer')
const uploads = multer({storage:storage})
const orderController = require('../controllers/admin/orderController')
const couponController = require('../controllers/admin/couponController')
const { route } = require('./userRouter')

router.get('/pageerror',adminControler.pageerror)
//Login Management

router.get('/login',adminControler.loadLogin)
router.post('/login',adminControler.Login)
router.get('/dashboard',adminAuth,adminControler.loadDashboard)
router.get('/logout',adminControler.Logout)
router.get("/export-pdf", adminAuth, adminControler.generatePdfReport);
router.get("/export-excel", adminAuth, adminControler.generateExcelReport);

//customer Management 
router.get('/customers',adminAuth,customerController.customerInfo)
router.get('/blockCustomer',adminAuth,customerController.customerBlocked)
router.get('/UnblockCustomer',adminAuth,customerController.customerUnBlocked)
//category Management
router.get('/category',adminAuth,categoryController.CategoryInfo)
router.post('/addCategory',adminAuth,categoryController.addCategory)
router.get('/listCategory',adminAuth,categoryController.getListCategory)
router.get('/unlistcategory',adminAuth,categoryController.getUnListcategory)
router.delete('/deleteCategory/:id',adminAuth, categoryController.deleteCategory);
router.get('/editCategory',adminAuth,categoryController.getEditCategory)
router.post('/editCategory/:id',adminAuth,categoryController.editCategory)
router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer)
router.post('/removeCategoryOffer',adminAuth,categoryController.removecategoryOffer)

//brand Management 
router.get('/brands',adminAuth,brandController.getBrandPage)
router.post('/addbrands',adminAuth,brandController.addBrands)
router.get('/blockBrand',adminAuth,brandController.blockBrand)
router.get('/unblockBrand',adminAuth,brandController.unblockBrand)
router.get('/deleteBrand',adminAuth,brandController.deleteBrand)



//product Management
router.get('/addProducts',adminAuth,productController.getProductAddPage)
router.post('/addProducts',adminAuth,uploads.array('images',4),productController.addProducts)
router.get('/products',adminAuth,productController.getProductsPage)
router.get('/blockproducts',adminAuth,productController.blockProducts)
router.get('/unblockproducts',adminAuth,productController.unblockProducts)
router.get('/editProduct',adminAuth,productController.getEditProduct)
router.post('/editProduct/:id',adminAuth,uploads.array('images',4),productController.editProduct)
router.post('/deleteImage',adminAuth,productController.deleteSingleImage)
router.get('/deleteProduct',adminAuth,productController.deleteProduct)
router.post('/addProductsOffer',adminAuth,productController.addProductsOffer)
router.post('/removeProductsOffer',adminAuth,productController.removeProductOffer)

//order management 

router.get("/orderList", adminAuth, orderController.getOrderListPageAdmin)
router.post("/changeStatus", adminAuth, orderController.changeOrderStatus);
router.post('/filter-orders', adminAuth, orderController.filterOrders);
router.get("/orderDetailsAdmin", adminAuth, orderController.getOrderDetailsPageAdmin)
router.post('/handleReturn',adminAuth,orderController.handleReturn)


//coupon Management 
router.get('/coupon',adminAuth,couponController.loadCoupon)
router.post('/createCoupon',adminAuth,couponController.createCoupon)
router.get('/editCoupons',adminAuth,couponController.getEditCoupon)
router.post('/updateCoupon',adminAuth,couponController.updateCoupon)
router.get('/deleteCoupon',adminAuth,couponController.deleteCoupon)



module.exports = router