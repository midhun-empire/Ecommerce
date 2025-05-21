const mongoose = require('mongoose')
const Order = require('../../models/orderSchema')
const Cart = require('../../models/cartSchema')
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Coupon = require('../../models/couponSchema')
const User = require('../../models/userSchema')
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const env = require('dotenv').config()

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    console.log('userId:', userId);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    const { addressId, paymentMethod } = req.body;
    console.log('Request body:', { addressId, paymentMethod });

    // Validate inputs
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: 'Invalid address ID' });
    }
    if (paymentMethod !== 'COD') {
      return res.status(400).json({ success: false, message: 'Only Cash on Delivery is supported' });
    }

    // Fetch address
    console.log('Fetching address for addressId:', addressId);
    const addressObjectId = new mongoose.Types.ObjectId(addressId);
    const addressDoc = await Address.findOne({
      userId,
      address: { $elemMatch: { _id: addressObjectId } },
    });

    if (!addressDoc) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const selectedAddress = addressDoc.address.find(
      (addr) => addr._id.toString() === addressId
    );
    if (!selectedAddress) {
      return res.status(404).json({ success: false, message: 'Selected address not found' });
    }

    // Fetch cart
    console.log('Fetching cart for userId:', userId);
    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Validate cart items and stock
    console.log('Validating cart items:', cart.items.map(item => ({
      productId: item.productId.toString(),
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.totalPrice,
    })));

    for (const item of cart.items) {
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({ success: false, message: `Invalid product ID: ${item.productId}` });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      }

      if (typeof product.quantity !== 'number' || product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${product.productName}. Only ${product.quantity || 0} units available.`,
        });
      }

      if (typeof item.price !== 'number' || typeof item.totalPrice !== 'number') {
        return res.status(400).json({
          success: false,
          message: `Invalid price data for product ${product.productName}`,
        });
      }
    }

    // Update stock
    console.log('Updating stock for cart items');
    for (const item of cart.items) {
      const updatedProduct = await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { quantity: -item.quantity } },
        { new: true }
      );
      if (!updatedProduct) {
        return res.status(500).json({
          success: false,
          message: `Failed to update stock for product ${item.productId}`,
        });
      }
    }

    // Calculate total price
    const totalPrice = cart.items.reduce((sum, item) => {
      return sum + (item.quantity * item.price);
    }, 0);
    if (isNaN(totalPrice)) {
      return res.status(400).json({ success: false, message: 'Invalid total price calculation' });
    }

    const finalAmount = totalPrice;
    const orderId = uuidv4();
    console.log('Generated orderId:', orderId);

    // Create new order
    console.log('Creating order');
    const newOrder = new Order({
      userId,
      orderId,
      paymentMethod,
      orderedItems: cart.items.map(item => ({
        product: item.productId,
        quantity: item.quantity,
        price: item.price,
        status: 'Pending',
      })),
      totalPrice,
      finalAmount,
      address: selectedAddress,
      status: 'Pending',
      couponApplied: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newOrder.save();

    // Clear cart
    console.log('Clearing cart');
    await Cart.findOneAndUpdate({ userId }, { items: [] });

    res.status(200).json({ success: true, orderId });
  } catch (error) {
    console.error('Error placing order:', error.name, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};


const orderSuccessPage =async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const orderId = req.params.orderId;

    if (!userId) {
      return res.redirect("/login");
    }

    // Fetch the order using the custom orderId field and userId
    const order = await Order.findOne({ orderId: orderId, userId })
      .populate('address') // Assuming address is a reference
      .exec();
      console.log("Order:", order);

    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    res.render('order-success', {
      currentPage:'order-success',
      orderId: order.orderId,
      orderDate: order.createdAt.toLocaleDateString(),
      paymentMethod: order.paymentMethod,
      address: order.address,
      totalAmount: order.totalPrice,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
   res.redirect('/pageNotFound')
  }
};




const getOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { orderId } = req.params;
  
    
    if (!userId) {
      return res.redirect("/login");
    }

    // Fetch the order using UUID
    const order = await Order.findOne({ orderId: orderId, userId })
      .populate('orderedItems.product')
      .populate('address');

    if (!order) {
      console.log('Order not found for userId:', userId, 'orderId:', orderId);
      return res.status(404).send("Order not found");
    }
    
    // Normalize status values to ensure consistency
    // Added null check to handle undefined status values
    const normalizeStatus = (status) => {
      // Handle undefined or null status
      if (!status) {
        console.log('Warning: Undefined or null status found');
        return 'Pending'; // Default status
      }
      
      const statusMap = {
        'pending': 'Pending',
        'processing': 'Processing',
        'shipped': 'Shipped',
        'out for delivery': 'Out for Delivery',
        'delivered': 'Delivered',
        'cancelled': 'Cancelled',
        'returned': 'Returned',
         'return request': 'Return request'
      };
      
      return statusMap[status.toLowerCase()] || status;
    };
    
    // Normalize the main order status
    order.status = normalizeStatus(order.status);
    
    // Normalize each ordered item's status
    order.orderedItems.forEach(item => {
      // Check if item exists before accessing its status
      if (item) {
        item.status = normalizeStatus(item.status);
      }
    });
    

    order.orderedItems.forEach((item, index) => {
      if (item) {
        console.log(`Item ${index} status:`, item.status);
      }
    });
    
    // Calculate totals
    let totalGrant = 0;
    order.orderedItems.forEach(item => {
      if (item && item.price && item.quantity) {
        totalGrant += item.price * item.quantity;
      }
    });

    const totalPrice = order.totalPrice;
    const discount = totalGrant - totalPrice;
    const finalAmount = totalPrice;
    const currentStatus = order.status;
    const statusOrder = ['Pending', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Return request', 'Returned'];
    const currentStatusIndex = statusOrder.indexOf(currentStatus);   const isCancelled = currentStatus === 'Cancelled';
    const isReturned = currentStatus === 'Returned';
    console.log("Order paymentMethod:", order.paymentMethod);
   console.log('order from order details page ',order);
   
    res.render("order-details", {
      order,
      user: req.session.user,
      currentPage: 'order-details',
      totalGrant,
      totalPrice,
      discount,
      finalAmount,
      currentStatus,
     currentStatusIndex,
     isCancelled,
     isReturned,
     paymentMethod: order.paymentMethod 

    });

  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).send("Internal Server Error");
  }
};


const generateInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findById(orderId).populate({
      path: 'orderedItems.product',
      select: 'productName price',
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${order.orderId}.pdf`);
    doc.pipe(res);

    doc
      .fontSize(20)
      .text('Brigton', { align: 'center' })
      .moveDown()
      .fontSize(16)
      .text('INVOICE', { align: 'center' })
      .moveDown();

    doc
      .fontSize(10)
      .text(`Order ID: ${order.orderId}`, { align: 'right' })
      .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
      .moveDown();

    doc
      .fontSize(10)
      .text('SHIPPING ADDRESS:', { underline: true })
      .text(order.address?.name)
      .text(order.address?.landMark)
      .text(`${order.address?.city}, ${order.address?.state}`)
      .text(order.address?.pincode)
      .text(order.address?.phone)
      .moveDown();

    const tableTop = doc.y + 10;
    const tableHeaders = ['Product', 'Qty', 'Price', 'Total']; // Removed 'Size'
    const columnWidths = [300, 60, 80, 80]; // Adjusted widths: increased Product width, removed Size
    let xPosition = 50;

    doc
      .fillColor('#f0f0f0')
      .rect(xPosition, tableTop, 520, 20)
      .fill();

    doc.fillColor('#000000');
    tableHeaders.forEach((header, i) => {
      doc.text(header, xPosition, tableTop + 5, {
        width: columnWidths[i],
        align: i === 0 ? 'left' : 'right',
      });
      xPosition += columnWidths[i];
    });

    let y = tableTop + 25;
    if (Array.isArray(order.orderedItems)) {
      order.orderedItems.forEach((item, index) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const total = price * quantity;

        if (index % 2 === 1) {
          doc
            .fillColor('#f9f9f9')
            .rect(50, y - 5, 520, 20)
            .fill();
          doc.fillColor('#000000');
        }

        xPosition = 50;
        doc.text(item.product?.productName || '', xPosition, y, { width: columnWidths[0] });
        xPosition += columnWidths[0];

        doc.text(quantity.toString(), xPosition, y, { width: columnWidths[1], align: 'right' });
        xPosition += columnWidths[1];

        doc.text(price.toString(), xPosition, y, { width: columnWidths[2], align: 'right' });
        xPosition += columnWidths[2];

        doc.text(total.toString(), xPosition, y, { width: columnWidths[3], align: 'right' });

        y += 20;
      });
    }

    doc
      .moveTo(50, y)
      .lineTo(570, y)
      .stroke();

    y += 20;
    const summaryX = 400;
    const totalPrice = Number(order.totalPrice) || 0;
    const discount = Number(order.discount) || 0;
    const shipping = Number(order.shipping) || 0;
    const finalAmount = Number(order.finalAmount) || 0;
    console.log('Invoice Values:', {
      totalPrice,
      discount,
      shipping,
      finalAmount,
      rawShipping: order.shipping,
    });
    doc
      .text('Subtotal', summaryX, y)
      .text(totalPrice.toString(), summaryX + 100, y, { align: 'right' });

    if (discount > 0) {
      y += 20;
      doc
        .text('Discount', summaryX, y)
        .text(`-${discount.toString()}`, summaryX + 100, y, { align: 'right' });
    }

    y += 20;
    doc
      .text('Shipping', summaryX, y)
      .text(shipping.toString(), summaryX + 100, y, { align: 'right' });

    y += 20;
    doc
      .fontSize(12)
      .text('Grand Total', summaryX, y, { bold: true })
      .text(finalAmount.toString(), summaryX + 100, y, { align: 'right', bold: true });

    doc
      .fontSize(10)
      .text('        Thank you for shopping with Brigton!', {
        align: 'center',
        y: 700,
      });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice',
    });
  }
};


const cancelProductOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, itemId, cancellationReason } = req.body;

    // Validate input
    if (!userId || !orderId || !itemId || !cancellationReason) {
      return res.status(400).json({
        success: false,
        message: 'User ID, Order ID, Item ID, and cancellation reason are required',
      });
    }

    // Find the user
    const findUser = await User.findById(userId);
    if (!findUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find the order
    const findOrder = await Order.findById(orderId).populate('orderedItems.product');
    if (!findOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Find the specific item in orderedItems
    const item = findOrder.orderedItems.find(
      (item) => item._id.toString() === itemId
    );
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in the order',
      });
    }

    // Check if the item is eligible for cancellation
    const cancellableStatuses = ['Pending', 'Processing', 'Shipped', 'Out for Delivery'];
    if (!cancellableStatuses.includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel item with status: ${item.status}`,
      });
    }

    // Handle refund for Razorpay or Wallet payment
    if (['Razorpay', 'wallet'].includes(findOrder.paymentMethod.toLowerCase()) && item.status !== 'Cancelled') {
      const itemTotal = item.price * item.quantity;
      findUser.wallet += itemTotal;
      await User.updateOne(
        { _id: userId },
        {
          $push: {
            history: {
              amount: itemTotal,
              status: 'credit',
              date: Date.now(),
              description: `Refund for cancelled item ${itemId} in order ${orderId}`,
            },
          },
        }
      );
      await findUser.save();
    }

    // Update the specific item's status and cancellation reason
    item.status = 'Cancelled';
    item.cancellationReason = cancellationReason; // Add this field to schema if not present

    // Recalculate totalPrice and finalAmount
    const itemTotal = item.price * item.quantity;
    findOrder.totalPrice -= itemTotal;
    findOrder.finalAmount = findOrder.totalPrice - findOrder.discount;

    // Update overall order status
    const allItemsCancelled = findOrder.orderedItems.every(
      (item) => item.status === 'Cancelled'
    );
    if (allItemsCancelled) {
      findOrder.status = 'Cancelled';
    } else if (findOrder.status === 'Cancelled') {
      // If some items are not cancelled, revert order status to Pending or appropriate status
      findOrder.status = 'Pending'; // Adjust based on your logic
    }

    // Update product stock
    const product = await Product.findById(item.product);
    if (product) {
      product.quantity += item.quantity;
      await product.save();
    } else {
      console.log(`Product ${item.product} not found`);
    }

    // Save the updated order
    await findOrder.save();

    return res.status(200).json({
      success: true,
      message: 'Product cancelled successfully',
      order: findOrder,
    });
  } catch (error) {
    console.error('Error cancelling product:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};



const returnProduct = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;

    if (!orderId || !itemId || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Fetch the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Find the item inside orderedItems
    const item = order.orderedItems.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order.' });
    }
        console.log(item);
        
    // Check if it's already returned or not delivered
    if (item.status.toLowerCase() !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered items can be returned.' });
    }

    // Update the item status and reason
    item.status = 'Return Requested';
    item.returnReason = reason;
    await order.save();

    res.status(200).json({ success: true, message: 'Return requested successfully.' });

  } catch (error) {
    console.error('Error in returnProduct controller:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};



module.exports={
    placeOrder,
    getOrderDetails,
    orderSuccessPage,
    generateInvoice,
    cancelProductOrder,
    returnProduct
}