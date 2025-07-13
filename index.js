require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors")
const { MongoClient, ServerApiVersion } = require('mongodb');

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

        app.get("/", (req, res) => {
            res.send("Server is running")
        })

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