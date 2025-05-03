const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')


const loadLogin =async (req,res)=>{
  
    if(req.session.admin){
        return res.redirect('/admin/dashboard')
    }

    res.render('admin-login',{message:null})
}

const Login = async (req, res) => {
    try {
     const { email, password } = req.body;
     const admin = await User.findOne({ email, isAdmin: true });
 
     if (admin) {
         const passwordMatch = await bcrypt.compare(password, admin.password);
         if (passwordMatch) {
             req.session.admin = true;
             return res.redirect('/admin'); 
         } else {
             return res.redirect('/admin/login',{message:'Invalid email or password'});
         }
     } else {
         return res.redirect('/admin/login',{message:'Invalid email or password'});
     }
    } catch (error) {
     console.log('login error', error);
     return res.redirect('/admin/login',{message:'Wrong Password'});
    }
 }
 


const loadDashboard = async (req,res)=>{
    if(req.session.admin){
        try{
            res.render('dashboard',{ pageTitle: 'Dashboard',
                active: 'dashboard'})
        }catch(error){
            res.redirect('/page-error')
        }
    }
}


const pageerror = async (req,res)=>{
    res.render('admin-error')
}


const Logout = async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session",err);
                return res.redirect('pageerror')
                
            }
            res.redirect('/admin/login')
        })          
        
    } catch (error) {
        console.log("Unexpeted error during logout",error);
        res.redirect('/pageerror')
        
        
    }

}




module.exports={
    loadLogin,
    Login,
    loadDashboard,
    pageerror,
    Logout,
   
}