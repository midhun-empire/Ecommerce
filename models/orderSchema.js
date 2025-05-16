const mongoose = require("mongoose")
const { Schema } = mongoose
const {v4:uuidv4 } = require('uuid')


const orderSchema = new Schema({
   
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },

    orderId:{
        type:String,
        default:()=>uuidv4(),
        unique:true
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['COD', 'Online', 'Razorpay'], // Add methods you support
      },
    orderedItems:[{

        product:{
              type:Schema.Types.ObjectId,
              ref:"Product",
              required:true
        },
        quantity:{
            type:Number,
            required:true
        },
        price:{
            type:Number,
            default:0
        },
        status: { 
            type: String,
            required: true,
            enum: ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned", "Return Request","Payment Failed","failed"],
            default:'Pending'
        },
    }],
    totalPrice:{
        type:Number,
        required:true
    },
    discount:{
        type:Number,
        default:0
    },
    finalAmount:{
        type:Number,
        required:true
    },
    address: {
        type: Object, // Embedded object, not reference
        required: true
      }
      ,
    invoiceData:{
        type:Date
    },
    status:{
        type:String,
        required:true,
        enum:['Pending','Processing','Shipped','Delivered','Cancelled','Return request','Returned']
    },
    couponApplied:{
        type:Boolean,
        default:false

    }
},{timestamps:true})



const Order  = mongoose.model("Order",orderSchema)

module.exports = Order