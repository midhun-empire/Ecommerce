const User = require("../../models/userSchema")
const Category = require('../../models/categorySchema')
const Product = require('../../models/productSchema')
const Brand = require('../../models/brandSchema')
const nodemailer = require('nodemailer')
const dotenv = require('dotenv').config()
const bcrypt = require('bcrypt')

const pageNotFound = async (req, res) => {
    try {
        res.render('page-err')
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}


const { ObjectId } = require('mongodb');

const loadHomepage = async (req, res) => {
    try {
      const user = req.session.user;
      console.log("User from session:", user);
  
      if (!user || !user._id) {
        console.log("No user in session.");
        return res.render("home", { currentPage: "home", user: null });
      }
  
      console.log("Looking for user with ID:", user._id);
      const userData = await User.findById(user._id);
      console.log("UserData from DB:", userData);
  
      if (!userData) {
        console.log("User not found in DB.");
        return res.status(404).send("User not found");
      }
  
      res.render("home", { currentPage: "home", user: userData });
  
    } catch (error) {
      console.error("Error loading homepage:", error);
      res.status(500).send("Server Error");
    }
  };
  



  const loadShopPage = async (req, res) => {
    try {
      

        const user = req.session.user;
      
        const userData = await User.findById(user);
        
        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map(c => c._id.toString());

        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        })
            .populate('brand')
            .populate('category')
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
        });

        const totalPages = Math.ceil(totalProducts / limit);
        const brands = await Brand.find({ isBlocked: false });

        return res.render('shop', {
            currentPage: 'shop',
            user: userData,
            products: products,
            brand: brands,
            totalProducts: totalProducts,
            totalPages: totalPages,
            category: categories,
            
        });
    } catch (error) {
        console.error("shop page not found", error);
        return res.redirect('/pageNotFound');
    }
};



const loadAboutPage = async (req,res) => {
    try{
        return res.render('about',{currentPage:'about'})
    }catch(error){
        console.log("About page is not found");
        res.send(500).send('server Error')
    }
    
}





const loadContactPage = async (req,res) => {
    try{
        return res.render('contact',{currentPage:'contact'})
    }catch(error){
        console.log("About page is not found");
        res.send(500).send('server Error')
    }
    
}

const loadCartPage = async (req,res) =>{
    try{
        return res.render('cart',{currentPage:'cart'})
    }catch(error){
        console.log('cart page is not found');
        res.send(500).send('Server Error')
        
    }
}

const loadSignupPage = async (req,res) =>{
    try{
        return res.render('signup')
    }catch(error){
        console.log('signup page is not found');
        res.send(500).send('Server Error')
        
    }
}


const loadLoginPage = async(req,res)=>{
    try{
        if(!req.session.user){
        return res.render('login')
        }else{
            res.redirect('/')
        }
    }catch(error){
        console.log('login page is not found');
       res.redirect('/pageNotFound')
        
    }
}



const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      const findUser = await User.findOne({ isAdmin: false, email: email });
  
      if (!findUser) {
        return res.render('login', { message: 'User not found' });
      }
  
      if (findUser.isBlocked) {
        return res.render('login', { message: 'User is blocked by admin' });
      }
  
      const passwordMatch = await bcrypt.compare(password, findUser.password);
  
      if (!passwordMatch) {
        return res.render('login', { message: 'Incorrect Password' });
      }
  
      // ✅ Store full user info in session (only what you need)
      req.session.user = {
        _id: findUser._id.toString(),
        name: findUser.name,
        email: findUser.email
      };
  
      res.redirect('/');
    } catch (error) {
      console.error('Login error:', error);
      res.render('login', { message: 'Login failed. Please try again later.' });
    }
  };




   function generateOtp(){
    return Math.floor(100000+Math.random()*900000).toString()
   }


   async function sendVerificationEmail(email,otp) {
    try{

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

        const  info = await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Verify your Account",
            text:`Your Otp is ${otp}`,
            html:`<b>Your Otp:${otp}</b>`,
        })

        return info.accepted.length>0

    }catch (error) {
        console.error("Error sending Mail:", error);
        if (error.response) {
            console.error("Error Response:", error.response);
        }
        return false;
    }

   }

   const signup = async (req, res) => {
    try {
        const { name, phone, email, password, cpassword } = req.body;

        // Password mismatch validation
        if (password !== cpassword) {
            return res.render('signup', { message: 'Passwords do not match' });
        }

        // Check if the user already exists
        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', { message: 'User with this email already exists' });
        }

        // Generate OTP and send verification email
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.json('Email error');
        }

        // Store the OTP and user data in session
        req.session.userOtp = otp;
        req.session.userData = { email, password, name, phone };

        // Render OTP verification page
        res.render('verify-otp');
        console.log("OTP sent:", otp);
        
    } catch (error) {
        console.error('Signup error:', error);
        res.redirect('/pageNotFound');
    }
};





const loadWishlist = async (req,res)=>{
    try{
        return res.render('wishlist',{currentPage:'wishlist'})
    }catch(error){
        console.log('wishlist page is not found')
        res.status(500).send('Server Error')
    }
}




const securePassword = async (password)=>{
    try {
        const passwordHash = await bcrypt.hash(password,10)
        return passwordHash
        
    } catch (error) {
        
    }

    
}

const VerifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log("Received OTP: ", otp);
        
        // Check if the OTP provided by the user matches the one in the session
        if (otp === req.session.userOtp) {
            const user = req.session.userData;  // Get the user data from session
            
            // Hash the password before saving it to the database
            const passwordHash = await securePassword(user.password);

            // Create a new user document with the hashed password
            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash
            });

            // Save the user data to the database
            await saveUserData.save();

            // Store the user ID in the session for later use (logged-in user)
          
            res.json({ success: true, redirectUrl: '/' });
            // Clear the OTP and user data from the session since the signup is complete
            req.session.userOtp = null;
            req.session.userData = null;

            // Send a success response and redirect the user to the homepage
            // res.json({ success: true, redirectUrl: '/' });
        } else {
            // If the OTP doesn't match, send an error message
            res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
        }
    } catch (error) {
        console.error('Error Verifying OTP:', error);
        res.status(500).json({ success: false, message: 'An error occurred during OTP verification.' });
    }
};



const resendOtp = async (req,res)=>{
    try {
        const {email} = req.session.userData
        if(!email){
            return res.status(400).json({success:false,message:'Email not found in session'})
        }

        const otp = generateOtp()
        req.session.userOtp=otp

        const emailSent = await sendVerificationEmail(email,otp)
        if(emailSent){
            console.log('Resend OTP:',otp);
            res.status(200).json({success:true,message:'OTP Resend Successfull'})
            
        }else{
            res.status(500).json({success:false,message:'Failed to resend OTP. Please try again'})
        }
    } catch (error) {
        console.error('Error resending OTP',error);
        res.status(500).json({success:false,message:'Internal Server Error. Please try again'})
        
        
    }
} 



// const logout = async (req, res) => {
//     try {
//         req.session.destroy((err) => {
//             if (err) {
//                 console.log('session destruction error', err.message);
//                 return res.redirect('/pageNotFound');
//             }

//             res.clearCookie('connect.sid'); // 👈 Clear the session cookie
//             return res.redirect('/login');
//         });
//     } catch (error) {
//         console.log('Logout error', error);
//         res.redirect('/pageNotFound');
//     }
// };
const logout = (req, res) => {
    req.session.softLogout = true;
    res.json({ success: true });
};



const handleGoogleCallback = (req, res) => {
    if (!req.user) {
      return res.redirect('/signup');
    }
  
    // Set session data manually
    req.session.user = {
      _id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email
    };
  
    res.redirect('/');
  };


  const filterProduct = async (req, res) => {
    try {
      const user = req.session.user;
      const categoryParam = req.query.category;
      const brandParam = req.query.brand;
  
      const findCategory = categoryParam
        ? await Category.findOne({ _id: categoryParam })
        : null;
      const findBrand = brandParam
        ? await Brand.findById(brandParam)
        : null;
  
      const brands = await Brand.find({}).lean();
      const categories = await Category.find({ isListed: true });
  
      const query = {
        isBlocked: false,
        quantity: { $gt: 0 },
      };
  
      if (findCategory) query.category = findCategory._id;
      if (findBrand) query.brand = findBrand._id;
  
      // ✅ Populating brand details to access brandname in EJS
      let findProducts = await Product.find(query)
        .populate("brand") // This is the key addition
        .lean();
  
      findProducts.sort(
        (a, b) => new Date(b.createdOn) - new Date(a.createdOn)
      );
  
      const itemsPerPage = 6;
      const currentPage = parseInt(req.query.page) || 1;
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const totalPages = Math.ceil(findProducts.length / itemsPerPage);
      const currentProduct = findProducts.slice(startIndex, endIndex);
  
      let userData = null;
      if (user) {
        userData = await User.findOne({ _id: user });
        if (userData) {
          const searchEntry = {
            category: findCategory ? findCategory._id : null,
            brand: findBrand ? findBrand.brandname : null,
            searchedOn: new Date(),
          };
          userData.searchHistory.push(searchEntry);
          await userData.save();
        }
      }
  
      req.session.filterProduct = currentProduct;
      res.render("shop", {
        user: userData,
        products: currentProduct,
        category: categories,
        brand: brands,
        totalPages,
        currentPage,
        selectedCategory: categoryParam || null,
        selectedBrand: brandParam || null,
      });
    } catch (error) {
      console.error(error);
      res.redirect("/pageNotFound");
    }
  };
  

  const filterByPrice = async (req, res) => {
    try {
      const user = req.session.user;
      const userData = await User.findOne({ _id: user });
  
      const brands = await Brand.find({ isListed: true }).lean();
      const categories = await Category.find({ isListed: true }).lean();
  
      const minPrice = parseInt(req.query.gt) || 0;
      const maxPrice = parseInt(req.query.lt) || Number.MAX_SAFE_INTEGER;
  
      let findProducts = await Product.find({
        salePrice: { $gt: minPrice, $lt: maxPrice },
        isBlocked: false,
        quantity: { $gt: 0 },
      })
        .populate("brand") // ✅ so you can display brandname
        .lean();
  
      findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
  
      const itemsPerPage = 6;
      const currentPage = parseInt(req.query.page) || 1;
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const totalPages = Math.ceil(findProducts.length / itemsPerPage);
      const currentProduct = findProducts.slice(startIndex, endIndex);
  
      req.session.filteredProducts = findProducts;
  
      res.render("shop", {
        user: userData,
        products: currentProduct,
        category: categories,
        brand: brands,
        totalPages,
        currentPage,
      });
    } catch (error) {
      console.error(error);
      res.redirect("/pageNotFound");
    }
  };


  const searchProducts = async (req, res) => {
    try {
      const user = req.session.user;
      const userData = await User.findOne({ _id: user });
      const search = req.body.query;
  
      const brands = await Brand.find({}).lean();
      const categories = await Category.find({ isListed: true }).lean();
      let searchResult = [];
  
      if (req.session.filterProduct) {
        // Filter from session-stored products
        searchResult = req.session.filterProduct.filter((product) =>
          product.productName.toLowerCase().includes(search.toLowerCase())
        );
      } else {
        // If no session filter, search in DB directly
        const categoryIds = categories.map((cat) => cat._id);
        searchResult = await Product.find({
          productName: { $regex: ".*" + search + ".*", $options: "i" },
          isBlocked: false,
          quantity: { $gt: 0 },
          category: { $in: categoryIds },
        })
          .populate("brand") // ✅ Populate for brand name display
          .lean();
      }
  
      searchResult.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
  
      const itemsPerPage = 6;
      const currentPage = parseInt(req.query.page) || 1;
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const totalPages = Math.ceil(searchResult.length / itemsPerPage);
      const currentProduct = searchResult.slice(startIndex, endIndex);
  
      res.render("shop", {
        user: userData,
        products: currentProduct,
        category: categories,
        brand: brands,
        totalPages,
        currentPage,
        count: searchResult.length,
      });
    } catch (error) {
      console.error(error);
      res.redirect("/pageNotFound");
    }
  };
  

  const sort = async (req,res)=>{
    try {
        const sortOption = req.query.sort;
        let sortCriteria = {};
      
        switch (sortOption) {
          case 'price-asc':
            sortCriteria = { salePrice: 1 };
            break;
          case 'price-desc':
            sortCriteria = { salePrice: -1 };
            break;
          case 'name-asc':
            sortCriteria = { productName: 1 };
            break;
          case 'name-desc':
            sortCriteria = { productName: -1 };
            break;
          default:
            sortCriteria = {}; // No sort
        }
      
        const products = await Product.find().sort(sortCriteria).populate('brand').populate('category');
        const categories = await Category.find();
        const brands = await Brand.find();
      
        res.render('shop', {
          products,
          category: categories,
          brand: brands,
          currentPage: 1,
          totalPages: 1 // Adjust if you implement pagination
        });
        
    } catch (error) {
        res.render('/pageNotFound')
        
    }
  }

module.exports = {
    loadHomepage,
    pageNotFound,
    loadShopPage,
    loadAboutPage,
    loadContactPage,
    loadCartPage,
    loadSignupPage,
    loadLoginPage,
    signup,
    loadWishlist,
    VerifyOtp,
    resendOtp,
    login,
    logout,
    handleGoogleCallback,
    filterProduct,
    filterByPrice,
    searchProducts,
    sort
   
}

