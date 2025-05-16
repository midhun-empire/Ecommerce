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
    console.log('usreid:',userId);
    
    const { addressId, paymentMethod } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const addressObjectId = new mongoose.Types.ObjectId(addressId);

    const addressDoc = await Address.findOne({
      userId,
      address: { $elemMatch: { _id: addressObjectId } }
    });

    if (!addressDoc) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const selectedAddress = addressDoc.address.find(
      (addr) => addr._id.toString() === addressId
    );

    if (!selectedAddress) {
      return res.status(404).json({ success: false, message: "Selected address not found" });
    }

    if (paymentMethod !== "COD") {
      return res.status(400).json({ success: false, message: "Only Cash on Delivery is supported" });
    }

    // Fetch cart
    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const totalPrice = cart.items.reduce((sum, item) => {
      return sum + item.quantity * item.price;
    }, 0);

    const finalAmount = totalPrice;
    const orderId = uuidv4(); // ✅ Generate a UUID
     console.log('orderid:',orderId);
  
    const newOrder = new Order({
      userId,
      orderId, // ✅ Save the UUID to DB
      paymentMethod,
      orderedItems: cart.items.map(item => ({
        product: item.productId,
        quantity: item.quantity,
        price: item.price,
        status: 'Pending'
      })),
      totalPrice,
      finalAmount,
      address: selectedAddress,
      status: "Pending",
      couponApplied: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newOrder.save();

    // Clear cart
    await Cart.findOneAndUpdate({ userId }, { items: [] });

    // ✅ Return UUID instead of Mongo ObjectId
    res.status(200).json({ success: true, orderId });

  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ success: false, message: "Server error" });
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
    const findUser = await User.findOne({ _id: userId });
    if (!findUser) {
      return res.status(404).json({ message: "User not found" });
    }
    const { orderId } = req.body;
    const findOrder = await Order.findOne({ _id: orderId });
    if (!findOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (findOrder.status === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }
    
   
    // Handle refund if payment was made via Razorpay or wallet
    if ((findOrder.payment === "razorpay" || findOrder.payment === "wallet") && findOrder.status === "Confirmed") {
      findUser.wallet += findOrder.totalPrice;
      // Update user wallet history
      await User.updateOne(
        { _id: userId },
        {
          $push: {
            history: {
              amount: findOrder.totalPrice,
              status: "credit",
              date: Date.now(),
              description: `Order ${orderId} cancelled`,
            },
          },
        }
      );
      await findUser.save();
    }

    // Update order status to cancelled
    await Order.updateOne({ _id: orderId }, { status: "Cancelled" });

    // Update product quantities
    for (const productData of findOrder.orderedItems) {
      const productId = productData.product;
      const quantity = productData.quantity;
      const product = await Product.findById(productId);
      if (product) {
        product.quantity += quantity;
        await product.save();
      } else {
        console.log("No Product");
      }
    }
    
    res.status(200).json({ success:true,message: "Order cancelled successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }

};

module.exports={
    placeOrder,
    getOrderDetails,
    orderSuccessPage,
    generateInvoice,
    cancelProductOrder
}