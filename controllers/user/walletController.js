const Wallet = require('../../models/walletSchema')
const env = require('dotenv').config()
const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const Razorpay = require('razorpay')
const crypto = require('crypto')
const Coupon = require('../../models/couponSchema')


const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})





const addMoneyToWallet = async (req, res, next) => {
  try {
    console.log('addMoneyToWallet called with body:', req.body);
    const userId = req.session.user;
    if (!userId) {
      console.error('User not logged in');
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      console.error('Invalid amount:', amount);
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // Convert userId to string for receipt
    const userIdString = userId.toString();
    const options = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `wallet_${userIdString.slice(0, 6)}_${Date.now()}`,
    };

    const order = await razorpayInstance.orders.create(options);
    console.log('Razorpay order created:', order);
    return res.json({ success: true, order, key: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Error in addMoneyToWallet:', error);
    return res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

// Verify Payment and Update Wallet
const verifyWalletPayment = async (req, res, next) => {
  try {
    console.log('verifyWalletPayment called with body:', req.body);
    const userId = req.session.user;
    if (!userId) {
      console.error('User not logged in, session user:', req.session.user);
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    // Validate payload
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
      console.error('Missing required fields in payload:', { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount });
      return res.status(400).json({ success: false, message: 'Missing required payment fields' });
    }

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    console.log('Generated signature:', generatedSignature);
    console.log('Received signature:', razorpay_signature);

    if (generatedSignature !== razorpay_signature) {
      console.error('Signature verification failed');
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Find or create wallet for the user
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      console.log('Creating new wallet for user:', userId);
      wallet = new Wallet({
        user: userId,
        balance: 0,
        history: [],
      });
    }

    // Update wallet balance and history
    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      console.error('Invalid amount for wallet update:', amount);
      return res.status(400).json({ success: false, message: 'Invalid amount for wallet update' });
    }

    wallet.balance += amountNumber;
    wallet.history.push({
      amount: amountNumber,
      status: 'credit',
      description: `Added ₹${amountNumber.toFixed(2)} via Razorpay (Payment ID: ${razorpay_payment_id})`,
    });

    await wallet.save();
    console.log('Wallet updated successfully:', wallet);

    return res.json({ success: true, message: 'Money added to wallet successfully' });
  } catch (error) {
    console.error('Error in verifyWalletPayment:', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
};





// Get Wallet Details
const getWalletDetails = async (req, res) => {
  try {
    console.log('getWalletDetails called');
    const userId = req.session.user;
    if (!userId) {
      console.error('User not logged in');
      return res.status(401).json({ success: false, message: 'User not logged in' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7; // Default to 10 items per page
    const skip = (page - 1) * limit;

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      console.log('No wallet found for user:', userId);
      return res.json({
        success: true,
        balance: 0,
        history: [],
        totalPages: 0,
        currentPage: page,
        totalHistoryItems: 0,
      });
    }

    const totalHistoryItems = wallet.history.length;
    const paginatedHistory = wallet.history.slice(skip, skip + limit);

    console.log('Wallet details fetched:', { balance: wallet.balance, totalHistoryItems });
    return res.json({
      success: true,
      balance: wallet.balance,
      history: paginatedHistory, // Return paginated history
      totalPages: Math.ceil(totalHistoryItems / limit),
      currentPage: page,
      totalHistoryItems,
    });
  } catch (error) {
    console.error('Error in getWalletDetails:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet details' });
  }
};

const getWalletBalanceOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(401).json({ status: false, message: 'Unauthorized: Please log in' });
    }

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ status: false, message: 'Wallet not found' });
    }

    res.status(200).json({ status: true, balance: wallet.balance });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};


module.exports={
    addMoneyToWallet,
    verifyWalletPayment,
     getWalletDetails,
     getWalletBalanceOrder
}