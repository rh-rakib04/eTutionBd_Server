const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aczt7zj.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// -----------------------------
// Middlewares
// -----------------------------
app.use(express.json());
app.use(cors());

//------------------------------
//------------------------------
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    //------collection
    const db = client.db("eTuitionBd");
    const studentCollection = db.collection("student");

    // ✅ CREATE STUDENT
    app.post("/students", async (req, res) => {
      const student = req.body;
      const result = await studentCollection.insertOne(student);
      res.send(result);
    });

    // ✅ GET ALL STUDENTS
    app.get("/students", async (req, res) => {
      const result = await studentCollection.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

// -----------------------------
// Root Endpoint
// -----------------------------
app.get("/", (req, res) => {
  res.send("ETutionBd running ....!");
});

// -----------------------------
// Start Server
// -----------------------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
