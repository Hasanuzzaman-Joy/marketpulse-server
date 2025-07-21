require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors")
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");

// Middlewares
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();

        const usersCollection = client.db("usersDB").collection("users");
        const vendorsCollection = client.db("usersDB").collection("vendorApplications");
        const productCollections = client.db("usersDB").collection("products");
        const adCollections = client.db("usersDB").collection("ad");
        const wishCollections = client.db("usersDB").collection("wishLists");

        // =============================CUSTOM MIDDLEWARES=============================
        const verifyToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).send({ message: "Unauthorized: No token provided" });
            }

            const token = authHeader.split(" ")[1].trim();

            jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
                if (err) {
                    return res.status(403).send({ message: "Forbidden: Invalid token" });
                }
                req.decoded = decoded;
                next();
            });
        }

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
                        return res.status(401).json({ message: "Unauthorized: No email found" });
                    }

                    const user = await usersCollection.findOne(
                        { email },
                        { projection: { role: 1 } }
                    );

                    if (!expectedRoles.includes(user?.role)) {
                        return res.status(403).json({ message: `Forbidden: ${expectedRoles.join(", ")} only` });
                    }

                    next();
                } catch (error) {
                    res.status(500).json({ message: "Server error" });
                }
            };
        };

        // =============================GET API=============================

        // GET all users
        app.get("/users", verifyToken, verifyTokenEmail, verifyRole("admin"), async (req, res) => {
            try {
                const users = await usersCollection.find().toArray();
                res.send(users);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch users." });
            }
        });

        // GET user role
        app.get("/usersRole", verifyToken, verifyTokenEmail, verifyRole("admin", "vendor", "user"), async (req, res) => {
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
        });

        // GET all products for admin
        app.get("/all-products", verifyToken, verifyTokenEmail, verifyRole("admin", "user"), async (req, res) => {
            try {
                const products = await productCollections
                    .find({})
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(products);
            } catch (err) {
                res.status(500).json({ error: "Failed to fetch products" });
            }
        });

        // GET all products by vendor
        app.get("/my-products", verifyToken, verifyToken, verifyRole("vendor"), async (req, res) => {
            const email = req.query.email;
            const query = { vendorEmail: email }
            try {
                const products = await productCollections
                    .find(query)
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(products);
            } catch (err) {
                res.status(500).json({ error: "Failed to fetch products" });
            }
        });

        // GET single product 
        app.get("/single-product/:id", verifyToken, verifyRole("vendor", "admin"), async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const products = await productCollections.findOne(filter);
                res.send(products);
            } catch (err) {
                res.status(500).json({ error: "Failed to fetch the product" });
            }
        })

        // GET advertisements by vendor
        app.get("/my-advertisements", verifyToken, verifyRole("vendor", "admin"), async (req, res) => {
            const email = req.query.email;

            let query = {}

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
        });

        // Wishlist get API
        app.get("/get-wishlist", verifyToken, verifyTokenEmail, verifyRole("user"), async (req, res) => {
            try {
                const { email } = req.query;

                if (!email) {
                    return res.status(400).json({ message: "Email is required." });
                }

                // Get all wishlist items for the user
                const wishlistItems = await wishCollections.find({ email }).toArray();

                // Extract all product IDs
                const productIds = wishlistItems.map(item => new ObjectId(item.productId));

                // Find all products that match those IDs
                const products = await productCollections.find({ _id: { $in: productIds } }).toArray();
                res.status(200).json(products);
            } catch (error) {
                res.status(500).json({ message: "Server error." });
            }
        });
        // =============================POST API=============================

        // JWT Implementation
        app.post("/jwt", async (req, res) => {
            const { email } = req.body;
            const token = jwt.sign({ email }, process.env.JWT_SECRET_KEY);
            res.send({ token });
        })

        // Sending users to DB
        app.post("/register", async (req, res) => {
            const { name, email, photo } = req.body;
            const users = {
                name,
                email,
                photo,
                role: "user",
                createdAt: new Date(),
                lastSignedIn: new Date()
            }
            const result = await usersCollection.insertOne(users);
            res.send(result)
        })

        // Apply to become a vendor
        app.post("/vendors/apply", verifyToken, verifyTokenEmail, verifyRole("user"), async (req, res) => {
            try {
                const vendorData = req.body;
                const data = { ...vendorData, vendor_status: "pending", createdAt: new Date(), }

                const result = await vendorsCollection.insertOne(data);
                res.status(201).send(result);
            } catch (err) {
                res.status(403).json({ message: "Server error. Please try again later." });
            }
        });

        // Add Products API
        app.post("/add-products", verifyToken, verifyTokenEmail, verifyRole("vendor"), async (req, res) => {
            try {
                const productData = req.body;
                const data = { ...productData, createdAt: new Date(), updatedAt: new Date() }

                const result = await productCollections.insertOne(data);
                res.status(201).send(result);
            }
            catch (error) {
                res.status(500).json({ message: "Server error" });
            }
        });

        // Add Advertisement API
        app.post("/advertisements", verifyToken, verifyTokenEmail, verifyRole("vendor"), async (req, res) => {
            try {
                const formData = req.body;

                const data = {
                    ...formData,
                    status: "pending",
                    createdAt: new Date()
                };

                const result = await adCollections.insertOne(data)
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ error: "Something went wrong" });
            }
        });

        // Wishlist post API
        app.post("/wishlist", async (req, res) => {
            try {
                const { productId } = req.body;
                const email = req.query.email;

                if (!email || !productId) {
                    return res.status(400).json({ message: "Email and productId are required." });
                }

                // Check if this product already exists in the user's wishlist
                const alreadyExists = await wishCollections.findOne({ email, productId });

                if (alreadyExists) {
                    return res.status(409).json({ message: "Already added to wishlist." });
                }

                const result = await wishCollections.insertOne({ email, productId, createdAt: new Date() });

                res.send(result);
            } catch (error) {
                res.status(500).json({ message: "Server error" });
            }
        });
        // =============================UPDATE API=============================

        // Updating Users Signin Time
        app.patch("/register", async (req, res) => {
            try {
                const { email, lastSignedIn } = req.body;
                if (!email || !lastSignedIn) {
                    return res.status(400).send({ error: "Email and lastSignedIn are required" });
                }

                const filter = { email };
                const updateDoc = { $set: { lastSignedIn: new Date(lastSignedIn) } };
                const result = await usersCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "User not found" });
                }

                res.send({ message: "Last signed in updated successfully", result });
            } catch (error) {
                res.status(500).send({ error: "Internal Server Error" });
            }
        });

        // Update a user's role
        app.patch("/users/updateRole/:id", verifyToken, verifyTokenEmail, verifyRole("admin"), async (req, res) => {
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
            }
            catch (err) {
                res.status(500).send({ message: "Failed to update role" });
            }
        });

        // Product approval API
        app.patch("/approve-product/:productId", verifyToken, verifyTokenEmail, verifyRole("admin"), async (req, res) => {
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
                            rejectionReason: ""
                        }
                    }
                }
                else {
                    updatedDoc = {
                        $set: { status }
                    }
                }

                const updatedProduct = await productCollections.updateOne(filter, updatedDoc);
                if (!updatedProduct) {
                    return res.status(404).json({ error: "Product not found" });
                }
                res.send(updatedProduct)
            } catch (error) {
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // Ad approval API
        app.patch("/approve-ad/:adId", verifyToken, verifyTokenEmail, verifyRole("admin"), async (req, res) => {
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
                            rejectionReason: ""
                        }
                    }
                }
                else {
                    updatedDoc = {
                        $set: { status }
                    }
                }

                const updatedProduct = await adCollections.updateOne(filter, updatedDoc);
                if (!updatedProduct) {
                    return res.status(404).json({ error: "Advertisement not found" });
                }
                res.send(updatedProduct)
            } catch (error) {
                res.status(500).json({ error: "Internal server error" });
            }
        });

        //Update a product API
        app.patch("/modify-product/:id", verifyToken, verifyTokenEmail, verifyRole("vendor", "admin"), async (req, res) => {
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
        app.patch("/update-ad/:id", verifyToken, verifyTokenEmail, verifyRole("vendor"), async (req, res) => {
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
        });

        // Reject a project API
        app.patch("/reject-product/:id", verifyToken, verifyTokenEmail, verifyRole("admin"), async (req, res) => {
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
                res.status(500).send({ message: "Server error", error: error.message });
            }
        });

        // Reject a advertisement API
        app.patch("/reject-advertisement/:id", verifyToken, verifyTokenEmail, verifyRole("admin"), async (req, res) => {
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
                res.status(500).send({ message: "Server error", error: error.message });
            }
        });

        // =============================DELETE API=============================

        // DELETE a product
        app.delete("/delete-products/:id", verifyToken, verifyTokenEmail, verifyRole("vendor", "admin"), async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const result = await productCollections.deleteOne(filter);
                res.send(result);
            } catch (err) {
                res.status(500).json({ error: "Failed to delete product" });
            }
        });

        // DELETE an advertisement
        app.delete("/delete-ad/:id", verifyToken, verifyTokenEmail, verifyRole("vendor", "admin"), async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const result = await adCollections.deleteOne(filter);
                res.send(result);
            } catch (err) {
                res.status(500).json({ error: "Failed to delete product" });
            }
        });

        app.delete("/delete-wishlist/:id", verifyToken, verifyTokenEmail, verifyRole("user"), async (req, res) => {
            try {
                const wishlistId = req.params.id;
                const email = req.query.email;

                const query = {productId : wishlistId}

                // Delete the wishlist item
                const result = await wishCollections.deleteOne(query);
                res.send(result);
            } catch (error) {
                res.status(500).json({ message: "Server error." });
            }
        });

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log("Server is running on", port)
})