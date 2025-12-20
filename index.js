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

const stripe = require("stripe")(process.env.STRIPE_KEY);

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
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection("payments");

    // ----------------------------------------------------
    //--------------------->Admin Middleware<---------------
    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.decodedEmail;

    //   const user = await usersCollection.findOne({ email });

    //   if (!user || user.role !== "admin") {
    //     return res.status(403).send({ message: "Forbidden access" });
    //   }

    //   next();
    // };

    // ----------------------------------------------
    //--------------------->USERS APIs<---------------

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

    app.get("/users", async (req, res) => {
      const result = await usersCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    app.patch("/users/:id/role", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );

      res.send(result);
    });

    app.patch("/users/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body; // active | blocked

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.send(result);
    });

    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const { displayName, photoURL, age, address, phone, bio } = req.body;

      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            displayName,
            photoURL,
            age,
            address,
            phone,
            bio,
          },
        }
      );

      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;

      const result = await usersCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // ------------------------------------------------
    //--------------------->TUTORS APIs<---------------
    app.post("/tutors", async (req, res) => {
      const tutor = req.body;
      tutor.status = "pending";
      tutor.createdAt = new Date();

      const result = await tutorsCollection.insertOne(tutor);
      res.send(result);
    });

    app.get("/tutors", async (req, res) => {
      const query = {};
      const result = await tutorsCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.get("/tutor/ongoing-tuitions", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ message: "Tutor email required" });
        }

        // 1️ Find approved applications of tutor
        const approvedApplications = await applicationsCollection
          .find({
            tutorEmail: email,
            status: "approved",
          })
          .toArray();

        if (approvedApplications.length === 0) {
          return res.send([]);
        }

        const tuitionIds = approvedApplications.map((app) =>
          typeof app.tuitionId === "string"
            ? new ObjectId(app.tuitionId)
            : app.tuitionId
        );

        const tuitions = await tuitionsCollection
          .find({ _id: { $in: tuitionIds } })
          .toArray();

        //  Merge tuition + application info
        const ongoingTuitions = approvedApplications.map((app) => {
          const tuition = tuitions.find(
            (t) => t._id.toString() === app.tuitionId.toString()
          );

          return {
            applicationId: app._id,
            tuitionId: tuition._id,
            subject: tuition?.subject,
            classLevel: tuition?.classLevel,
            location: tuition?.location,
            salary: tuition?.salary,
            studentEmail: tuition?.studentEmail,
            tutorName: app.tutorName,
            tuitionStatus: tuition?.status,
            tuitionId: tuition?._id,
            status: app.status,
            assignedAt: app.createdAt,
          };
        });

        res.send(ongoingTuitions);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load ongoing tuitions" });
      }
    });

    // --------------------------------------------------
    //--------------------->Payment APIs<----------------
    app.post("/create-tutor-checkout-session", async (req, res) => {
      const { amount, tutorName, studentEmail, applicationId, tuitionId } =
        req.body;

      // Fetch tuition name
      const tuition = await tuitionsCollection.findOne({
        _id: new ObjectId(tuitionId),
      });
      const subject = tuition?.subject || "Unknown Tuition";

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: amount * 100,
              product_data: {
                name: `Tutor Payment - ${tutorName} (${subject})`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: studentEmail,
        metadata: {
          applicationId,
          tuitionId,
          tutorName,
          subject,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/tutor-payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ message: "Session ID missing" });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res.send({ message: "Payment not completed" });
        }

        // Extract metadata
        const { applicationId, tuitionId, tutorName } = session.metadata;
        const transactionId = session.payment_intent;
        const amount = session.amount_total / 100;

        // Check for duplicate payment
        const existing = await paymentsCollection.findOne({ transactionId });
        if (existing) {
          return res.send({
            success: true,
            message: "Payment already processed",
            tuitionName: existing.tuitionName,
            tutorName: existing.tutorName,
          });
        }

        // Fetch application to get tutorEmail
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(applicationId),
        });
        if (!application) {
          return res.status(404).send({ message: "Application not found" });
        }

        // Approve tutor
        await applicationsCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          { $set: { status: "approved" } }
        );

        // Reject other tutors for same tuition
        await applicationsCollection.updateMany(
          {
            tuitionId: new ObjectId(tuitionId),
            _id: { $ne: new ObjectId(applicationId) },
          },
          { $set: { status: "rejected" } }
        );

        // Mark tuition as assigned
        await tuitionsCollection.updateOne(
          { _id: new ObjectId(tuitionId) },
          { $set: { status: "assigned" } }
        );

        // Save payment with tutorEmail
        await paymentsCollection.insertOne({
          transactionId,
          amount,
          currency: session.currency,
          studentEmail: session.customer_email,
          tutorEmail: application.tutorEmail,
          tutorName,
          tuitionId,
          tuitionName: session.metadata.subject,
          paymentStatus: "paid",
          paidAt: new Date(),
        });

        return res.send({
          success: true,
          message: "Payment successful",
          tuitionName: session.metadata.subject,
          tutorName,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).send({ message: "Payment processing failed" });
      }
    });

    app.get("/payments", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ message: "Email required" });

        const payments = await paymentsCollection
          .find({ studentEmail: email })
          .sort({ paidAt: -1 })
          .toArray();

        // Add tuition subject for each payment
        const paymentsWithSubject = await Promise.all(
          payments.map(async (p) => {
            if (!p.tuitionName) {
              const tuition = await tuitionsCollection.findOne({
                _id: new ObjectId(p.tuitionId),
              });
              p.tuitionName = tuition?.subject || "Unknown Tuition";
            }
            return p;
          })
        );

        res.send(paymentsWithSubject);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch payments" });
      }
    });

    app.get("/payments/tutor", async (req, res) => {
      const email = req.query.email;
      if (!email)
        return res.status(400).send({ message: "Tutor email required" });

      const payments = await paymentsCollection
        .find({ tutorEmail: email })
        .sort({ paidAt: -1 })
        .toArray();

      res.send(payments);
    });

    // ----------------------------------------------------
    //--------------------->Application APIs<--------------
    app.post("/applications", async (req, res) => {
      try {
        const application = req.body;

        // Convert tuitionId string to ObjectId
        application.tuitionId = new ObjectId(application.tuitionId);

        application.status = "pending";
        application.createdAt = new Date();

        const result = await applicationsCollection.insertOne(application);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to apply for tuition" });
      }
    });

    app.get("/applications/tutor", async (req, res) => {
      const email = req.query.email;

      const result = await db
        .collection("applications")
        .find({ tutorEmail: email })
        .toArray();

      res.send(result);
    });

    app.get("/applications/tuition/:id", async (req, res) => {
      const tuitionId = req.params.id;

      const result = await applicationsCollection
        .find({ tuitionId: new ObjectId(tuitionId) })
        .toArray();

      res.send(result);
    });

    app.get("/applications/student", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.send([]);
      }

      // Step 1: find all tuitions posted by this student
      const tuitions = await tuitionsCollection
        .find({ studentEmail: email })
        .project({ _id: 1 })
        .toArray();

      // Step 2: get tuition IDs
      const tuitionIds = tuitions.map((t) => t._id);

      // Step 3: find applications for those tuitions
      const applications = await applicationsCollection
        .find({ tuitionId: { $in: tuitionIds } })
        .toArray();

      res.send(applications);
    });

    app.patch("/applications/:id", async (req, res) => {
      const id = req.params.id;

      const application = await applicationsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!application) {
        return res.status(404).send({ message: "Application not found" });
      }

      if (application.status === "accepted") {
        return res
          .status(403)
          .send({ message: "Approved applications cannot be updated" });
      }

      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );

      res.send({ message: "Application updated successfully" });
    });
    app.patch("/applications/approve/:id", async (req, res) => {
      const id = req.params.id;

      // 1️⃣ Get the approved application
      const application = await applicationsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!application) {
        return res.status(404).send({ message: "Application not found" });
      }

      if (application.status !== "pending") {
        return res.send({ message: "Already processed" });
      }

      // 2️⃣ Approve selected tutor
      await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved" } }
      );

      // 3️⃣ Reject all other tutors for SAME tuition
      await applicationsCollection.updateMany(
        {
          tuitionId: application.tuitionId,
          _id: { $ne: new ObjectId(id) },
        },
        { $set: { status: "rejected" } }
      );

      // 4️⃣ Mark tuition as assigned
      await tuitionsCollection.updateOne(
        { _id: application.tuitionId },
        { $set: { status: "assigned" } }
      );

      res.send({ message: "Tutor approved & others rejected" });
    });

    app.patch("/applications/reject/:id", async (req, res) => {
      const id = req.params.id;

      await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected" } }
      );

      res.send({ message: "Tutor rejected" });
    });

    app.delete("/applications/:id", async (req, res) => {
      const id = req.params.id;

      const application = await applicationsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!application) {
        return res.status(404).send({ message: "Application not found" });
      }

      if (application.status === "accepted") {
        return res
          .status(403)
          .send({ message: "Approved applications cannot be deleted" });
      }

      const result = await applicationsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({ message: "Application deleted successfully" });
    });

    // --------------------------------------------------
    //--------------------->TUITIONS APIs<---------------
    app.get("/tuitions", async (req, res) => {
      const email = req.query.email;
      const role = req.query.role;
      const status = req.query.status;

      let query = {};

      if (role === "student" && email) {
        query.studentEmail = email;
      }

      if (role === "tutor") {
        query.status = "active";
      }
      if (status) {
        query.status = status;
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
      const { subject, classLevel, location, salary, studentEmail } = req.body;

      if (!subject || !classLevel || !location || !salary || !studentEmail) {
        return res.status(400).send({ message: "All fields are required" });
      }

      const tuition = {
        subject,
        classLevel,
        location,
        salary,
        studentEmail,
        createdAt: new Date(),
        status: "pending",
        appliedTutors: [],
      };

      const result = await tuitionsCollection.insertOne(tuition);
      res.send(result);
    });

    app.patch("/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const result = await tuitionsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.send({ success: true, modifiedCount: result.modifiedCount });
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
