const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true }, // Store product price for each item
    totalPrice: { type: Number, required: true }, // Store the total price for this item
  }],
  status: {
    type: String,
    default: 'pending', // Default status could be pending, or you can customize it further
  },
});

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
