const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const mongoose = require("mongoose");
const Wishlist = require("../../models/wishlistSchema");

// const addToCart = async (req, res) => {
//     try {
//       const userId = req.session.user;
//       if (!userId) {
//         return res.status(401).json({ message: "Unauthorized. Please log in first." });
//       }

//         // Check if user is blocked
//     const user = await User.findById(userId);
//     if (!user || user.isBlocked) {
//        req.session.destroy(); // Destroy session if user is blocked
//       return res.status(403).json({ message: "You are blocked by admin." });
//     }

//       const { productId, quantity } = req.body;
//       const qty = parseInt(quantity) || 1;

//       const product = await Product.findById(productId);
//       if (!product) {
//         return res.status(404).json({ message: "Product not found" });
//       }

//       let cart = await Cart.findOne({ userId });
//       if (!cart) {
//         cart = new Cart({ userId, items: [] });
//       }

//       const existingItemIndex = cart.items.findIndex(
//         (item) => item.productId.toString() === productId
//       );

//       if (existingItemIndex >= 0) {
//         cart.items[existingItemIndex].quantity += qty;
//         cart.items[existingItemIndex].totalPrice =
//           cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].price;
//       } else {
//         cart.items.push({
//           productId,
//           quantity: qty,
//           price: product.salePrice,
//           totalPrice: product.salePrice * qty,
//         });
//       }

//       await cart.save();
//       return res.status(200).json({ message: "Product added to cart successfully." });

//     } catch (error) {
//       console.error("Add to Cart Error:", error);
//       return res.status(500).json({ message: "Internal server error" });
//     }
//   };

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized. Please log in first." });
    }

    const user = await User.findById(userId);
    if (!user || user.isBlocked) {
      req.session.destroy();
      return res.status(403).json({ message: "You are blocked by admin." });
    }

    const { productId, quantity } = req.body;
    const qty = parseInt(quantity) || 1;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check stock availability
    if (product.quantity < qty) {
      return res.status(400).json({
        message: `Insufficient stock. Only ${product.quantity} ${product.productName}(s) available.`,
      });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    if (existingItemIndex >= 0) {
      // Check if adding more quantity exceeds stock or max limit of 3
      const newQuantity = cart.items[existingItemIndex].quantity + qty;
      if (newQuantity > 3) {
        return res.status(400).json({
          message: `Cannot add more than 3 ${product.productName}(s) to cart.`,
        });
      }
      if (newQuantity > product.quantity) {
        return res.status(400).json({
          message: `Insufficient stock. Only ${product.quantity} ${product.productName}(s) available.`,
        });
      }
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].totalPrice =
        newQuantity * cart.items[existingItemIndex].price;
    } else {
      // Check if new item quantity exceeds max limit of 3
      if (qty > 3) {
        return res.status(400).json({
          message: `Cannot add more than 3 ${product.productName}(s) to cart.`,
        });
      }
      cart.items.push({
        productId,
        quantity: qty,
        price: product.salePrice,
        totalPrice: product.salePrice * qty,
      });
    }

    await cart.save();

    // ✅ Remove product from wishlist
    await Wishlist.findOneAndUpdate(
      { userId },
      { $pull: { products: { productId } } }
    );

    return res
      .status(200)
      .json({ message: "Product added to cart successfully." });
  } catch (error) {
    console.error("Add to Cart Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const loadCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      console.log("No user ID in session, redirecting to login");
      return res.redirect("/login");
    }

    const userData = await User.findById(userId)
      .select("name walletBalance address")
      .lean();
    if (!userData) {
      console.log("User not found for ID:", userId);
      return res.redirect("/login");
    }

    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = 6;
    const skip = (page - 1) * itemsPerPage;

    const cartDoc = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "productName salePrice productImage quantity isBlocked brand", // Ensure 'quantity' is the stock field
        populate: {
          path: "brand",
          select: "brandname",
        },
      })
      .lean();

    let cart = [];
    let grandTotal = 0;
    let totalItems = 0;

    if (cartDoc && cartDoc.items.length > 0) {
      cart = cartDoc.items
        .filter((item) => item.productId && !item.productId.isBlocked) // Filter out blocked products
        .map((item) => {
          const product = item.productId;
          const itemTotal = item.quantity * item.price;
          grandTotal += itemTotal;
          totalItems += 1;

          return {
            productId: product._id,
            productName: product.productName,
            productImage: product.productImage || [],
            brand: product.brand ? product.brand.brandname : "N/A",
            quantity: item.quantity, // Cart item quantity
            quantityAvailable: product.quantity, // Product stock (adjust field name if needed)
            salePrice: item.price,
            totalPrice: itemTotal,
          };
        });

      // Pagination after filtering
      cart = cart.slice(skip, skip + itemsPerPage);
    }

    // Align delivery charge with frontend logic
    const deliveryCharge = grandTotal > 1000 ? 140 : 0;
    const totalWithDelivery = grandTotal + deliveryCharge;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    res.render("cart", {
      user: userData, // Simplified to single user object
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
    console.error("Error loading cart page:", error);
    res.redirect("/pageNotFound");
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
      console.log(" Product not found in cart");
    }

    res.redirect("/cart");
  } catch (error) {
    console.error(" Error Deleting Product from Cart:", error);
    res.redirect("/pageNotFound");
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized. Please log in first." });
    }

    const { productId, action } = req.body;

    // Find the cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the item in the cart
    const item = cart.items.find(
      (item) => item.productId.toString() === productId
    );
    if (!item) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    // Fetch the product from the database
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Get available stock
    const availableStock = product.quantity || 0; // Using 'quantity' from Product schema

    // Calculate new quantity
    let newQuantity = item.quantity;
    if (action === "increase") {
      newQuantity += 1;
    } else if (action === "decrease" && item.quantity > 1) {
      newQuantity -= 1;
    }

    // Validate stock and quantity limits
    if (newQuantity > availableStock) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} units available in stock.`,
      });
    }

    if (newQuantity > 3) {
      return res.status(400).json({
        success: false,
        message: "You cannot add more than 3 items of this product.",
      });
    }

    // Update quantity and total price
    item.quantity = newQuantity;
    item.totalPrice = item.quantity * item.price;

    // Save the cart
    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      quantity: item.quantity,
      totalPrice: item.totalPrice,
    });
  } catch (error) {
    console.error("Update Cart Quantity Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  addToCart,
  loadCartPage,
  removeProduct,
  updateCartQuantity,
};
