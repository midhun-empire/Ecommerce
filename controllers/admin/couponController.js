const Coupon = require("../../models/couponSchema");
const mongoose = require("mongoose");

const loadCoupon = async (req, res) => {
  try {
    const findCoupons = await Coupon.find({});
    return res.render("coupon", { coupons: findCoupons });
  } catch (error) {
    console.error("failed to load coupon", error);

    return res.redirect("/pageerror");
  }
};

const createCoupon = async (req, res) => {
  try {
    const data = {
      couponName: req.body.couponName,
      startDate: new Date(req.body.startDate + "T00:00:00"),
      endDate: new Date(req.body.endDate + "T00:00:00"),
      offerPrice: parseInt(req.body.offerPrice),
      minimumPrice: parseInt(req.body.minimumPrice),
    };

    // Validate coupon name: no lowercase letters allowed
    const uppercaseRegex = /^[A-Z0-9]{1,50}$/;
    if (!uppercaseRegex.test(data.couponName)) {
      return res.status(400).json({
        success: false,
        message: "Coupon name must contain only uppercase letters and numbers, no lowercase letters."
      });
    }

    // Check if a coupon with the same name (case-insensitive) already exists
    const existingCoupon = await Coupon.findOne({
      name: { $regex: `^${data.couponName}$`, $options: 'i' }
    });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: "A coupon with this name already exists."
      });
    }

    const newCoupon = new Coupon({
      name: data.couponName,
      createdOn: data.startDate,
      expireOn: data.endDate,
      offerPrice: data.offerPrice,
      minimumPrice: data.minimumPrice,
      islisted: true,
    });

    await newCoupon.save();

    return res.redirect("/admin/coupon?created=true");
  } catch (error) {
    console.error("failed to create coupon ", error);
    res.redirect("/pageNotFound");
  }
};

const getEditCoupon = async (req, res) => {
  try {
    const id = req.query.id;
    const findCoupon = await Coupon.findOne({ _id: id });
    console.log("findCoupon:", findCoupon);
    return res.render("edit-coupon", {
      findCoupon: findCoupon,
    });
  } catch (error) {
    console.error("failed to get edit coupon page", error);
    res.redirect("/pageNotFound");
  }
};

const updateCoupon = async (req, res) => {
  try {
    const couponId = req.body.couponId;
    const oid = new mongoose.Types.ObjectId(couponId);
    const selectedCoupon = await Coupon.findOne({ _id: oid });

    if (selectedCoupon) {
      // Validate coupon name: no lowercase letters allowed
      const uppercaseRegex = /^[A-Z0-9]{1,50}$/;
      if (!uppercaseRegex.test(req.body.couponName)) {
        return res.status(400).send("Coupon name must contain only uppercase letters and numbers, no lowercase letters.");
      }

      // Check if a coupon with the same name (case-insensitive) already exists, excluding the current coupon
      const existingCoupon = await Coupon.findOne({
        name: { $regex: `^${req.body.couponName}$`, $options: 'i' },
        _id: { $ne: oid } // Exclude the current coupon
      });
      if (existingCoupon) {
        return res.status(400).send("A coupon with this name already exists.");
      }

      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);
      const updatedCoupon = await Coupon.updateOne(
        { _id: oid },
        {
          $set: {
            name: req.body.couponName,
            createdOn: startDate,
            expireOn: endDate,
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice),
          },
        },
        { new: true }
      );

      if (updatedCoupon.modifiedCount > 0) {
        res.send("coupon updated succesfully");
      } else {
        res.status(500).send("coupon updated failed");
      }
    } else {
      res.status(404).send("coupon not found");
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const id = req.query.id;
    console.log("Coupon ID to delete:", id);

    await Coupon.deleteOne({ _id: id });
    res
      .status(200)
      .send({ success: true, message: "coupon deleted successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send({ success: false, message: "Failed to delete coupon" });
  }
};

module.exports = {
  loadCoupon,
  createCoupon,
  getEditCoupon,
  updateCoupon,
  deleteCoupon,
};
