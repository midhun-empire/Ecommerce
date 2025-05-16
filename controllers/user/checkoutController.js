const Product = require('../../models/productSchema')
const Cart = require('../../models/cartSchema')
const User  = require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const mongoose = require('mongoose')
 


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
        const user = await User.findById(req.session.user);

        const userAddress = await Address.findOne({ userId: req.session.user });

        const userCart = await Cart.findOne({ userId: req.session.user })
            .populate({
                path: 'items.productId',
                select: 'productName salePrice productImage'
            });

        if (!userCart) {
            return res.redirect('/cart');
        }
      

        const cartItems = userCart.items.map(item => ({
            productId: item.productId._id,
            productName: item.productId.productName,
            productImage: item.productId.productImage,
            quantity: item.quantity,
            size: item.size,
            price: item.price,
            salePrice: item.productId.salePrice,
            totalPrice: item.totalPrice,

        }));

        const subtotal = cartItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const taxRate = 0.02; 
        const tax = subtotal * taxRate;
        let shipping = subtotal >= 2000 ? 0 : 100; 
        let discount = 0;
        let couponCode = null;
        let appliedCoupon = null;


       

        const total = subtotal + shipping + tax - discount;

        res.render('checkout', {
            currentPage:'checkout',
            addresses: userAddress ? userAddress.address : [],
            cartItems,
            subtotal,
            shipping,
            tax,
            discount,
            couponCode,
            total,
            user: req.user || req.session.user,
            
           
        });


    } catch (error) {
        console.error("Error in getCheckout:", error);
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

module.exports={
    getCheckoutPage,
    checkoutAddAddress,
    checkoutEditAddress
}