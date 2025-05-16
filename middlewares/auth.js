const User = require('../models/userSchema')


// const userAuth = (req,res,next)=>{
//     if(req.session.user){
//         User.findOne(req.session.user)
//         .then(data=>{
//             if(data && !data.isBlocked){
//                 next()
//             }else{
//                 res.redirect('/login')
//             }
//         })
//         .catch(error=>{
//             console.log('Error in user auth middleware')
//             res.status(500).send('Internal Server Error')
//         })

//     }else{
//         res.redirect('/login')
//     }
// }

const userAuth = (req, res, next) => {
    if (req.session.user) {
      User.findById(req.session.user)
        .then((data) => {
          if (data && !data.isBlocked) {
            next();
          } else {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
              return res.status(401).json({ message: "Unauthorized. Blocked user." });
            } else {
              return res.redirect('/login');
            }
          }
        })
        .catch((error) => {
          console.log('Error in user auth middleware:', error);
          res.status(500).send('Internal Server Error');
        });
    } else {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ message: "Unauthorized. Please log in." });
      } else {
        return res.redirect('/login');
      }
    }
  };
  

const adminAuth = (req, res, next) => {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

module.exports={
    userAuth,
    adminAuth
}