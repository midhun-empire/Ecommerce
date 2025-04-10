const express = require('express')
const app = express()
const path = require('path')
const env = require("dotenv").config()
const db = require("./config/db.js")
db()


app.listen(process.env.PORT,()=>console.log("server running"))

module.exports = app