const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Category = require("../../models/categorySchema");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const loadLogin = async (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  res.render("admin-login", { message: null });
};

const Login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = true;
        return res.redirect("/admin/dashboard");
      } else {
        return res.redirect("/admin/login", {
          message: "Invalid email or password",
        });
      }
    } else {
      return res.redirect("/admin/login", {
        message: "Invalid email or password",
      });
    }
  } catch (error) {
    console.log("login error", error);
    return res.redirect("/admin/login", { message: "Wrong Password" });
  }
};

const loadDashboard = async (req, res, next) => {
  if (req.session.admin) {
    try {
      let { startDate, endDate } = req.query;

      if (
        !startDate ||
        !endDate ||
        isNaN(new Date(startDate)) ||
        isNaN(new Date(endDate))
      ) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 1);
        startDate = start.toISOString().split("T")[0];
        endDate = end.toISOString().split("T")[0];
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      console.log("Date Range:", { start, end });

      const totalDiscount = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lt: end },
            'orderedItems.status': 'delivered',
            discount: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$discount" },
          },
        },
      ]);


        const Discounts = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lt: end },
            discount: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$discount" },
          },
        },
      ]);

      const totalSales = await Order.aggregate([
        { $match: 
          { createdAt: { $gte: start, $lt: end } ,
             'orderedItems.status': 'delivered'
        } },
        {
          $group: {
            _id: null,
            total: { $sum: { $round: ["$finalAmount", 0] } },
          },
        },
      ]);

      const dailySales = await Order.aggregate([
        { $match: 
          { createdAt: 
            { $gte: start, $lt: end },
            'orderedItems.status': 'delivered'
           } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: "$finalAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const dailyOrders = await Order.aggregate([
        { $match:
           { createdAt: { $gte: start, $lt: end } ,
          'orderedItems.status': 'delivered'
          } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const dailyDiscounts = await Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } ,
         'orderedItems.status': 'delivered'
      
      } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: "$discount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const totalOrders = await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
        
      });
      const returnedOrders = await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
        "orderedItems.status": "Returned",
      });
      const pendingOrders = await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
        "orderedItems.status": "Pending",
      });
      const deliveredOrders = await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
        "orderedItems.status": { $in: ["Delivered", "delivered"] },
      });
      const shippedOrders = await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
        "orderedItems.status": { $in: ["Shipped", "shipped"] },
      });
      const processingOrders = await Order.countDocuments({
        createdAt: { $gte: start, $lt: end },
        status: "Processing",
      });
      const totalUsers = await User.countDocuments({
        isAdmin: { $ne: true },
        isBlocked: { $ne: true },
      });

      const topProducts = await Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": "delivered" } }, 
        {
          $group: {
            _id: "$orderedItems.product",
            totalSold: { $sum: "$orderedItems.quantity" },
            totalRevenue: {
              $sum: {
                $multiply: ["$orderedItems.quantity", "$orderedItems.price"],
              },
            },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        {
          $unwind: {
            path: "$productDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: "$productDetails.productName",
            brand: "$productDetails.brand",
            totalSold: 1,
            totalRevenue: 1,
          },
        },
      ]);

      const topCategories = await Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": "delivered" } },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        {
          $unwind: {
            path: "$productDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$productDetails.category",
            totalSold: { $sum: "$orderedItems.quantity" },
            totalRevenue: {
              $sum: {
                $multiply: ["$orderedItems.quantity", "$orderedItems.price"],
              },
            },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        {
          $unwind: {
            path: "$categoryDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: "$categoryDetails.name",
            totalSold: 1,
            totalRevenue: 1,
          },
        },
      ]);

      const topBrands = await Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $unwind: "$orderedItems" },
        { $match: { "orderedItems.status": "delivered" } },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        {
          $unwind: {
            path: "$productDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "brands",
            localField: "productDetails.brand",
            foreignField: "_id",
            as: "brandDetails",
          },
        },
        {
          $unwind: { path: "$brandDetails", preserveNullAndEmptyArrays: true },
        },
        {
          $group: {
            _id: "$productDetails.brand",
            brandName: { $first: "$brandDetails.brandname" },
            totalSold: { $sum: "$orderedItems.quantity" },
            totalRevenue: {
              $sum: {
                $multiply: ["$orderedItems.quantity", "$orderedItems.price"],
              },
            },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 },
        {
          $project: {
            name: { $ifNull: ["$brandName", "Unknown Brand"] },
            totalSold: 1,
            totalRevenue: 1,
          },
        },
      ]);
      console.log("Top Brands:", JSON.stringify(topBrands, null, 2));

      console.log("Dashboard Data:", {
        totalSales: totalSales[0]?.total || 0,
        totalOrders,
        returnedOrders,
        pendingOrders,
        deliveredOrders,
        shippedOrders,
        processingOrders,
        totalUsers,
        totalDiscount: totalDiscount[0]?.total || 0,
        dailySales,
        dailyOrders,
        dailyDiscounts,
        topProducts,
        topCategories,
        topBrands,
      });

      res.render("dashboard", {
        totalSales: Math.round(totalSales[0]?.total || 0),
        totalOrders,
        returnedOrders,
        pendingOrders,
        deliveredOrders,
        shippedOrders,
        processingOrders,
        totalUsers,
        totalDiscount: totalDiscount[0]?.total || 0,
         Discounts:Discounts[0]?.total || 0,
        startDate,
        endDate,
        dailySales: JSON.stringify(dailySales),
        dailyOrders: JSON.stringify(dailyOrders),
        dailyDiscounts: JSON.stringify(dailyDiscounts),
        topProducts: JSON.stringify(topProducts),
        topCategories: JSON.stringify(topCategories),
        topBrands: JSON.stringify(topBrands),
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.render("error", { message: "Failed to load dashboard data" });
    }
  } else {
    res.redirect("/admin/login");
  }
};

const pageerror = async (req, res) => {
  res.render("admin-error");
};

const Logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Error destroying session", err);
        return res.redirect("pageerror");
      }
      res.redirect("/admin/login");
    });
  } catch (error) {
    console.log("Unexpeted error during logout", error);
    res.redirect("/pageerror");
  }
};





const generatePdfReport = async (req, res, next) => {
  try {
    const doc = new PDFDocument({
      size: "A4",
      autoFirstPage: false,
      margin: 0,
    });
    const filePath = path.join(__dirname, "report.pdf");
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const colors = {
      primary: "#003087",
      secondary: "#005EB8",
      accent: "#00A859",
      text: "#333333",
      lightGray: "#E0E0E0",
      tableBorder: "#CCCCCC",
      summaryBackground: "#D3D3D3",
      summaryText: "#000000",
      summaryHeader: "#000000",
    };

    let { startDate, endDate } = req.query;

    // Validate and set default date range
    if (
      !startDate ||
      !endDate ||
      isNaN(new Date(startDate)) ||
      isNaN(new Date(endDate))
    ) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 1);
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    // Log date range for debugging
    console.log("PDF Report Date Range:", {
      start: start.toISOString(),
      end: end.toISOString(),
      startDate,
      endDate,
    });

    // Warn if future dates are used
    const now = new Date();
    if (start > now || end > now) {
      console.warn(
        "Warning: Date range includes future dates, which may return no orders."
      );
    }

    // Query orders using createdAt
    const orders = await Order.find({ createdAt: { $gte: start, $lt: end },
        'orderedItems.status':'delivered'
    })
      .select(
        "orderId createdAt product totalPrice discount finalAmount paymentMethod orderedItems"
      )
      .sort({ createdAt: 1 });

    // Log query results
    console.log(
      "Orders found:",
      orders.length,
      orders.map((o) => ({
        orderId: o.orderId,
        createdAt: o.createdAt,
        totalPrice: o.totalPrice,
        discount: o.discount,
        finalAmount: o.finalAmount,
      }))
    );

    // Handle no orders found
    if (orders.length === 0) {
      res.redirect(
        `/admin/dashboard?startDate=${encodeURIComponent(
          startDate
        )}&endDate=${encodeURIComponent(endDate)}&error=${encodeURIComponent(
          "No orders found for the selected period"
        )}`
      );
      return;
    }

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 50;

    const columnWidths = [100, 80, 40, 70, 70, 70, 70]; // Adjusted last column width to match headers
    const totalTableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const headers = [
      "Order ID",
      "Date",
      "Items",
      "Amount",
      "Discount",
      "Final Amt",
      "Payment",
    ];
    const headerHeight = 100;
    const rowHeight = 25;
    const summaryHeight = 130;
    const tableX = (pageWidth - totalTableWidth) / 2;
    const maxRowsPerPage = Math.floor(
      (pageHeight - headerHeight - margin * 2) / rowHeight
    );
    const maxRowsLastPage = Math.floor(
      (pageHeight - headerHeight - margin * 2 - summaryHeight) / rowHeight
    );

    let y = margin;
    let pageNumber = 0;

    const addHeader = () => {
      doc
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text("Sales Report", margin, 20, { align: "center" });
      doc
        .fillColor(colors.secondary)
        .fontSize(12)
        .text(`Period: ${startDate} to ${endDate}`, margin, 45, {
          align: "center",
        });
      doc
        .moveTo(margin, 70)
        .lineTo(pageWidth - margin, 70)
        .strokeColor(colors.lightGray)
        .stroke();
    };

    const addFooter = () => {
      doc
        .fillColor(colors.text)
        .font("Helvetica")
        .fontSize(10)
        .text(`Page ${pageNumber}`, pageWidth - margin - 30, pageHeight - 30, {
          align: "right",
        });
    };

    const drawTableBorders = (startY, rowCount) => {
      const tableHeight = rowHeight * rowCount;
      let xPos = tableX;

      for (let i = 0; i <= columnWidths.length; i++) {
        doc
          .moveTo(xPos, startY)
          .lineTo(xPos, startY + tableHeight)
          .strokeColor(colors.tableBorder)
          .stroke();
        xPos += columnWidths[i] || 0;
      }

      for (let i = 0; i <= rowCount; i++) {
        doc
          .moveTo(tableX, startY + i * rowHeight)
          .lineTo(tableX + totalTableWidth, startY + i * rowHeight)
          .strokeColor(colors.tableBorder)
          .stroke();
      }
    };

    const renderPageContent = (startIndex, endIndex, isLastPage = false) => {
      doc.addPage();
      pageNumber++;
      y = margin;

      addHeader();
      y = 80;

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(colors.primary)
        .text("Order Details", tableX, y);
      y += 20;

      const tableStartY = y;
      let xPos = tableX;

      doc.font("Helvetica-Bold").fontSize(9).fillColor(colors.primary);
      headers.forEach((header, i) => {
        doc.text(header, xPos + 5, y + 5, {
          width: columnWidths[i] - 10,
          align: "center",
        });
        xPos += columnWidths[i];
      });
      y += rowHeight;

      doc.font("Helvetica").fontSize(8).fillColor(colors.text);
      for (let i = startIndex; i <= endIndex && i < orders.length; i++) {
        const order = orders[i];
       const itemCount = Array.isArray(order.orderedItems)
        ? order.orderedItems.reduce((sum, item) => sum + (item.status === 'delivered' ? item.quantity : 0), 0) : 0;
        xPos = tableX;

        const rowData = [
          order.orderId ? order.orderId.slice(0, 15) : "N/A",
          order.createdAt ? order.createdAt.toLocaleDateString() : "N/A",
          itemCount.toString(),
          order.totalPrice !== undefined
            ? `${order.totalPrice.toFixed(2)}`
            : "0.00",
          order.discount !== undefined
            ? `${order.discount.toFixed(2)}`
            : "0.00",
          order.finalAmount !== undefined
            ? `${order.finalAmount.toFixed(2)}`
            : "0.00",
          order.paymentMethod || "N/A",
        ];

        rowData.forEach((data, j) => {
          doc.text(data, xPos + 5, y + 5, {
            width: columnWidths[j] - 10,
            align: j > 2 ? "right" : "left",
          });
          xPos += columnWidths[j];
        });
        y += rowHeight;
      }

      const rowCount = endIndex - startIndex + 1 + 1;
      drawTableBorders(tableStartY, rowCount);

      if (isLastPage) {
        if (y + summaryHeight > pageHeight - margin) {
          addFooter();
          doc.addPage();
          pageNumber++;
          y = margin;
          addHeader();
        } else {
          y += 20;
        }

        const summaryTop = y + 20;
        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor(colors.summaryHeader)
          .text("Summary", margin, y);
        y += 35;

        const totalOrders = orders.length;
        const totalAmount = orders
          .reduce((sum, order) => sum + (order.totalPrice || 0), 0)
          .toFixed(2);
        const totalDiscount = orders
          .reduce((sum, order) => sum + (order.discount || 0), 0)
          .toFixed(2);
        const totalFinalAmount = orders
          .reduce((sum, order) => sum + (order.finalAmount || 0), 0)
          .toFixed(2);

        const summaryWidth = pageWidth - margin * 2;
        doc
          .rect(margin, summaryTop, summaryWidth, 80)
          .fillOpacity(1)
          .fill(colors.summaryBackground)
          .stroke(colors.tableBorder);

        doc.font("Helvetica").fontSize(14).fillColor(colors.summaryText);
        doc.text(`Total Orders: ${totalOrders}`, margin + 15, summaryTop + 15);
        doc.text(`Total Amount: ${totalAmount}`, margin + 200, summaryTop + 15);
        doc.text(
          `Total Discount: ${totalDiscount}`,
          margin + 15,
          summaryTop + 40
        );
        doc
          .fillColor(colors.accent)
          .text(
            `Final Amount: ${totalFinalAmount}`,
            margin + 200,
            summaryTop + 40
          );
      }

      addFooter();
    };

    let i = 0;
    const totalOrders = orders.length;
    const rowsPerPage = maxRowsPerPage;

    while (i < orders.length) {
      const startIndex = i;
      const remainingOrders = totalOrders - i;
      const isLastPage =
        i + rowsPerPage >= totalOrders || remainingOrders <= maxRowsLastPage;
      const rowsForThisPage = isLastPage ? remainingOrders : rowsPerPage;
      const endIndex = i + rowsForThisPage - 1;

      renderPageContent(startIndex, endIndex, isLastPage);
      i += rowsForThisPage;
      y = margin;
    }

    doc.end();

    writeStream.on("finish", () => {
      res.download(filePath, "report.pdf", (err) => {
        if (err) {
          console.error("Error downloading file:", err);
        }
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });
    });
  } catch (error) {
    console.error("Error generating PDF report:", error);
    res.redirect(
      `/admin/dashboard?startDate=${encodeURIComponent(
        startDate || ""
      )}&endDate=${encodeURIComponent(
        endDate || ""
      )}&error=${encodeURIComponent("Failed to generate PDF report")}`
    );
  }
};



const generateExcelReport = async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderID", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "Items", key: "items", width: 10 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Discount", key: "discount", width: 15 },
      { header: "Final Amount", key: "finalAmount", width: 15 },
      { header: "Payment Method", key: "paymentMethod", width: 20 },
    ];

    let { startDate, endDate } = req.query;

    if (
      !startDate ||
      !endDate ||
      isNaN(new Date(startDate)) ||
      isNaN(new Date(endDate))
    ) {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 1);
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    const orders = await Order.find({ createdAt: { $gte: start, $lt: end } ,
    'orderedItems.status': 'delivered'
    })
      .select(
        "orderId createdAt orderedItems totalPrice discount finalAmount paymentMethod"
      )
      .sort({ createdAt: 1 });

    orders.forEach((order) => {
      const itemCount = Array.isArray(order.orderedItems)
  ? order.orderedItems.reduce((sum, item) => sum + (item.status === 'delivered' ? item.quantity : 0), 0)
  : 0; // Line 44
      const amount =
        order.totalPrice !== undefined
          ? `${order.totalPrice.toFixed(2)}`
          : "0.00";
      const discount =
        order.discount !== undefined ? `${order.discount.toFixed(2)}` : "0.00";
      const finalAmount =
        order.finalAmount !== undefined
          ? `${order.finalAmount.toFixed(2)}`
          : "0.00";
      const paymentMethod = order.paymentMethod || "N/A";

      worksheet.addRow({
        orderID: order.orderId,
        date: order.createdAt.toLocaleDateString(),
        items: itemCount,
        amount: amount,
        discount: discount,
        finalAmount: finalAmount,
        paymentMethod: paymentMethod,
      });
    });

    worksheet.addRow([]);
    worksheet.addRow({ orderID: "Summary" });

    const summaryRow = orders.length + 3;
    worksheet.mergeCells(`A${summaryRow}:G${summaryRow}`);
    worksheet.getCell(`A${summaryRow}`).value = "Summary";
    worksheet.getCell(`A${summaryRow}`).alignment = { horizontal: "center" };

    worksheet.mergeCells(`A${summaryRow + 1}:B${summaryRow + 1}`);
    worksheet.getCell(`A${summaryRow + 1}`).value = "Total Orders";
    worksheet.getCell(`C${summaryRow + 1}`).value = orders.length;

    worksheet.mergeCells(`A${summaryRow + 2}:B${summaryRow + 2}`);
    worksheet.getCell(`A${summaryRow + 2}`).value = "Total Amount";
    worksheet.getCell(`C${summaryRow + 2}`).value = `${orders
      .reduce((sum, order) => sum + (order.totalPrice || 0), 0)
      .toFixed(2)}`;

    worksheet.mergeCells(`A${summaryRow + 3}:B${summaryRow + 3}`);
    worksheet.getCell(`A${summaryRow + 3}`).value = "Total Discount";
    worksheet.getCell(`C${summaryRow + 3}`).value = `${orders
      .reduce((sum, order) => sum + (order.discount || 0), 0)
      .toFixed(2)}`;

    worksheet.mergeCells(`A${summaryRow + 4}:B${summaryRow + 4}`);
    worksheet.getCell(`A${summaryRow + 4}`).value = "Total Final Amount";
    worksheet.getCell(`C${summaryRow + 4}`).value = `${orders
      .reduce((sum, order) => sum + (order.finalAmount || 0), 0)
      .toFixed(2)}`;

    const filePath = path.join(__dirname, "report.xlsx");
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, "report.xlsx", (err) => {
      if (err) {
        console.log("Error downloading file", err);
      }
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.log("Error deleting file", unlinkErr);
      });
    });
  } catch (error) {
    console.log("Error generating Excel report", error);
    next(error);
  }
};

module.exports = {
  loadLogin,
  Login,
  loadDashboard,
  pageerror,
  Logout,
  generatePdfReport,
  generateExcelReport,
};
