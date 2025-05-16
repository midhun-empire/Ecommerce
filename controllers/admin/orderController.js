
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const mongodb = require("mongodb");
const mongoose = require('mongoose')
const razorpay = require("razorpay");
const env = require("dotenv").config();
const crypto = require("crypto");
const Coupon=require("../../models/couponSchema");
const { v4: uuidv4 } = require('uuid');


const getOrderListPageAdmin = async (req, res) => {
    try {
      const orders = await Order.find({}).sort({ createdOn: -1 }) .populate('userId', 'name').populate("orderedItems.product");
      let itemsPerPage = 3;
      let currentPage = parseInt(req.query.page) || 1;
      let startIndex = (currentPage - 1) * itemsPerPage;
      let endIndex = startIndex + itemsPerPage;
      let totalPages = Math.ceil(orders.length / 3);
      const currentOrder = orders.slice(startIndex, endIndex);
      currentOrder.forEach(order => {
        order.orderId = uuidv4();
      });
  
      res.render("order-list", { orders: currentOrder, totalPages, currentPage });
    } catch (error) {
      res.redirect("/pageerror");
    }
  };
  
  const changeOrderStatus = async (req, res) => {
    try {
      const { orderId, status } = req.body;
  
      await Order.updateOne({ _id: orderId }, { status });
  
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
      let orders = await Order.find(filter).populate('userId');
  
      // Apply search term filter manually
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        orders = orders.filter(order =>
          order.orderId.toLowerCase().includes(lowerSearch) ||
          (order.userId?.name && order.userId.name.toLowerCase().includes(lowerSearch))
        );
      }
  
      // Format the orders
      const formattedOrders = orders.map(order => ({
        _id: order._id,
        orderId: order.orderId,
        userName: order.userId?.name || 'N/A',
        orderDate: order.createdAt,
        totalAmount: order.finalAmount || 0,
        status: order.status,
        returnRequested: order.returnRequested || false
      }));
  
      res.json({ success: true, orders: formattedOrders });
  
    } catch (err) {
      console.error('Error filtering orders:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };



  const getOrderDetailsPageAdmin = async (req, res) => {
    try {
      const orderId = req.query.id;
  
      const findOrder = await Order.findOne({ _id: orderId })
        .populate("orderedItems.product")
        .populate("userId"); // <-- populate userId here
  
        console.log(findOrder.orderedItems);
        
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
  
      res.render("order-details-admin", {
        orders: findOrder,
        orderId: orderId,
        finalAmount: finalAmount,
      });
    } catch (error) {
      console.error(error);
      res.redirect("/pageerror");
    }
  };
  
  

  
  module.exports={
    getOrderListPageAdmin,
    changeOrderStatus,
    filterOrders,
    getOrderDetailsPageAdmin
  }
