const Product = require('../../models/productSchema')
const Cart = require('../../models/cartSchema')
const User  = require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const mongoose = require('mongoose')
const Coupon = require('../../models/couponSchema')


// const getCheckoutPage = async (req, res) => {
//     try {
//       const userId = req.session.user;
//       if (!userId) {
//         console.log('No user ID in session, redirecting to login');
//         return res.redirect('/login');
//       }
  
//       const userData = await User.findById(userId).select('name walletBalance address');
//       if (!userData) {
//         console.log('User not found for ID:', userId);
//         return res.redirect('/login');
//       }
  
//       const cartDoc = await Cart.findOne({ userId })
//         .populate({
//           path: 'items.productId',
//           select: 'productName salePrice productImage quantity isBlocked brand',
//           populate: {
//             path: 'brand',
//             select: 'brandname',
//           },
//         })
//         .lean();
  
//       let cart = [];
//       let grandTotal = 0;
  
//       if (cartDoc && cartDoc.items.length > 0) {
//         cart = cartDoc.items
//           .filter(item => 
//             item.productId &&
//             !item.productId.isBlocked &&
//             item.productId.quantity > 0 // ❗ Exclude out-of-stock
//           )
//           .map(item => {
//             const product = item.productId;
//             const itemTotal = item.quantity * item.price;
//             grandTotal += itemTotal;
  
//             return {
//               productId: product._id,
//               productName: product.productName,
//               productImage: product.productImage || [],
//               brand: product.brand ? product.brand.brandname : 'N/A',
//               quantity: item.quantity,
//               salePrice: item.price,
//               totalPrice: itemTotal,
//             };
//           });
//       }
  
//       const deliveryCharge = grandTotal >= 2000 ? 0 : 100;
//       const total = grandTotal + deliveryCharge;
//       const taxRate = 0.02; 
//       const subtotal = cartItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
//       const tax = subtotal * taxRate;
//       let shipping = subtotal >= 2000 ? 0 : 100; 
//       let discount = 0;
//       let couponCode = null;
//       let appliedCoupon = null;
      
//       res.render('checkout', {
//         currentPage:'checkout',
//         user: userData,
//         userAddress: userData.address,
//         addresses: userData.address,
//         cart,
//         grandTotal: grandTotal.toFixed(2),
//         deliveryCharge,
//         total: total.toFixed(2),
//         subtotal: grandTotal
//       });
  
//     } catch (error) {
//       console.error('Error loading checkout page:', error);
//       res.redirect('/pageNotFound');
//     }
//   };
  
const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.redirect('/login?message=Please log in to proceed to checkout');
    }

    const user = await User.findById(userId).select('name email').lean();
    if (!user) {
      return res.redirect('/login?message=User not found');
    }

    const userAddress = await Address.findOne({ userId }).lean();

    const userCart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        select: 'productName salePrice productImage quantity isBlocked',
      })
      .lean();

    if (!userCart || userCart.items.length === 0) {
      return res.redirect('/cart?message=Your cart is empty');
    }

    // Map cart items and validate stock
    const cartItems = [];
    let outOfStockItems = [];
    console.log('Cart items:', userCart.items.map(item => ({
      productId: item.productId?._id?.toString(),
      quantity: item.quantity,
      totalPrice: item.totalPrice,
    })));

    for (const item of userCart.items) {
      if (!item.productId || item.productId.isBlocked) {
        continue; // Skip blocked or invalid products
      }

      if (item.quantity > (item.productId.quantity || 0)) {
        outOfStockItems.push({
          productName: item.productId.productName,
          available: item.productId.quantity || 0,
        });
        continue;
      }

      if (typeof item.totalPrice !== 'number' || isNaN(item.totalPrice)) {
        console.warn(`Invalid totalPrice for product ${item.productId._id}: ${item.totalPrice}`);
        continue; // Skip items with invalid totalPrice
      }

      cartItems.push({
        productId: item.productId._id,
        productName: item.productId.productName,
        productImage: item.productId.productImage || [],
        quantity: item.quantity,
        price: item.price,
        salePrice: item.productId.salePrice,
        totalPrice: item.totalPrice,
        quantityAvailable: item.productId.quantity,
      });
    }

    if (cartItems.length === 0) {
      if (outOfStockItems.length > 0) {
        const message = outOfStockItems
          .map(item => `${item.productName} has only ${item.available} units available`)
          .join(', ');
        return res.redirect(`/cart?message=${encodeURIComponent(message)}`);
      }
      return res.redirect('/cart?message=All items in your cart are unavailable');
    }

    // Calculate totals
    const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0) || 0;
    const taxRate = 0.02; // Adjust as needed
    const tax = subtotal * taxRate;
    const shipping = subtotal >= 50000 ? 0 : 140;
    let discount = 0;
    let couponCode = null;
    let appliedCoupon = null;

    const total = subtotal + shipping + tax - discount;

    res.render('checkout', {
      currentPage: 'checkout',
      addresses: userAddress ? userAddress.address : [],
      cartItems,
      subtotal,
      shipping,
      tax,
      discount,
      couponCode,
      appliedCoupon,
      total,
      user,
    });
  } catch (error) {
    console.error("Error in getCheckout:", error.name, error.message, error.stack);
    res.redirect('/cart');
  }
};








const checkoutAddAddress = async (req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findOne({ _id: userId });
    
        const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;
    
        const userAddress = await Address.findOne({ userId: userData._id });
    
        if (!userAddress) {
          // First address for this user
          const newAddress = new Address({
            userId: userData._id,
            address: [{
              addressType,
              name,
              city,
              landMark,
              state,
              pincode,
              phone,
              altPhone
            }]
          });
          await newAddress.save();
        } else {
          // User already has addresses — push new one
          userAddress.address.push({
            addressType,
            name,
            city,
            landMark,
            state,
            pincode,
            phone,
            altPhone
          });
          await userAddress.save();
        }
    
        res.redirect('/checkout');
      } catch (error) {
        console.error('Error adding address:', error);
        res.redirect('/pageNotFound');
      }
}


const checkoutEditAddress = async (req,res)=>{
    try {
        const data = req.body;
        const addressId = req.body.addressId;
        const user = req.session.user;
    
        const findAddress = await Address.findOne({ 'address._id': addressId });
    
        if (!findAddress) {
          return res.redirect('/pageNotFound');
        }
    
        await Address.updateOne(
          { 'address._id': addressId },
          {
            $set: {
              'address.$.addressType': data.addressType,
              'address.$.name': data.name,
              'address.$.city': data.city,
              'address.$.landMark': data.landMark,
              'address.$.state': data.state,
              'address.$.pincode': data.pincode,
              'address.$.phone': data.phone,
              'address.$.altPhone': data.altPhone
            }
          }
        );
    
        res.redirect('/checkout');
      } catch (error) {
        console.error('Error in editing address:', error);
        res.redirect('/pageNotFound');
      }
}


const getAvailableCoupons = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // normalize time

    const userId = req.user?._id; // assuming user is logged in and available in req.user

    const coupons = await Coupon.find({
      islisted: true,
      createdOn: { $lte: today },
      expireOn: { $gte: today },
      // Exclude coupons already used by this user (optional)
      ...(userId && { userId: { $ne: userId } })
    });

    res.status(200).json({
      status: true,
      coupons
    });

  } catch (error) {
    console.error('Error in getAvailableCoupons:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch available coupons'
    });
  }
};


const applyCoupon = async (req, res) => {
  try {

           const couponCode = req.body.couponcode;
           const cartTotal = req.body.totalAmount;
            const userId = req.session._id;

    if (!couponCode || !cartTotal) {
      return res.status(400).json({ status: false, message: 'Coupon code or cart total missing' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to 00:00

    // Check for a valid coupon
    const coupon = await Coupon.findOne({
      name: couponCode,
      islisted: true,
      createdOn: { $lte: today },
      expireOn: { $gte: today }
    });

    if (!coupon) {
      return res.status(404).json({ status: false, message: 'Invalid or expired coupon' });
    }

    // Check if user has already used the coupon
    if (coupon.userId.includes(userId)) {
      return res.status(403).json({ status: false, message: 'Coupon already used by this user' });
    }

    // Check if cart total meets minimum requirement
    if (cartTotal < coupon.minimumPrice) {
      return res.status(400).json({
        status: false,
        message: `Minimum order value for this coupon is ₹${coupon.minimumPrice}`
      });
    }

    const newTotal = cartTotal - coupon.offerPrice;
    return res.status(200).json({
      status: true,
      message: 'Coupon applied successfully',
      discount: coupon.offerPrice,
      newTotal
    });

  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ status: false, message: 'Server error applying coupon' });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    // You can clear the applied coupon from session or database depending on your implementation
    req.session.coupon = null; // if you're storing coupon in session

    // Optionally, you can perform additional logic like logging, analytics, etc.

    // Recalculate total (if needed, else just return success)
    // Assuming you still have cart total from session or re-fetch it from DB
    const cartTotal = req.session.cartTotal || 0; // fallback if needed

    return res.status(200).json({
      status: true,
      message: 'Coupon removed successfully',
      finalAmount: cartTotal // return the original cart total
    });

  } catch (error) {
    console.error('Error removing coupon:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to remove coupon'
    });
  }
};

module.exports={
    getCheckoutPage,
    checkoutAddAddress,
    checkoutEditAddress,
    getAvailableCoupons,
    applyCoupon,
    removeCoupon
}