const User = require("../models/userSchema")

module.exports = async (req, res, next) => {
    try {
        // Handle soft logout
        if (req.session?.softLogout) {
            req.session.destroy(err => {
                if (err) {
                    console.log("Session destroy error:", err);
                    return res.redirect("/pageNotFound");
                }
                res.clearCookie("connect.sid");
                return res.redirect("/login");
            });
            return; // Important: Prevent further execution
        }

        // Set user locals
        if (req.session.user) {
            const user = await User.findById(req.session.user);
            res.locals.user = user || null;
        } else {
            res.locals.user = null;
        }

        next();
    } catch (error) {
        console.log("userLocals error:", error);
        res.locals.user = null;
        next();
    }
};