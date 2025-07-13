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
                createdAt: new Date(),
                lastSignIn: new Date()
            }
            console.log(users)
            const result = await usersCollection.insertOne(users);
        })

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