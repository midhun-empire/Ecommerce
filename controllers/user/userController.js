const User = require("../../models/userSchema")

const pageNotFound = async (req, res) => {
    try {
        res.render('page-err')
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}


const loadHomepage = async (req, res) => {
    try {
        return res.render('home',{currentPage:'home'})
    } catch (error) {
        console.log("home page not found")
        res.send(500).send('server Error')
    }
}

const loadShopPage = async (req,res) => {
    try{
        return res.render('shop',{currentPage:'shop'})
    }catch(error){
        console.log(("shop page not found"));
        res.send(500).send('server Error')
        
    }
}

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


const loadLoginPage = (req,res)=>{
    try{
        return res.render('login')
    }catch(error){
        console.log('login page is not found');
        res.send(500).send('Server Error')
        
    }
}


const signup = async (req, res) => {
    const { name, email, phone, password } = req.body;

    try {
        const newUser = new User({ name, email, phone, password });
        console.log(newUser);

        await newUser.save();

        // Redirect with a success query param
        return res.redirect("/signup?success=true");

    } catch (error) {
        console.error("Error for saving the user", error);

        // Redirect with an error query param
        return res.redirect("/signup?error=true");
    }
};



const loadWishlist = async(req,res)=>{
    try{
        return res.render('wishlist',{currentPage:'wishlist'})
    }catch(error){
        console.log('wishlist page is not found')
        res.status(500).send('Server Error')
    }
}


const loadProfilePage = async (req, res) => {
    try {
        // Dummy user data
        const user = {
            name: "John Doe",
            email: "johndoe@example.com",
            phone: "+1234567890",
            address: "123 Main Street, City, Country",
            orders: [
                { id: 1, product: "Sofa", date: "2025-04-10", status: "Delivered" },
                { id: 2, product: "Table", date: "2025-03-15", status: "Shipped" }
            ]
        };

        // Set currentPage to "profile" or any relevant page name
        const currentPage = "profile"; 

        return res.render("profile", { user, currentPage });
    } catch (error) {
        console.log("Error loading profile page", error);
        res.status(500).send("Server Error");
    }
};



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
    loadProfilePage
   
}

