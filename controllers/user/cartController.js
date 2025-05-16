const User = require('../../models/userSchema');
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const mongoose = require('mongoose');


const addToCart = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized. Please log in first." });
      }
  
      const { productId, quantity } = req.body;
      const qty = parseInt(quantity) || 1;
  
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
  
      let cart = await Cart.findOne({ userId });
      if (!cart) {
        cart = new Cart({ userId, items: [] });
      }
  
      const existingItemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId
      );
  
      if (existingItemIndex >= 0) {
        cart.items[existingItemIndex].quantity += qty;
        cart.items[existingItemIndex].totalPrice =
          cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].price;
      } else {
        cart.items.push({
          productId,
          quantity: qty,
          price: product.salePrice,
          totalPrice: product.salePrice * qty,
        });
      }
  
      await cart.save();
      return res.status(200).json({ message: "Product added to cart successfully." });
  
    } catch (error) {
      console.error("Add to Cart Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
  


  const loadCartPage = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) {
        console.log('No user ID in session, redirecting to login');
        return res.redirect('/login');
      }
  
      const userData = await User.findById(userId).select('name walletBalance address');
      if (!userData) {
        console.log('User not found for ID:', userId);
        return res.redirect('/login');
      }
  
      const page = parseInt(req.query.page) || 1;
      const itemsPerPage = 6;
      const skip = (page - 1) * itemsPerPage;
  
      const cartDoc = await Cart.findOne({ userId })
        .populate({
          path: 'items.productId',
          select: 'productName salePrice productImage quantity isBlocked brand',  // Include brand
          populate: {
            path: 'brand',
            select: 'brandname', // Get brandName from Brand model
          }
        })
        .lean();
  
      let cart = [];
      let grandTotal = 0;
      let totalItems = 0;
  
      if (cartDoc && cartDoc.items.length > 0) {
        cart = cartDoc.items
          .filter(item => item.productId && !item.productId.isBlocked) // 🚫 Filter out blocked
          .map(item => {
            const product = item.productId;
            const itemTotal = item.quantity * item.price;
            grandTotal += itemTotal;
            totalItems += 1;

            // console.log('Product:', product);
            // console.log('Brand:', product.brand);
  
            return {
              productId: product._id,
              productName: product.productName,
              productImage: product.productImage || [],
              brand: product.brand ? product.brand.brandname : 'N/A', // Use brand.brandName
              quantity: item.quantity,
              salePrice: item.price,
              totalPrice: itemTotal,
            };
          });
  
        // Pagination after filtering
        cart = cart.slice(skip, skip + itemsPerPage);
      }
  
      const deliveryCharge = grandTotal >= 2000 ? 0 : 100;
      const totalWithDelivery = grandTotal + deliveryCharge;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
  
      res.render('cart', {
        user: userData,
        userAddress: userData,
        cart,
        grandTotal: grandTotal.toFixed(2),
        deliveryCharge,
        totalWithDelivery: totalWithDelivery.toFixed(2),
        currentPage: page,
        totalPages,
        itemsPerPage,
        totalItems,
      });
    } catch (error) {
      console.error('Error loading cart page:', error);
      res.redirect('/pageNotFound');
    }
  };

  
  const removeProduct = async (req, res) => {
    try {
      const userId = req.session.user;
      const { productId } = req.body;
  
      const result = await Cart.updateOne(
        { userId },
        {
          $pull: {
            items: {
              productId,
            },
          },
        }
      );
  
      if (result.modifiedCount === 0) {
        console.log(' Product not found in cart');
      }
  
      res.redirect('/cart');
    } catch (error) {
      console.error(' Error Deleting Product from Cart:', error);
      res.redirect('/pageNotFound');
    }
  };
  
  
  const updateCartQuantity = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized. Please log in first." });
      }
  
      const { productId,  action } = req.body;
  
      const cart = await Cart.findOne({ userId });
      if (!cart) {
        return res.status(404).json({ message: "Cart not found" });
      }
  
    
  
      if (!item) {
        return res.status(404).json({ message: "Item not found in cart" });
      }
  
      if (action === 'increase') {
        item.quantity += 1;
      } else if (action === 'decrease' && item.quantity > 1) {
        item.quantity -= 1;
      }
  
      item.totalPrice = item.quantity * item.price;
  
      await cart.save();
      return res.status(200).json({
        message: "Cart updated successfully",
        quantity: item.quantity,
        totalPrice: item.totalPrice,
      });
  
    } catch (error) {
      console.error("Update Cart Quantity Error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
  


  module.exports={
    addToCart,
    loadCartPage,
    removeProduct,
    updateCartQuantity
  }