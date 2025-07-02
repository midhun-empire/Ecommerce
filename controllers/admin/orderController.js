const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const mongoose = require("mongoose");
const razorpay = require("razorpay");
const Wallet = require('../../models/walletSchema')
const env = require("dotenv").config();
const crypto = require("crypto");
const Coupon = require("../../models/couponSchema");
const { v4: uuidv4 } = require("uuid");

const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .populate("userId", "name")
      .populate("orderedItems.product");
    let itemsPerPage = 7;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / 3);
    const currentOrder = orders.slice(startIndex, endIndex);
   

    res.render("order-list", { orders: currentOrder, totalPages, currentPage });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const changeOrderStatus = async (req, res) => {
  try {
    const { orderId, itemId, status } = req.body;

    // Validate input
    if (!orderId || !itemId || !status) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // Update the status of the specific item in orderedItems
    const updateResult = await Order.updateOne(
      { _id: orderId, "orderedItems._id": itemId },
      { $set: { "orderedItems.$.status": status } }
    );

    if (updateResult.modifiedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order or item not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const filterOrders = async (req, res) => {
  try {
    const { status, date, searchTerm } = req.body;
    let filter = {};

    // Filter by status
    if (status && status !== "All") {
      filter.status = status;
    }

    // Filter by date (assuming format YYYY-MM-DD)
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    // Fetch initial filtered orders
    let orders = await Order.find(filter).populate("userId");

    // Apply search term filter manually
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      orders = orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerSearch) ||
          (order.userId?.name &&
            order.userId.name.toLowerCase().includes(lowerSearch))
      );
    }

    // Format the orders
    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      orderId: order.orderId,
      userName: order.userId?.name || "N/A",
      orderDate: order.createdAt,
      totalAmount: order.finalAmount || 0,
      status: order.status,
      returnRequested: order.returnRequested || false,
    }));

    res.json({ success: true, orders: formattedOrders });
  } catch (err) {
    console.error("Error filtering orders:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.query.id;

    // Validate orderId
    if (!orderId || !mongoose.isValidObjectId(orderId)) {
      throw new Error("Invalid Order ID");
    }

    const findOrder = await Order.findOne({ _id: orderId })
      .populate("orderedItems.product")
      .populate("userId");

    if (!findOrder) {
      throw new Error("Order not found");
    }

    let totalGrant = 0;
    findOrder.orderedItems.forEach((item) => {
      totalGrant += item.price * item.quantity;
    });

    const totalPrice = findOrder.totalPrice;
    const discount = totalGrant - totalPrice;
    const finalAmount = findOrder.finalAmount;

    // Check if any item has a return request and collect return reasons
    const hasReturnRequest = findOrder.orderedItems.some(
      (item) => item.status === "Return Requested"
    );
    const returnReasons = findOrder.orderedItems
      .filter((item) => item.status === "Return Requested")
      .map((item) => ({
        productName: item.product?.productName || "Product Not Available",
        reason: item.returnReason || "Not specified",
      }));

    res.render("order-details-admin", {
      orders: findOrder,
      orderId: orderId,
      finalAmount: finalAmount,
      hasReturnRequest,
      returnReasons,
    });
  } catch (error) {
    console.error("Error in getOrderDetailsPageAdmin:", error.message);
    res.redirect("/pageerror");
  }
};


const handleReturn = async (req, res) => {
  try {
    const { orderId, itemId, action } = req.body;

    if (!orderId || !itemId || !action) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields." });
    }

    // Fetch the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    // Find the specific item in the order
    const item = order.orderedItems.id(itemId);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in order." });
    }

    // Check if item is in "Return Requested" status
    if (item.status !== "Return Requested") {
      return res.status(400).json({
        success: false,
        message: "This item is not eligible for return handling.",
      });
    }

    if (action === "approve") {
      item.status = "Returned";
      item.returnDeclinedReason = ''; // Clear if previously declined

      // Debug: Log item details
      console.log("Item details:", JSON.stringify(item, null, 2));

      // Get product ID from item.product
      const productId = item.product;
      if (!productId) {
        console.log("No product ID found in item:", item);
        return res
          .status(400)
          .json({ success: false, message: "Product ID not defined in order item." });
      }

      // Update product inventory
      const product = await Product.findById(productId);
      if (!product) {
        console.log("Product not found for ID:", productId);
        return res
 and .status(404)
          .json({ success: false, message: "Product not found." });
      }
      console.log("Product found:", product.productName, "Current quantity:", product.quantity);
      product.quantity += item.quantity; // Add returned quantity back to stock
      await product.save();
      console.log("Updated product quantity:", product.quantity);

      // Handle refund for Razorpay or Wallet payment
      if (['razorpay', 'wallet'].includes(order.paymentMethod.toLowerCase())) {
        const itemTotal = item.price * item.quantity;

        // Find the user's wallet
        const wallet = await Wallet.findOne({ user: order.userId }); // Changed from order.user to order.userId
        if (!wallet) {
          console.log("Wallet not found for user:", order.userId);
          return res
            .status(404)
            .json({ success: false, message: "Wallet not农民found for the user." });
        }

        // Update wallet balance and history
        await Wallet.updateOne(
          { user: order.userId }, // Changed from order.user to order.userId
          {
            $inc: { balance: itemTotal },
            $push: {
              history: {
                amount: itemTotal,
                status: 'credit',
                date: Date.now(),
                description: `Refund for returned item ${itemId} in order ${orderId}`,
              },
            },
          }
        );
        console.log(`Credited ${itemTotal} to wallet for user ${order.userId}`);
      }

    } else if (action === "decline") {
      item.status = "Delivered"; // Revert back to delivered
      item.returnDeclinedReason = "Return declined by admin.";
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid action." });
    }

    await order.save();

    res
      .status(200)
      .json({ success: true, message: `Return ${action}d successfully.` });
  } catch (error) {
    console.error("Error handling return request:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getOrderListPageAdmin,
  changeOrderStatus,
  filterOrders,
  getOrderDetailsPageAdmin,
  handleReturn,
};
