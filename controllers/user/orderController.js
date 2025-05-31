const mongoose = require('mongoose')
const Order = require('../../models/orderSchema')
const Cart = require('../../models/cartSchema')
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Coupon = require('../../models/couponSchema')
const User = require('../../models/userSchema')
const fs = require('fs')
const path = require('path')
const Razorpay = require('razorpay')
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const env = require('dotenv').config()


//razorpay
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})



const createRazorpayOrder = async (amount, receipt) => {
    try {
        if (!amount || !receipt) {
            throw new Error('Amount and receipt are required');
        }

        const amountInPaise = Math.round(parseFloat(amount) * 100);

        if (isNaN(amountInPaise) || amountInPaise <= 0) {
            throw new Error('Invalid amount value');
        }

        console.log('Creating Razorpay order with:', { amount: amountInPaise, receipt });

        const order = await razorpayInstance.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: receipt.toString(),
            payment_capture: 1
        });

        if (!order || !order.id) {
            throw new Error('Failed to create Razorpay order');
        }

        console.log('Razorpay order created successfully:', order);
        return order;
    } catch (error) {
        console.error('Razorpay order creation error:', {
            message: error.message,
            code: error.code,
            description: error.error ? error.error.description : null,
            reason: error.error ? error.error.reason : null,
            source: error.error ? error.error.source : null,
            field: error.error ? error.error.field : null,
            status: error.status,
            stack: error.stack
        });
        throw new Error(`Failed to create payment order: ${error.message}`);
    }
};




const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    console.log('userId in place order:', userId);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Please log in' });
    }

    const { addressId, paymentMethod, couponCode } = req.body;
    console.log('Request body:', { addressId, paymentMethod, couponCode });

    // Validate inputs
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ success: false, message: 'Invalid address ID' });
    }
    if (!['COD', 'RAZORPAY', 'WALLET'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method. Only COD, Razorpay, and Wallet are supported' });
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

    // Calculate total price
    let totalPrice = cart.items.reduce((sum, item) => {
      return sum + (item.quantity * item.price);
    }, 0);
    
    if (isNaN(totalPrice)) {
      return res.status(400).json({ success: false, message: 'Invalid total price calculation' });
    }

    // Apply coupon discount if provided
    let finalAmount = totalPrice;
    let couponApplied = false;
    let discount = 0;

    console.log('Received couponCode:', couponCode); // Log couponCode
    if (couponCode) {
      const coupon = await Coupon.findOne({
        name: couponCode,
        islisted: true, // Fixed: Changed isList to islisted
        expireOn: { $gte: new Date() },
        userId: { $nin: [userId] } // Fixed: Changed usedUsers to userId
      });

      if (coupon && totalPrice >= coupon.minimumPrice) {
        discount = coupon.offerPrice;
        finalAmount = totalPrice - discount;
        couponApplied = true;
        console.log('Coupon applied:', { couponCode, discount, finalAmount }); // Log coupon application
        await Coupon.findByIdAndUpdate(coupon._id, { $push: { userId: userId } }); // Fixed: Changed usedUsers to userId
      } else {
        console.log('Coupon invalid or inapplicable:', { couponCode, totalPrice, coupon }); // Log why coupon failed
        return res.status(400).json({ success: false, message: 'Invalid or inapplicable coupon' });
      }
    }

    const orderId = uuidv4();
    console.log('Generated orderId:', orderId);

    // Handle Razorpay payment (defer order creation)
    let razorpayOrder = null;
    if (paymentMethod === 'RAZORPAY') {
      console.log('Creating Razorpay order');
      razorpayOrder = await createRazorpayOrder(finalAmount, orderId);

      // Store order details in session
      console.log('Storing pending order with couponApplied:', couponApplied); // Log couponApplied
      req.session.pendingOrder = {
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
        couponApplied,
        discount,
        razorpayOrderId: razorpayOrder ? razorpayOrder.id : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Update stock temporarily
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

      // Clear cart
      console.log('Clearing cart');
      await Cart.findOneAndUpdate({ userId }, { items: [] });

      // Return Razorpay order details
      return res.status(200).json({
        success: true,
        orderId,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID
        }
      });
    }

    // Handle Wallet payment
    if (paymentMethod === 'WALLET') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ₹${wallet?.balance || 0}, Required: ₹${finalAmount}`
        });
      }

      // Deduct from wallet
      await Wallet.findOneAndUpdate(
        { userId },
        {
          $inc: { balance: -finalAmount },
          $push: {
            transactions: {
              amount: -finalAmount,
              type: 'debit',
              description: `Order payment for order ${orderId}`,
              date: new Date()
            }
          }
        }
      );
    }

    // For COD and Wallet, create the order immediately
    console.log('Creating order with couponApplied:', couponApplied); // Log before saving
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
      status: paymentMethod === 'COD' ? 'Processing' : 'Processing',
      couponApplied,
      discount,
      razorpayOrderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newOrder.save();
    console.log('Order saved with couponApplied:', newOrder.couponApplied); // Log after saving

    // Update stock for COD/Wallet
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

    // Clear cart
    console.log('Clearing cart');
    await Cart.findOneAndUpdate({ userId }, { items: [] });

    // Return response for COD/Wallet
    res.status(200).json({ success: true, orderId });
  } catch (error) {
    console.error('Error placing order:', error.name, error.message, error.stack);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
};



const verifyPayment = async (req, res) => {
    try {
        const { razorpayPaymentId, razorpayOrderId, razorpaySignature, orderId } = req.body;
        const userId = req.session.user?._id;
        console.log('userid in verifypayment', userId);

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !orderId) {
            return res.status(400).json({ success: false, message: 'Missing required payment details' });
        }

        const crypto = require('crypto');
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        console.log('Session pendingOrder:', req.session.pendingOrder);

        const pendingOrder = req.session.pendingOrder;
        if (!pendingOrder || pendingOrder.orderId !== orderId) {
            return res.status(400).json({ success: false, message: 'Invalid order data in session' });
        }

        // ✅ Handle duplicate orders gracefully
        const existingOrder = await Order.findOne({ orderId: pendingOrder.orderId });
        if (existingOrder) {
            return res.status(200).json({
                success: true,
                message: 'Order already processed',
                redirect: `/order-success/${orderId}`
            });
        }

        if (!pendingOrder.userId || !mongoose.Types.ObjectId.isValid(pendingOrder.userId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID in pending order' });
        }

        if (!pendingOrder.orderedItems || !Array.isArray(pendingOrder.orderedItems) || pendingOrder.orderedItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid items found in pending order' });
        }

        for (const item of pendingOrder.orderedItems) {
            if (!mongoose.Types.ObjectId.isValid(item.product)) {
                return res.status(400).json({ success: false, message: `Invalid product ID in pending order: ${item.product}` });
            }
            if (typeof item.quantity !== 'number' || item.quantity <= 0) {
                return res.status(400).json({ success: false, message: `Invalid quantity for product ${item.product}` });
            }
            if (typeof item.price !== 'number' || item.price <= 0) {
                return res.status(400).json({ success: false, message: `Invalid price for product ${item.product}` });
            }
        }

        if (!pendingOrder.address) {
            return res.status(400).json({ success: false, message: 'Missing address in pending order' });
        }

        const newOrder = new Order({
            userId: pendingOrder.userId,
            orderId: pendingOrder.orderId,
            paymentMethod: pendingOrder.paymentMethod,
            orderedItems: pendingOrder.orderedItems,
            totalPrice: pendingOrder.totalPrice,
            finalAmount: pendingOrder.finalAmount,
            address: pendingOrder.address,
            status: 'Processing',
            couponApplied: pendingOrder.couponApplied || false,
            discount: pendingOrder.discount || 0,
            razorpayOrderId: pendingOrder.razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            paymentStatus: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await newOrder.save();

        delete req.session.pendingOrder;

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            redirect: `/order-success/${orderId}`
        });
    } catch (error) {
        console.error('Payment verification error:', {
            message: error.message,
            stack: error.stack,
            body: req.body,
            session: req.session
        });
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



//payment failed
const handleFailedPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log("Received orderId:", orderId);

        const userId = req.session.user;

        if (!userId) {
            return res.render('payment-failed', {
                orderId: 'N/A',
                totalAmount: 0,
                paymentMethod: 'N/A',
                id: 'N/A',
                error: 'User not authenticated. Please log in.'
            });
        }

        if (!orderId) {
            return res.render('payment-failed', {
                orderId: 'N/A',
                totalAmount: 0,
                paymentMethod: 'N/A',
                id: 'N/A',
                error: 'Order ID is required'
            });
        }

        let order = await Order.findOne({
            orderId: orderId,
            userId: userId
        }).populate('orderedItems.product address');

        let finalAmount = 0;
        let paymentMethod = 'N/A';
        let id = userId;

        if (order) {
            finalAmount = order.finalAmount;
            paymentMethod = order.paymentMethod;
            id = order._id;

            if (order.paymentStatus === 'completed') {
                return res.redirect('/profile/order');
            } else if (order.status !== 'failed') {
                order.status = 'failed';
                await order.save();
            }
        } else {
            const pendingOrder = req.session.pendingOrder;

            if (!pendingOrder || pendingOrder.orderId !== orderId) {
                return res.render('payment-failed', {
                    orderId: orderId,
                    totalAmount: 0,
                    paymentMethod: 'N/A',
                    id: 'N/A',
                    error: 'Order details not found in session'
                });
            }

            finalAmount = pendingOrder.finalAmount;
            paymentMethod = pendingOrder.paymentMethod;
            id = userId;

            // Validate and restore cart items
            const restoredItems = [];
            for (const item of pendingOrder.orderedItems) {
                if (!mongoose.Types.ObjectId.isValid(item.product)) {
                    console.error(`Invalid productId in pendingOrder: ${item.product}`);
                    continue; // Skip invalid items
                }

                const product = await Product.findById(item.product);
                if (!product) {
                    console.error(`Product not found for ID: ${item.product}`);
                    continue; // Skip items where the product no longer exists
                }

                restoredItems.push({
                    productId: item.product,
                    quantity: item.quantity,
                    price: item.price,
                    totalPrice: item.quantity * item.price
                });
            }

            if (restoredItems.length === 0) {
                return res.render('payment-failed', {
                    orderId: orderId,
                    totalAmount: 0,
                    paymentMethod: 'N/A',
                    id: 'N/A',
                    error: 'No valid items found to restore in the cart'
                });
            }

            // Roll back stock updates
            for (const item of pendingOrder.orderedItems) {
                if (mongoose.Types.ObjectId.isValid(item.product)) {
                    await Product.findByIdAndUpdate(
                        item.product,
                        { $inc: { quantity: item.quantity } },
                        { new: true }
                    );
                }
            }

            // Restore cart with validated items
            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: restoredItems, status: 'pending' } },
                { upsert: true }
            );

            delete req.session.pendingOrder;
        }

        res.render('payment-failed', {
            orderId: orderId,
            totalAmount: finalAmount,
            paymentMethod: paymentMethod,
            id: id,
            error: req.query.error || 'Your payment was not successful. You can try again or choose a different payment method.'
        });

    } catch (error) {
        console.error('Error handling failed payment:', error);
        res.render('payment-failed', {
            orderId: req.params.orderId || 'N/A',
            totalAmount: 0,
            paymentMethod: 'N/A',
            id: 'N/A',
            error: 'An unexpected error occurred while processing your payment: ' + error.message
        });
    }
};





const retryPayment = async (req, res) => {
    try {
        const { totalAmount, orderId } = req.body;
        const userId = req.session.user?._id;

        console.log('user id in retry payment',userId);
        

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        if (!totalAmount || !orderId) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const amount = parseFloat(totalAmount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount value' });
        }

        let order = await Order.findOne({ orderId: orderId, userId: userId });

        if (order && order.paymentStatus === 'completed') {
            return res.status(400).json({ success: false, message: 'Payment already completed' });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Validate cart items
        for (const item of cart.items) {
            console.log('Validating cart item:', {
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                totalPrice: item.totalPrice
            });

            if (!mongoose.Types.ObjectId.isValid(item.productId)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid product ID in cart: ${item.productId}`
                });
            }

            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found for ID: ${item.productId}. It may have been removed.`
                });
            }

            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for product ${product.productName}. Only ${product.quantity} units available.`
                });
            }
        }

        // Fetch address (since we don't have it in the request)
        let selectedAddress = null;
        if (order) {
            selectedAddress = order.address;
        } else {
            // Fallback to the user's default address if order doesn't exist
            const addressDoc = await Address.findOne({ userId });
            selectedAddress = addressDoc?.address?.[0];
            if (!selectedAddress) {
                return res.status(400).json({ success: false, message: 'No address found for the user' });
            }
        }

        if (order) {
            order.orderedItems.forEach(item => {
                item.status = 'Pending';
            });
            order.status = 'Pending';
            order.paymentStatus = 'pending';
            await order.save();
        } else {
            order = new Order({
                orderId: orderId,
                userId: userId,
                orderedItems: cart.items.map(item => ({
                    product: item.productId,
                    quantity: item.quantity,
                    price: item.price,
                    status: 'Pending'
                })),
                totalPrice: cart.items.reduce((sum, item) => sum + (item.quantity * item.price), 0),
                finalAmount: amount,
                discount: 0,
                address: selectedAddress,
                status: 'Pending',
                paymentMethod: 'RAZORPAY',
                paymentStatus: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            await order.save();
        }

        const razorpayOrder = await createRazorpayOrder(amount, orderId);

        req.session.pendingOrder = {
            orderId: orderId,
            userId: userId,
            orderedItems: cart.items.map(item => ({
                product: item.productId,
                quantity: item.quantity,
                price: item.price,
                status: 'Pending'
            })),
            totalPrice: order.totalPrice,
            finalAmount: amount,
            discount: order.discount,
            address: selectedAddress,
            status: 'Pending',
            paymentMethod: 'RAZORPAY',
            razorpayOrderId: razorpayOrder.id,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        for (const item of cart.items) {
            await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { quantity: -item.quantity } },
                { new: true }
            );
        }
        await Cart.findOneAndUpdate({ userId }, { items: [] });

        return res.status(200).json({
            success: true,
            orderId: orderId,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            key: razorpayInstance.key_id,
            currency: 'INR'
        });

    } catch (error) {
        console.error('Error in retry payment:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while processing retry payment',
            error: error.message
        });
    }
};


const verifyRetryPayment = async (req, res) => {
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            orderId,
        } = req.body;

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification details'
            });
        }

        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const generated_signature = crypto
            .createHmac('sha256', razorpayInstance.key_secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        const order = await Order.findOne({ orderId, userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName status hasVariants isBlocked'
            });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        for (const item of order.orderedItems) {
            const productId = item.product;
            if (!productId) {
                return res.status(400).json({
                    success: false,
                    message: 'Product information missing from order'
                });
            }
            
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${item.productName || 'Unknown'}`
                });
            }
            
            if (product.isBlocked) {
                return res.status(400).json({
                    success: false,
                    message: `${product.productName} is currently unavailable for purchase`
                });
            }
        }
        if (order.paymentStatus === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Payment already completed for this order'
            });
        }

        for (const item of order.orderedItems) {
            if (!item.variant) {
                return res.status(400).json({
                    success: false,
                    message: `Variant missing for product ${item.product.productName || 'unknown'}`
                });
            }
            
            const product = await Product.findById(item.product);
            if (!product) {
                throw new Error(`Product ${item.product} not found`);
            }

          
            
            if (totalQuantity === 0) {
                product.status = "out of stock";
                await product.save();
            }
            item.status = 'Pending';
        }

        order.status = 'Pending';
        order.paymentStatus = 'completed';
        order.paymentDetails = {
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature
        };
        await order.save();

        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { new: true }
        );

        if (req.session.orderDetails) {
            delete req.session.orderDetails;
        }

        return res.status(200).json({
            success: true,
            message: 'Payment verified and order processed successfully',
            order: {
                orderId: order.orderId,
                status: order.status
            }
        });

    } catch (error) {
        console.error('Payment verification error:', error);

        if (req.body.orderId) {
            const order = await Order.findOne({ orderId: req.body.orderId })
                .populate('orderedItems.product');
            
            if (order) {
                for (const item of order.orderedItems) {
                    const variant = await ProductVariant.findById(item.variant);

                    if (variant) {
                        variant.quantity += item.quantity;
                        await variant.save();

                        const product = await Product.findById(item.product);
                        if (product && product.status === "out of stock" && variant.quantity > 0) {
                            product.status = "Available";
                            await product.save();
                        }
                    }
                }
            }
        }

        return res.status(500).json({
            success: false,
            message: 'Payment verification failed: ' + error.message
        });
    }
};


module.exports={
    placeOrder,
    getOrderDetails,
    orderSuccessPage,
    generateInvoice,
    cancelProductOrder,
    returnProduct,
    verifyPayment,
    verifyRetryPayment ,
    retryPayment,
    handleFailedPayment
}