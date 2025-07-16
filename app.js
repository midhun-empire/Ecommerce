const express = require('express')
const app = express()
const path = require('path')
const passport = require('./config/passport.js')
const session = require('express-session')
const userRouter= require('./routes/userRouter.js')
const userMiddleware = require('./middlewares/usermiddleware')
const adminRouter = require('./routes/adminRouter.js')
const nocache = require('nocache');
const errorHandler = require('./middlewares/errorHandling.js')
const env = require("dotenv").config()
const db = require("./config/db.js")

db()

app.use(session({
    secret:process.env.SESSION_SECRET,  
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        httpOnly:true,
        maxAge:72*60*60*1000 
    }  
  }))


  
app.use('/admin-assets', express.static('admin-assets'));

// Serve static files from 'public' (if still used)
app.use(express.static('public'));

app.use(nocache());
app.use(userMiddleware)
app.use(passport.initialize())
app.use(passport.session())
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(errorHandler)
app.set("view engine","ejs")
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.use(express.static(path.join(__dirname, "public")))
app.use("/",userRouter)
app.use("/admin",adminRouter)

app.listen(process.env.PORT,()=>console.log("server running"))

module.exports = app
