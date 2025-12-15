const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

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
    // Collections--------------->
    const db = client.db("eTuitionBd");
    const usersCollection = db.collection("users");
    const tutorsCollection = db.collection("tutors");
    const tuitionsCollection = db.collection("tuitions");

    // USERS APIs--------------->

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.role = user.role || "student";
      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) return res.send({ message: "User already exists" });

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send({ role: user?.role || "student" });
    });

    // TUTORS APIs--------------->
    app.post("/tutors", async (req, res) => {
      const tutor = req.body;
      tutor.status = "pending";
      tutor.createdAt = new Date();

      const result = await tutorsCollection.insertOne(tutor);
      res.send(result);
    });

    app.get("/tutors", async (req, res) => {
      const query = {};
      const result = await tutorsCollection.find(query).toArray();
      res.send(result);
    });

    // TUITIONS APIs--------------->
    app.get("/tuitions", async (req, res) => {
      const email = req.query.email;

      const query = {};
      if (email) {
        query.studentEmail = email;
      }

      const result = await tuitionsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/tuitions/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const tuition = await tuitionsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!tuition) {
          return res.status(404).json({ message: "Tuition not found" });
        }
        res.status(200).json(tuition);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch tuition" });
      }
    });

    app.post("/tuitions", async (req, res) => {
      const tuition = req.body;
      tuition.createdAt = new Date();
      tuition.status = "active";
      tuition.appliedTutors = [];

      const result = await tuitionsCollection.insertOne(tuition);
      res.send(result);
    });

    app.patch("/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await tuitionsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    app.delete("/tuitions/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await tuitionsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Tuition not found" });
        }

        res.json({ message: "Tuition deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to delete tuition" });
      }
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
