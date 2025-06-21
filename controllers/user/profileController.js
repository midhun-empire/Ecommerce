const User = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const bcrypt  = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema')
const Wallet = require('../../models/walletSchema')



function generateOtp(){
    const digits = "1234567890";
    let otp = "";
    for(let i=0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)]
    }
    return otp
}   


const  securePassword = async(password)=>{

    try {

        const passwordHash = await bcrypt.hash(password,10)
        return passwordHash
        
    } catch (error) {
        console.error("Error hashing password:", error);
        throw error;
        
    }
     
}



const  sendVerificationEmail  =  async (email,otp)=>{
    try {
        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD

            }
        })


        const mailOptions ={
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your OTP for Password Reset",
            text:`your OTP is ${otp}`,
            html:`<b><h4>YOUR OTP IS ${otp}</h4></b>`
        }

        const info = await transporter.sendMail(mailOptions)
        console.log('Email sent :',info.messageId);
        return true
        
        
    } catch (error) {
        console.error("Error sending email",error);
        return false
        
        
    }
}



const getForgotPassPage = async (req,res)=>{
    try {
        res.render('forgot-password',{ currentPage: 'forgot-password' })
        
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
}

const forgotEmailValid = async (req,res)=>{
    try {
        const {email} = req.body
        const findUser = await User.findOne({email:email})
        
        if(findUser){
            const otp = generateOtp()
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.email  = email;
                res.render('forgotpass-otp',{ currentPage: 'forgotpass-otp' })
                console.log("forgot pasword OTP:",otp);
                
            }else{
                res.json({sucess:false,message:'Failed to send OTP.Please try again'})
            }

        }else{
            res.render('forgot-password',{
                message:'User with this email does not  exists'
            })
        }
        
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
}


// const VerifyForgotPassOtp =async ( req,res)=>{
//     try {
//         const enteredOtp = req.session.otp;
//         if(enteredOtp===req.session.userOtp){
//             res.json({sucess:true,redirectUrl:'/reset-password'})
//         }else{
//             res.json({sucess:false,message:"OTP Not Matching"})
//         }


        
//     } catch (error) {
//         res.status(500).json({sucess:false,message:"An error occured .Please try again "})
        
//     }
// }
const VerifyForgotPassOtp = async (req, res) => {
    try {
      const enteredOtp = (req.body.otp || "").trim();
      const storedOtp = (req.session.userOtp || "").toString().trim(); // Fixed here
  
      console.log("Entered OTP:", enteredOtp);
      console.log("Stored OTP:", storedOtp);
  
      if (enteredOtp === storedOtp) {
        req.session.userOtp = null; // clear after success
        res.json({ success: true, redirectUrl: '/reset-password' });
      } else {
        res.json({ success: false, message: "OTP Not Matching" });
      }
  
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "An error occurred. Please try again." });
    }
  };
  


const getResetPassPage = async (req,res)=>{
    try {
        res.render('reset-password')

        
    } catch (error) {
        res.redirect('/pageNotFound')
        
    }
}



const resendOtp = async (req,res)=>{
    try {
        const otp = generateOtp()
        req.session.userOtp = otp;
        const email = req.session.email
        console.log("Resending OTP to email ",email);
        const emailSent = await sendVerificationEmail(email,otp)
        if(emailSent){
            console.log("Resend otp ",otp);
            res.status(200).json({success:true,message:"Resend OTP Sucessfull"})
            
        }
        
        
    } catch (error) {
        console.error("Error in resend otp ",error);
        res.status(500).json({success:fasle,message:'Internal Server Error'})



    }
}

//reset password

const postNewPassword = async (req, res) => {
    try {
      const { newPass1, newPass2 } = req.body;
      const email = req.session.email;
  
      console.log("New Passwords:", newPass1, newPass2);
      console.log("Session Email:", email);
  
      if (newPass1 === newPass2) {
        const passwordHash = await securePassword(newPass1);
        const updateResult = await User.updateOne(
          { email: email },
          { $set: { password: passwordHash } }
        );
  
        console.log("Password update result:", updateResult);
  
        if (updateResult.modifiedCount === 1) {
          req.session.email = null;
          res.redirect('/login');
        } else {
          res.render('reset-password', { message: "Password update failed" });
        }
      } else {
        res.render('reset-password', { message: "Passwords do not match" });
      }
    } catch (error) {
      console.error("Error updating password:", error);
      res.redirect('/pageNotFound');
    }
  };


const loadProfilePage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const userData = await User.findById(userId);
    const addressData = await Address.findOne({ userId: userId });

    // Pagination parameters for orders
    const orderPage = Math.max(1, parseInt(req.query.orderPage) || 1); // Validate page
    const orderLimit = 10;
    const orderSkip = (orderPage - 1) * orderLimit;

    const totalOrders = await Order.countDocuments({ userId: userId });
    const totalOrderPages = Math.ceil(totalOrders / orderLimit);

    const orders = await Order.find({ userId: userId })
      .sort({ createdAt: -1 })
      .skip(orderSkip)
      .limit(orderLimit);

    console.log('Orders from loadProfilePage:', orders.length, 'Page:', orderPage);

    // Pagination parameters for wallet history
    const walletPage = Math.max(1, parseInt(req.query.walletPage) || 1); // Validate page
    const walletLimit = 10;
    const walletSkip = (walletPage - 1) * walletLimit;

    const wallet = await Wallet.findOne({ user: userId }).lean();
    let totalHistoryItems = 0;
    let totalWalletPages = 0;
    let walletHistory = [];
    if (wallet && wallet.history) {
      wallet.history.sort((a, b) => new Date(b.date) - new Date(a.date));
      totalHistoryItems = wallet.history.length;
      totalWalletPages = Math.ceil(totalHistoryItems / walletLimit);
      walletHistory = wallet.history.slice(walletSkip, walletSkip + walletLimit);
    }

    // Determine active tab
    const activeTab = req.query.orderPage ? 'orders' : 'dashboard';

    res.render('profile', {
      user: userData,
      currentPage: 'profile',
      userAddress: addressData,
      orders,
      currentPageNum: orderPage,
      totalPages: totalOrderPages,
      totalOrders,
      wallet: wallet ? { ...wallet, history: walletHistory } : { balance: 0, history: [] },
      totalHistoryItems,
      totalWalletPages,
      walletPage,
      activeTab, // Add activeTab
    });
  } catch (error) {
    console.error('Error loading profile page:', error);
    res.redirect('/pageNotFound');
  }
};

const changeEmail = async (req,res)=>{
    try {

        res.render('change-email',{
            currentPage:'change-email'
        })
        
    } catch (error) {
        console.error('Failed to render change-email page ',error)
        res.redirect('/pageNotFound')
        
    }
}


const changeEmailValid =  async(req,res)=>{
    try {
        const {email} = req.body;
        const userExists = await User.findOne({email})

        if(userExists){
            const otp = generateOtp()
            const emailSent = await sendVerificationEmail(email,otp)

            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render('change-email-otp',{currentPage:'change-email-otp'})
                console.log('Email Sent ',email);
                console.log('OTP:',otp)
                

            }else{
                res.json('email-error')
            }
        }else{
            res.render('change-email',{
                message:'User with this email not exists'
            })
        }
    } catch (error) {

        console.error('change email failed ',error)
        res.redirect('/pageNotFound')
        
    }
}


const verifyEmailOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;

        if (enteredOtp === req.session.userOtp) {
            req.session.userData = req.body.userData;

            return res.json({
                success: true,
                redirectUrl: '/new-email' // or wherever you want to redirect
            });
        } else {
            return res.json({
                success: false,
                message: 'OTP not matching'
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
}

const newEmail = async (req, res) => {
    try {
      const user = req.session.user;
  
      if (!user) {
        return res.redirect('/login'); // optional: safety check
      }
  
      res.render('new-email', {
        currentPage: 'new-email',
        userId: user._id // 👈 pass user ID to EJS
      });
    } catch (error) {
      console.error('Failed to render new-email page', error);
      res.redirect('/pageNotFound');
    }
  };
  


  const updateEmail = async (req, res) => {
    try {
      const newEmail = req.body.newEmail;
      const userId = req.body.user;
  
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { email: newEmail },
        { new: true } // return the updated document
      );
  
      // Update the session with the new user data
      req.session.user = updatedUser;
  
      res.redirect('/profile');
    } catch (error) {
      console.error('update failed', error);
      res.redirect('/pageNotFound');
    }
  };
  

  const changePassword = async (req,res)=>{
    try {
        res.render('change-password')
    } catch (error) {
        res.redirect('/pageNotFound')
    }
  }

const changePasswordValid = async (req,res)=>{
    try {
        const {email} = req.body

        const userExists = await User.findOne({email})
        if(userExists){
            const  otp = generateOtp()
            const emailSent = await sendVerificationEmail(email,otp)
            if(emailSent){
                req.session.userOtp = otp
                req.session.userData = req.body
                req.session.email = email
                res.render('change-password-otp')
                console.log('OTP:',otp)
                
            }else{
                res.json({
                    success:false,
                    message:'Failed to send otp .Please try again'
                })
            }
        }else{
            res.render('change-password',{
                message:'User with this email does not exists'
            })
        }

    } catch (error) {
        console.error('Error in validationn ',error)
        res.redirect('/pageNotFound')
    }
}


const verifyChangePasswordOtp = async (req,res)=>{
    try {
        const enteredOtp = req.body.otp
        if(enteredOtp===req.session.userOtp){
            res.json({success:true,redirectUrl:'/reset-password'})
        }else{
            res.json({success:false,message:'otp not matching'})
        }
    } catch (error) {
        res.status(500)
    }
}


const addAddress = async (req,res)=>{
    try {
        const user = req.session.user;
        res.render('add-address',{user:user,currentPage:'add-address'})
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}


const postAddAddress = async (req, res) => {
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
  
      res.redirect('/profile');
    } catch (error) {
      console.error('Error adding address:', error);
      res.redirect('/pageNotFound');
    }
  };
  

  const editAddress = async (req,res)=>{
    try {
        const addressId = req.query.id
        const user = req.session.user
        const currAddress = await Address.findOne({
            'address._id':addressId
        })

        if(!currAddress){
            return res.redirect('/pageNotFound')
        }

        const addressData = currAddress.address.find((item)=>{
            return item._id.toString()===addressId.toString()
        })

        if(!addressData){
            return res.redirect('/pageNotFound')
        }

        res.render('edit-address',{address:addressData,user:user,currentPage:'edit-address'})

    } catch (error) {
        console.error('Error in edit address ',error);
        res.redirect('/pageNotFound')
        
    }
  }


  const postEditAddress = async (req, res) => {
    try {
      const data = req.body;
      const addressId = req.query.id;
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
  
      res.redirect('/profile');
    } catch (error) {
      console.error('Error in editing address:', error);
      res.redirect('/pageNotFound');
    }
  };



  const deleteAddress = async (req,res)=>{
    try {
        const addressId = req.query.id
        const findAddress = await Address.findOne({'address._id':addressId})
        if(!findAddress){
            return res.status(500).send('address not found')
        }


        await Address.updateOne({
            'address._id':addressId
        },
        {
            $pull:{
                address:{
                    _id:addressId,
                }
            }
        })

        res.redirect('/profile')
    } catch (error) {
        console.error('Error while deleteing addreess',error);
        res.redirect('/pageNotFound')
    }
  }
  
  const loadProfileOrder = async (req, res) => {
  try {
    const userId = req.session.user?._id;

    if (!userId) {
      return res.redirect("/login");
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = 10; // Orders per page (adjust as needed)
    const skip = (page - 1) * limit; // Orders to skip

    // Fetch total number of orders
    const totalOrders = await Order.countDocuments({ userId });

    // Calculate total pages
    const totalPages = Math.ceil(totalOrders / limit);

    // Fetch orders for the current page
    const orders = await Order.find({ userId })
      .populate('orderedItems.product')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate total amount for each order
    const formattedOrders = orders.map(order => {
      return {
        _id: order._id,
        orderId: order.orderId,
        orderedItems: order.orderedItems.map(item => ({
          product: item.product,
          quantity: item.quantity,
          price: item.price,
          status: item.status
        })),
        totalAmount: order.totalPrice,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        formattedDate: new Date(order.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      };
    });

    res.render("user-profile", {
      orders: formattedOrders,
      user: req.session.user,
      currentPage: 'profile',
      activeTab: 'orders',
      currentPageNum: page,
      totalPages: totalPages,
      totalOrders: totalOrders
    });
  } catch (error) {
    console.error("Error fetching order list:", error);
    res.status(500).send("Internal Server Error");
  }
};








module.exports ={
    getForgotPassPage,
    forgotEmailValid,
    VerifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    loadProfilePage,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    newEmail,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePasswordOtp,
    addAddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress,
    loadProfileOrder,
    
}    