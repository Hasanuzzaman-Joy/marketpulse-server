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

        const verifyRole = (expectedRole) => {
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

                    if (user?.role !== expectedRole) {
                        return res.status(403).json({ message: `Forbidden: ${expectedRole}s only` });
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
                console.error("Error updating lastSignedIn:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });

        // PATCH: Update a user's role
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

        // =============================DELETE API=============================


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