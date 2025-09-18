require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Middlewares
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const usersCollection = client.db("usersDB").collection("users");
    const vendorsCollection = client
      .db("usersDB")
      .collection("vendorApplications");
    const productCollections = client.db("usersDB").collection("products");
    const cartCollections = client.db("usersDB").collection("cart");
    const adCollections = client.db("usersDB").collection("ad");
    const wishCollections = client.db("usersDB").collection("wishLists");
    const paymentCollection = client.db("usersDB").collection("payments");
    const commentsCollection = client.db("usersDB").collection("comments");

    // =============================CUSTOM MIDDLEWARES=============================
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .send({ message: "Unauthorized: No token provided" });
      }

      const token = authHeader.split(" ")[1].trim();

      jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "Forbidden: Invalid token" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyTokenEmail = async (req, res, next) => {
      if (req?.query?.email !== req.decoded?.email) {
        return res
          .status(403)
          .json({ message: "Forbidden: Email does not match token" });
      }
      next();
    };

    const verifyRole = (...expectedRoles) => {
      return async (req, res, next) => {
        try {
          const email = req?.decoded?.email;
          if (!email) {
            return res
              .status(401)
              .json({ message: "Unauthorized: No email found" });
          }

          const user = await usersCollection.findOne(
            { email },
            { projection: { role: 1 } }
          );

          if (!expectedRoles.includes(user?.role)) {
            return res
              .status(403)
              .json({ message: `Forbidden: ${expectedRoles.join(", ")} only` });
          }

          next();
        } catch (error) {
          res.status(500).json({ message: "Server error" });
        }
      };
    };

    // =============================GET API=============================

    // GET all users
    app.get(
      "/users",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        try {
          const search = req.query.search || "";
          const query = search
            ? { email: { $regex: search, $options: "i" } }
            : {};

          const users = await usersCollection.find(query).toArray();
          res.send(users);
        } catch (err) {
          res.status(500).send({ message: "Failed to fetch users." });
        }
      }
    );

    // GET user role
    app.get(
      "/usersRole",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin", "vendor", "user"),
      async (req, res) => {
        const email = req.query.email;

        if (!email) {
          return res.status(400).json({ error: "Email parameter is required" });
        }

        try {
          const user = await usersCollection.findOne(
            { email },
            {
              projection: {
                role: 1,
                _id: 0,
              },
            }
          );

          if (!user) {
            return res.status(404).json({ error: "User not found" });
          }

          res.send(user);
        } catch (err) {
          res.status(500).json({ error: "Server error" });
        }
      }
    );

    // GET all products for admin and user
    app.get(
      "/all-products",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin", "user"),
      async (req, res) => {
        try {
          const products = await productCollections
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
          res.send(products);
        } catch (err) {
          res.status(500).json({ error: "Failed to fetch products" });
        }
      }
    );

    // GET all products
    app.get("/getAll-products", async (req, res) => {
      try {
        const products = await productCollections
          .find({ status: "approved" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(products);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch products" });
      }
    });

    // GET all products by vendor
    app.get(
      "/my-products",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor"),
      async (req, res) => {
        const email = req.query.email;
        const query = { vendorEmail: email };
        try {
          const products = await productCollections
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();
          res.send(products);
        } catch (err) {
          res.status(500).json({ error: "Failed to fetch products" });
        }
      }
    );

    // GET all approved products
    app.get("/approved-products", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const sort = req.query.sort || "newest";
      const date = req.query.date;

      const skip = (page - 1) * limit;

      const query = { status: "approved" };

      if (date) {
        query.date = { $regex: `^${date}` };
      }

      let sortOptions = { createdAt: -1 };
      if (sort === "asc") {
        sortOptions = { pricePerUnit: 1 };
      } else if (sort === "desc") {
        sortOptions = { pricePerUnit: -1 };
      }

      try {
        const products = await productCollections
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort(sortOptions)
          .toArray();

        const total = await productCollections.countDocuments(query);

        res.json({
          products,
          totalPages: Math.ceil(total / limit),
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch products" });
      }
    });

    // GET single product
    app.get(
      "/single-product/:id",
      verifyToken,
      verifyRole("vendor", "admin", "user"),
      async (req, res) => {
        try {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) };
          const products = await productCollections.findOne(filter);
          res.send(products);
        } catch (err) {
          res.status(500).json({ error: "Failed to fetch the product" });
        }
      }
    );

    // GET advertisements by vendor
    app.get(
      "/my-advertisements",
      verifyToken,
      verifyRole("vendor", "admin"),
      async (req, res) => {
        const email = req.query.email;

        let query = {};

        if (email) {
          query = { adCreatedBy: email };
        }

        try {
          const advertisements = await adCollections
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();
          res.send(advertisements);
        } catch (err) {
          res.status(500).json({ error: "Failed to fetch advertisements" });
        }
      }
    );

    // Get Cart Products
    app.get("/get-cart", verifyToken, verifyTokenEmail, async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        // Fetch cart items for the user
        const cartItems = await cartCollections
          .find({ buyerEmail: email })
          .toArray();

        res.status(200).json(cartItems);
      } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Wishlist get API
    app.get(
      "/get-wishlist",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        try {
          const { email } = req.query;

          if (!email) {
            return res.status(400).json({ message: "Email is required." });
          }

          // Get all wishlist items for the user
          const wishlistItems = await wishCollections.find({ email }).toArray();

          // Extract all product IDs
          const productIds = wishlistItems.map(
            (item) => new ObjectId(item.productId)
          );

          // Find all products that match those IDs
          const products = await productCollections
            .find({ _id: { $in: productIds } })
            .toArray();
          res.status(200).json(products);
        } catch (error) {
          res.status(500).json({ message: "Server error." });
        }
      }
    );

    // GET Comment API
    app.get("/comments", verifyToken, verifyTokenEmail, async (req, res) => {
      try {
        const { productId } = req.query;
        if (!productId)
          return res.status(400).json({ error: "Missing productId" });

        const comments = await commentsCollection
          .find({ productId })
          .sort({ date: -1 })
          .toArray();

        res.json(comments);
      } catch (error) {
        // console.error("GET /comments error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Get orders for admin
    app.get(
      "/admin/orders",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        try {
          const page = parseInt(req.query.page) || 1;
          const limit = parseInt(req.query.limit) || 7;
          const skip = (page - 1) * limit;

          // Fetch paid payments with pagination
          const payments = await paymentCollection
            .find({ status: "paid" })
            .skip(skip)
            .limit(limit)
            .toArray();

          const totalOrders = await paymentCollection.countDocuments({
            status: "paid",
          });

          // Build order details with products
          const orders = [];

          for (const payment of payments) {
            for (const item of payment.items) {
              const productObjectId =
                typeof item.productId === "string"
                  ? new ObjectId(item.productId)
                  : item.productId;

              const product = await productCollections.findOne({
                _id: productObjectId,
              });

              orders.push({
                _id: product._id,
                orderId: payment._id,
                paymentIntentId: payment.paymentIntentId,
                price: item.price || item.pricePerUnit || payment.amount,
                buyerName: payment.buyerName,
                buyerEmail: payment.buyerEmail,
                buyerAddress: payment.buyerAddress,
                status: payment.status,
                paidAt: payment.paidAt,
                productId: item.productId,
                productName:
                  product?.itemName || item.itemName || "Unknown Product",
                vendorEmail: product?.vendorEmail || "N/A",
                vendorName: product?.vendorName || "N/A",
                productImage: product?.image || item.image || "",
                marketName: product?.marketName || "Unknown Market",
                quantity: item.quantity || 1,
              });
            }
          }

          res.json({
            orders,
            totalPages: Math.ceil(totalOrders / limit),
          });
        } catch (error) {
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    // Get orders for vendors
    app.get(
      "/vendor/orders",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor"),
      async (req, res) => {
        try {
          const vendorEmail = req.query.email;
          const page = parseInt(req.query.page) || 1;
          const limit = parseInt(req.query.limit) || 7;
          const skip = (page - 1) * limit;

          // Fetch all paid payments
          const payments = await paymentCollection
            .find({ status: "paid" })
            .toArray();

          // Build orders array only for this vendor
          let orders = [];

          for (const payment of payments) {
            for (const item of payment.items) {
              const productObjectId =
                typeof item.productId === "string"
                  ? new ObjectId(item.productId)
                  : item.productId;

              const product = await productCollections.findOne({
                _id: productObjectId,
              });

              // Check if this product belongs to this vendor
              if (!product || product.vendorEmail !== vendorEmail) continue;

              // Push vendor-specific order
              orders.push({
                _id: `${payment._id}-${item._id}`,
                orderId: payment._id,
                paymentIntentId: payment.paymentIntentId,
                price: item.price || item.pricePerUnit || payment.amount,
                buyerName: payment.buyerName,
                buyerEmail: payment.buyerEmail,
                buyerAddress: payment.buyerAddress,
                status: payment.status,
                paidAt: payment.paidAt,
                productId: item.productId,
                productName:
                  product.itemName || item.itemName || "Unknown Product",
                vendorEmail: product.vendorEmail,
                vendorName: product.vendorName || "N/A",
                productImage: product.image || item.image || "",
                marketName: product.marketName || "Unknown Market",
                quantity: item.quantity || 1,
              });
            }
          }

          // Pagination
          const totalOrders = orders.length;
          const paginatedOrders = orders.slice(skip, skip + limit);

          res.json({
            orders: paginatedOrders,
            totalPages: Math.ceil(totalOrders / limit),
          });
        } catch (error) {
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    // Get order for users
    app.get(
      "/orders",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        try {
          const email = req.query.email;

          const payments = await paymentCollection
            .find({
              buyerEmail: email,
              status: "paid",
            })
            .toArray();

          // For each payment, fetch product details for each item
          const ordersWithProducts = await Promise.all(
            payments.map(async (payment) => {
              const itemsArray = Array.isArray(payment.items)
                ? payment.items
                : [];

              if (itemsArray.length === 0) {
                return {
                  _id: payment._id,
                  buyer: payment.buyerName,
                  email: payment.buyerEmail,
                  status: payment.status,
                  paidAt: payment.paidAt,
                };
              }

              // Process each item to fetch product details
              const processedItems = await Promise.all(
                itemsArray.map(async (item) => {
                  let productDetails = {};
                  try {
                    if (item.productId) {
                      productDetails = await productCollections.findOne({
                        _id: new ObjectId(item.productId),
                      });
                    }
                  } catch (err) {
                    // console.error("Invalid productId:", item.productId);
                  }

                  return {
                    product_id: item.productId,
                    price: parseFloat(item.price || item.pricePerUnit || 0),
                    quantity: item.quantity || 1,
                    productName:
                      productDetails?.itemName || item.itemName || "Unknown",
                    marketName: productDetails?.marketName || "Unknown",
                    productImage: productDetails?.image || item.image || "N/A",
                  };
                })
              );

              const totalAmount = processedItems.reduce(
                (sum, item) => sum + item.price * item.quantity,
                0
              );

              return {
                _id: payment._id,
                items: processedItems,
                totalAmount,
                buyer: payment.buyerName,
                email: payment.buyerEmail,
                status: payment.status,
                paidAt: payment.paidAt,
                type: processedItems.length > 1 ? "multiple" : "single",
              };
            })
          );

          res.json(ordersWithProducts);
        } catch (error) {
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    // Get Ads
    app.get("/get-ads", async (req, res) => {
      try {
        const ads = await adCollections.find({ status: "approved" }).toArray();
        res.json(ads);
      } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Get vendor applications - admin only
    app.get(
      "/vendor-requests",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        try {
          const vendorRequests = await vendorsCollection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

          res.status(200).json(vendorRequests);
        } catch (err) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    // =============================POST API=============================

    // JWT Implementation
    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      const token = jwt.sign({ email }, process.env.JWT_SECRET_KEY);
      res.send({ token });
    });

    // Sending users to DB
    app.post("/register", async (req, res) => {
      try {
        const { name, email, photo } = req.body;
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          return res.status(400).send({ error: "User already exists" });
        }

        const newUser = {
          name,
          email,
          photo,
          role: "user",
          createdAt: new Date(),
          lastSignedIn: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Registration failed" });
      }
    });

    // Apply to become a vendor
    app.post(
      "/vendors/apply",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        try {
          const vendorData = req.body;
          const data = {
            ...vendorData,
            vendor_status: "pending",
            createdAt: new Date(),
          };

          const result = await vendorsCollection.insertOne(data);
          res.status(201).send(result);
        } catch (err) {
          res
            .status(403)
            .json({ message: "Server error. Please try again later." });
        }
      }
    );

    // Add Products API
    app.post(
      "/add-products",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor"),
      async (req, res) => {
        try {
          const productData = req.body;
          const data = {
            ...productData,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await productCollections.insertOne(data);
          res.status(201).send(result);
        } catch (error) {
          res.status(500).json({ message: "Server error" });
        }
      }
    );

    // Add Advertisement API
    app.post(
      "/advertisements",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor"),
      async (req, res) => {
        try {
          const formData = req.body;

          const data = {
            ...formData,
            status: "pending",
            createdAt: new Date(),
          };

          const result = await adCollections.insertOne(data);
          res.status(201).send(result);
        } catch (error) {
          res.status(500).send({ error: "Something went wrong" });
        }
      }
    );

    // Wishlist post API
    app.post("/wishlist", async (req, res) => {
      try {
        const { productId } = req.body;
        const email = req.query.email;

        if (!email || !productId) {
          return res
            .status(400)
            .json({ message: "Email and productId are required." });
        }

        // Check if this product already exists in the user's wishlist
        const alreadyExists = await wishCollections.findOne({
          email,
          productId,
        });

        if (alreadyExists) {
          return res
            .status(409)
            .json({ message: "Already added to wishlist." });
        }

        const result = await wishCollections.insertOne({
          email,
          productId,
          createdAt: new Date(),
        });

        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Add To Cart Post API
    app.post("/cart", verifyToken, verifyTokenEmail, async (req, res) => {
      try {
        const { productId, itemName, pricePerUnit, image, buyerEmail } =
          req.body;

        // Check if product already exists
        const existingItem = await cartCollections.findOne({
          buyerEmail,
          productId,
        });

        if (existingItem) {
          // Update quantity if already in cart
          await cartCollections.updateOne(
            { _id: existingItem._id },
            { $inc: { quantity: 1 } }
          );
          return res.status(200).json({ message: "Cart updated successfully" });
        } else {
          const newCartItem = {
            productId,
            itemName,
            pricePerUnit,
            image,
            buyerEmail,
            quantity: 1,
            createdAt: new Date(),
          };

          await cartCollections.insertOne(newCartItem);
          return res.status(201).json({ message: "Product added to cart" });
        }
      } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Checkout Form
    app.post(
      "/create-order",
      verifyToken,
      verifyTokenEmail,
      async (req, res) => {
        try {
          const { buyerEmail, buyerName } = req.body;

          // Fetch cart items for this user
          const cartItems = await cartCollections
            .find({ buyerEmail })
            .toArray();

          if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ message: "Cart is empty" });
          }

          // Calculate total price
          const totalPrice = cartItems.reduce((sum, item) => {
            return sum + item.pricePerUnit * (item.quantity || 1);
          }, 0);

          // Create order object
          const newOrder = {
            buyerName,
            buyerEmail,
            cartItems,
            price: totalPrice,
            status: "pending",
            createdAt: new Date(),
          };

          // Insert into payment collection
          const result = await paymentCollection.insertOne(newOrder);

          res.status(201).json(result);
        } catch (error) {
          res.status(500).json({ message: "Failed to create order" });
        }
      }
    );

    // POST Comment API
    app.post("/comments", verifyToken, verifyTokenEmail, async (req, res) => {
      try {
        const { productId, userEmail, userName, rating, comment, date } =
          req.body;

        if (
          !productId ||
          !userEmail ||
          !userName ||
          !rating ||
          !comment ||
          !date
        ) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const newComment = {
          productId,
          userEmail,
          userName,
          rating,
          comment,
          date: new Date(date),
        };

        const result = await commentsCollection.insertOne(newComment);

        res.status(201).json({
          _id: result.insertedId,
          ...newComment,
        });
      } catch (error) {
        // console.error("POST /comments error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Payment Intent
    app.post(
      "/create-payment-intent",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        try {
          const { productId, price, buyerName, buyerEmail } = req.body;

          if (!price || isNaN(price)) {
            return res.status(400).json({ error: "Invalid price" });
          }

          // Create Stripe PaymentIntent
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(price * 100),
            currency: "usd",
            payment_method_types: ["card"],
            metadata: {
              productId,
              buyerName,
              buyerEmail,
            },
          });

          // Return client secret for front-end payment confirmation
          res.json({ clientSecret: paymentIntent.client_secret });
        } catch (error) {
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    // Cart Payment Intent
    app.post(
      "/create-payment-intent-cart",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        const { items, buyerEmail, buyerName } = req.body;

        // Validate the request
        if (!items || !Array.isArray(items) || items.length === 0) {
          return res
            .status(400)
            .json({ error: "A non-empty array of items is required." });
        }

        try {
          // Validate prices and stock on the server side
          let totalAmount = 0;
          let productInfo = [];

          for (const item of items) {
            // Fetch the latest product info from the DB
            const product = await productCollections.findOne({
              _id: new ObjectId(item.productId),
            });

            if (!product) {
              return res
                .status(404)
                .json({ error: `Product ${item.productId} not found.` });
            }

            // CONVERT PRICE TO NUMBER BEFORE CALCULATION
            const productPrice = parseFloat(product.pricePerUnit);
            const itemQuantity = parseInt(item.quantity);

            if (isNaN(productPrice) || isNaN(itemQuantity)) {
              return res.status(400).json({
                error: `Invalid price or quantity for product ${product.itemName}`,
              });
            }

            const itemTotal = productPrice * itemQuantity;
            totalAmount += itemTotal;

            // Push validated info
            productInfo.push({
              productId: item.productId,
              quantity: itemQuantity,
              price: productPrice,
              name: product.itemName,
              image: product.image,
            });
          }

          // Convert amount to cents
          const amount = Math.round(totalAmount * 100);
          if (amount < 50) {
            return res
              .status(400)
              .json({ error: "Order total must be at least $0.50." });
          }

          // Create a Payment Intent with the order amount and currency
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: ["card"],
            metadata: {
              buyerEmail: buyerEmail,
              buyerName: buyerName,
              productCount: productInfo.length.toString(),
            },
          });

          res.status(200).json({ clientSecret: paymentIntent.client_secret });
        } catch (error) {
          res.status(500).json({
            error: "Internal server error. Could not create payment intent.",
          });
        }
      }
    );

    // Save Payment Info
    app.post(
      "/save-payment",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        try {
          const paymentData = req.body;

          // must include paymentIntentId
          if (!paymentData.paymentIntentId) {
            return res.status(400).json({ error: "Missing paymentIntentId" });
          }

          const doc = {
            ...paymentData,
            paidAt: new Date(),
            status: "paid",
          };

          await paymentCollection.insertOne(doc);

          res.status(200).json({ message: "Payment saved successfully" });
        } catch (error) {
          res.status(500).json({ error: "Failed to save payment" });
        }
      }
    );

    // Contact form
    app.post("/contact", async (req, res) => {
      const { name, email, message } = req.body;

      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        // Email options
        const mailOptions = {
          from: `"MarketPulse Contact" <${process.env.EMAIL_USER}>`,
          to: process.env.EMAIL_USER,
          subject: `MarketPulse Form Message from ${name}`,
          html: `
        <h3>New Message from MarketPulse Contact Form</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong><br/> ${message}</p>
      `,
        };

        // Send email
        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: "Message sent successfully!" });
      } catch (error) {
        // console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send message" });
      }
    });

    // =============================UPDATE API=============================

    // Updating Users Signin Time
    app.patch("/update-last-login", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) {
          return res.status(400).send({ error: "Email is required" });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: { lastSignedIn: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({ message: "Last login updated", result });
      } catch (error) {
        res.status(500).send({ error: "Update failed" });
      }
    });

    // PATCH /users/updateProfile/:id
    app.patch("/users/updateProfile", async (req, res) => {
      try {
        const { email } = req.query;
        const { name, photo } = req.body;

        const updateData = { name, photo };

        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update profile" });
      }
    });

    // Update a user's role
    app.patch(
      "/users/updateRole/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        const userId = req.params.id;
        const { role } = req.body;

        if (!["user", "vendor", "admin"].includes(role)) {
          return res.status(400).send({ message: "Invalid role" });
        }

        try {
          const result = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { role } }
          );
          res.send(result);
        } catch (err) {
          res.status(500).send({ message: "Failed to update role" });
        }
      }
    );

    // Product approval API
    app.patch(
      "/approve-product/:productId",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        const { productId } = req.params;
        const { status } = req.body;

        if (!status) {
          return res.status(400).json({ error: "Status is required" });
        }

        try {
          const filter = { _id: new ObjectId(productId) };

          let updatedDoc = {};

          if (status === "approved") {
            updatedDoc = {
              $set: { status },
              $unset: {
                rejectionFeedback: "",
                rejectionReason: "",
              },
            };
          } else {
            updatedDoc = {
              $set: { status },
            };
          }

          const updatedProduct = await productCollections.updateOne(
            filter,
            updatedDoc
          );
          if (!updatedProduct) {
            return res.status(404).json({ error: "Product not found" });
          }
          res.send(updatedProduct);
        } catch (error) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    // Ad approval API
    app.patch(
      "/approve-ad/:adId",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        const { adId } = req.params;
        const { status } = req.body;

        if (!status) {
          return res.status(400).json({ error: "Status is required" });
        }

        try {
          const filter = { _id: new ObjectId(adId) };

          let updatedDoc = {};

          if (status === "approved") {
            updatedDoc = {
              $set: { status },
              $unset: {
                rejectionFeedback: "",
                rejectionReason: "",
              },
            };
          } else {
            updatedDoc = {
              $set: { status },
            };
          }

          const updatedProduct = await adCollections.updateOne(
            filter,
            updatedDoc
          );
          if (!updatedProduct) {
            return res.status(404).json({ error: "Advertisement not found" });
          }
          res.send(updatedProduct);
        } catch (error) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    //Update a product API
    app.patch(
      "/modify-product/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor", "admin"),
      async (req, res) => {
        const productsData = req.body;
        const id = req.params.id;

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: { ...productsData },
        };

        try {
          const result = await productCollections.updateOne(filter, updatedDoc);

          if (result.modifiedCount === 0) {
            return res.status(404).json({ message: "Update failed" });
          }

          res.send(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to update product" });
        }
      }
    );

    //Update a advertisement API
    app.patch(
      "/update-ad/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor"),
      async (req, res) => {
        const adId = req.params.id;
        const updateData = req.body;

        try {
          const filter = { _id: new ObjectId(adId) };

          const updateDoc = {
            $set: {
              ...updateData,
              updatedAt: new Date(),
            },
          };

          const result = await adCollections.updateOne(filter, updateDoc);
          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Advertisement not found" });
          }

          res.send(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to update advertisement" });
        }
      }
    );

    // Reject a project API
    app.patch(
      "/reject-product/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        try {
          const { id } = req.params;
          const { reason, feedback } = req.body;

          const result = await productCollections.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "rejected",
                rejectionReason: reason,
                rejectionFeedback: feedback,
              },
            }
          );

          if (result.modifiedCount > 0) {
            res.send(result);
          } else {
            res.status(400).send({ message: "Update failed" });
          }
        } catch (error) {
          res
            .status(500)
            .send({ message: "Server error", error: error.message });
        }
      }
    );

    // Reject a advertisement API
    app.patch(
      "/reject-advertisement/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        try {
          const { id } = req.params;
          const { reason, feedback } = req.body;

          const result = await adCollections.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "rejected",
                rejectionReason: reason,
                rejectionFeedback: feedback,
              },
            }
          );

          if (result.modifiedCount > 0) {
            res.send(result);
          } else {
            res.status(400).send({ message: "Update failed" });
          }
        } catch (error) {
          res
            .status(500)
            .send({ message: "Server error", error: error.message });
        }
      }
    );

    // Update cart item quantity
    app.patch(
      "/cart/update/:itemId",
      verifyToken,
      verifyTokenEmail,
      async (req, res) => {
        const { itemId } = req.params;
        const { email, action } = req.query;

        if (!action || !["increase", "decrease"].includes(action)) {
          return res
            .status(400)
            .json({ message: "Invalid action. Use 'increase' or 'decrease'." });
        }

        try {
          const cartItem = await cartCollections.findOne({
            _id: new ObjectId(itemId),
            buyerEmail: email,
          });

          if (!cartItem) {
            return res.status(404).json({ message: "Item not found" });
          }

          // Prevent decreasing below 1
          if (action === "decrease" && cartItem.quantity <= 1) {
            return res
              .status(400)
              .json({ message: "Quantity cannot be less than 1" });
          }

          const increment = action === "increase" ? 1 : -1;

          const result = await cartCollections.updateOne(
            { _id: new ObjectId(itemId), buyerEmail: email },
            { $inc: { quantity: increment } }
          );

          res.json(result);
        } catch (error) {
          res.status(500).json({ error: "Server error" });
        }
      }
    );

    // Update vendor application status
    app.patch(
      "/vendor-requests/:vendorId",
      verifyToken,
      verifyTokenEmail,
      verifyRole("admin"),
      async (req, res) => {
        try {
          const { vendorId } = req.params;
          const { status } = req.body;

          if (!["pending", "approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status value" });
          }

          // Find the vendor application first
          const vendorApplication = await vendorsCollection.findOne({
            _id: new ObjectId(vendorId),
          });

          if (!vendorApplication) {
            return res
              .status(404)
              .json({ message: "Vendor application not found" });
          }

          // Prevent changing status if already approved or rejected
          if (
            vendorApplication.vendor_status === "approved" ||
            vendorApplication.vendor_status === "rejected"
          ) {
            return res.status(400).json({
              message: `Cannot update. Vendor is already ${vendorApplication.vendor_status}`,
            });
          }

          // Update vendor_status in vendorApplications
          await vendorsCollection.updateOne(
            { _id: new ObjectId(vendorId) },
            { $set: { vendor_status: status } }
          );

          // If approved, update user's role in the users collection
          if (status === "approved") {
            await usersCollection.updateOne(
              { email: vendorApplication.email },
              { $set: { role: "vendor" } }
            );
          }

          res
            .status(200)
            .json({ message: "Vendor status updated successfully" });
        } catch (err) {
          res.status(500).json({ message: "Internal server error" });
        }
      }
    );

    // =============================DELETE API=============================

    // DELETE a product
    app.delete(
      "/delete-products/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor", "admin"),
      async (req, res) => {
        try {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) };
          const result = await productCollections.deleteOne(filter);
          res.send(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to delete product" });
        }
      }
    );

    // DELETE an advertisement
    app.delete(
      "/delete-ad/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("vendor", "admin"),
      async (req, res) => {
        try {
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) };
          const result = await adCollections.deleteOne(filter);
          res.send(result);
        } catch (err) {
          res.status(500).json({ error: "Failed to delete product" });
        }
      }
    );

    // Delete a product from Cart
    app.delete(
      "/delete-productCart/:itemId",
      verifyToken,
      verifyTokenEmail,
      async (req, res) => {
        const { itemId } = req.params;
        const { email } = req.query;

        try {
          const result = await cartCollections.deleteOne({
            _id: new ObjectId(itemId),
            buyerEmail: email,
          });

          res.json({ message: "Item removed successfully" });
        } catch (error) {
          res.status(500).json({ error: "Server error" });
        }
      }
    );

    // Clear all products from Cart
    app.delete(
      "/clear-cart",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({ error: "Email is required." });
        }

        try {
          const result = await cartCollections.deleteMany({
            buyerEmail: email,
          });

          res.status(200).json({
            message: `Cleared ${result.deletedCount} items from cart`,
            deletedCount: result.deletedCount,
          });
        } catch (error) {
          res.status(500).json({ error: "Failed to clear cart" });
        }
      }
    );

    // Delete a product from wishlist
    app.delete(
      "/delete-wishlist/:id",
      verifyToken,
      verifyTokenEmail,
      verifyRole("user"),
      async (req, res) => {
        try {
          const wishlistId = req.params.id;
          const email = req.query.email;

          const query = { productId: wishlistId };

          // Delete the wishlist item
          const result = await wishCollections.deleteOne(query);
          res.send(result);
        } catch (error) {
          res.status(500).json({ message: "Server error." });
        }
      }
    );

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("Server is running on", port);
});
