const Brand = require("../../models/brandSchema");

const getBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const brandData = await Brand.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const totalBrands = await Brand.countDocuments();
    const totalPages = Math.ceil(totalBrands / limit);
    const reverseBrand = brandData.reverse();
    res.render("brands", {
      data: reverseBrand,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
    });
  } catch (error) {
    res.redirect("/pageerror");
    console.error("failed to load branch page ", error);
  }
};

const addBrands = async (req, res) => {
  try {
    const brand = req.body.name;
    const findBrand = await Brand.findOne({
      brandname: brand,
    });

    if (!findBrand) {
      const newBrand = new Brand({
        brandname: brand,
      });

      await newBrand.save();
      res.redirect("/admin/brands?added=true");
    } else {
      res.status(400).send("Brand already exists");
    }
  } catch (error) {
    console.error("enable to add brands ", error);
    res.redirect("/admin/pageerror");
  }
};

const blockBrand = async (req, res) => {
  try {
    const id = req.query.id;
    await Brand.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("unable to block brand", error);
    res.redirect("/admin/pageerror");
  }
};

const unblockBrand = async (req, res) => {
  try {
    const id = req.query.id;
    await Brand.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("unable to unblock brand", error);
    res.redirect("/admin/pageerror");
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).redirect("/admin/pageerror");
    }
    await Brand.deleteOne({ _id: id });
    res.redirect("/admin/brands?deleted=true");
  } catch (error) {
    console.error("Error deleting brand", error);
    res.status(500).redirect("/admin/pageerror");
  }
};

module.exports = {
  getBrandPage,
  addBrands,
  unblockBrand,
  blockBrand,
  deleteBrand,
};
