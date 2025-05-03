const User = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const bcrypt  = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')




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
  
module.exports ={
    getForgotPassPage,
    forgotEmailValid,
    VerifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword
}