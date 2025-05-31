
const User = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Cart = require('../../models/cartSchema')
const  Wishlist = require('../../models/wishlistSchema')
const Category = require('../../models/categorySchema')




const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    const page = parseInt(req.query.page) || 1;
    const limit = 6;

    const wishlist = await Wishlist.findOne({ userId }).populate({
      path: 'products.productId',
      populate: {
        path: 'brand',
        model: 'Brand',
      },
    });

    if (!wishlist || !wishlist.products.length) {
      console.log('No wishlist or empty products array');
      return res.render('wishlist', {
        user,
        wishlist: [],
        currentPage: page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }

    const products = wishlist.products.map((item) => item.productId);
    console.log('Populated products:', JSON.stringify(products, null, 2)); // Log the full product data

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedProducts = products.slice(startIndex, endIndex);
    const totalPages = Math.ceil(products.length / limit);

    res.render('wishlist', {
      user,
      wishlist: paginatedProducts,
      currentPage: page,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.status(500).render('error', { message: 'Failed to load wishlist' });
  }
};

const addToWishlist = async (req, res) => {
    try {
        const productId = req.body.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(200).json({ status: false, message: 'Please login to add To wishlist' });

        }
     
        let wishlist = await Wishlist.findOne({ userId })

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: [{ productId }]
            });
        } else {
            const productExists = wishlist.products.some(item =>
                item.productId.toString() === productId.toString()
            );
            if (productExists) {
                return res.status(200).json({ status: false, message: 'Product already in Wishlist' });
            }
            wishlist.products.push({ productId });

        }

        await wishlist.save();


        return res.status(200).json({ status: true, message: "Product added to Wishlist " })
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
}

const removeProduct = async (req, res) => {
    try {
        const productId = req.query.productId;
        const userId = req.session.user;

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(400).json({ status: false, message: 'Wishlist not found' })
        }
        const intialLength = wishlist.products.length;
        wishlist.products = wishlist.products.filter((product) => product.productId.toString() !== productId);
        if (intialLength === wishlist.products.length) {
            return res.status(404).json({ status: false, message: 'Product not found in wishlist' })
        }
        await wishlist.save();
        return res.status(200).json({ status: true, message: 'Product removed from wishlist' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
}



module.exports={
    loadWishlist,
    addToWishlist,
    removeProduct
}