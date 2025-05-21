const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const mongoose = require('mongoose');
const User = require('../../models/userSchema')



const productDetails = async (req, res) => {
    try {
      const userId = req.session.user;
      const userData = await User.findById(userId);
      const productId = req.params.productId;
  
      // Validate ObjectId to avoid CastError
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        console.error('Invalid product ID:', productId);
        return res.redirect('/pageNotFound');
      }
  
      const product = await Product.findById(productId).populate('category');
  
      if (!product) {
        console.error('Product not found with ID:', productId);
        return res.redirect('/pageNotFound');
      }
  
      const category = product.category;
      const categoryOffer = category?.categoryOffer || 0;
      const productOffer = product.productOffer || 0;
      const totalOffer = categoryOffer + productOffer;
  
      // Fetch related products from the same category excluding the current one
      const relatedProducts = await Product.find({
        category: category._id,
        _id: { $ne: product._id }
      }).limit(4);
  
      res.render('product-details', {
        user: userData,
        product,
        quantity: product.quantity,
        totalOffer,
        category,
        relatedProducts, // pass related products to view
        currentPage: 'product-details'
      });
  
    } catch (error) {
      console.error('Error fetching product details', error);
      res.redirect('/pageNotFound');
    }
  };
  



module.exports={
    productDetails,

}