const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

const admin = require("firebase-admin");

// Decode base64 string back into JSON
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aczt7zj.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("Decoded user email:", decoded.email);
    req.decodedEmail = decoded.email.toLowerCase();

    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const stripe = require("stripe")(process.env.STRIPE_KEY);

// -----------------------------
// Middlewares
// -----------------------------
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173", // your frontend dev server
    credentials: true, // allow cookies/authorization headers
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
    const reviewsCollection = db.collection("reviews");

    // ----------------------------------------------------
    //--------------------->Admin Middleware<---------------
    const verifyAdmin = async (req, res, next) => {
      const email = req.decodedEmail;
      const user = await usersCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // ----------------------------------------------------
    //--------------------->Tutor Middleware<---------------
    const verifyTutor = async (req, res, next) => {
      const email = req.decodedEmail;
      const tutor = await usersCollection.findOne({ email });
      if (!tutor || tutor.role !== "tutor") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };
    // ----------------------------------------------
    // ---------------------> USERS APIs <-----------

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        // Normalize email
        if (!user.email) {
          return res
            .status(400)
            .send({ success: false, message: "Email is required" });
        }

        user.email = user.email.toLowerCase();
        user.createdAt = new Date();
        user.role = user.role || "student";

        // Check if user already exists
        const exists = await usersCollection.findOne({ email: user.email });
        if (exists) {
          return res.send({ success: true, message: "User already exists" });
        }

        // Insert new user
        const result = await usersCollection.insertOne(user);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating user:", error.message);
        res
          .status(500)
          .send({ success: false, message: "Failed to create user" });
      }
    });

    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email.toLowerCase();
        const user = await usersCollection.findOne({ email });
        res.send({ role: user?.role || "student" });
      } catch (error) {
        console.error("Error fetching user role:", error.message);
        res.status(500).send({ message: "Failed to fetch user role" });
      }
    });

    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error.message);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    app.patch("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating user:", error.message);
        res.status(500).send({ message: "Failed to update user" });
      }
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { role } = req.body;

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } }
          );

          res.send({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Error updating user role:", error.message);
          res.status(500).send({ message: "Failed to update user role" });
        }
      }
    );

    app.patch(
      "/users/:id/status",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body; // active | blocked

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } }
          );

          res.send({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Error updating user status:", error.message);
          res.status(500).send({ message: "Failed to update user status" });
        }
      }
    );

    app.patch("/users/:email", verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email.toLowerCase();
        const { displayName, photoURL, age, address, phone, bio } = req.body;

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: { displayName, photoURL, age, address, phone, bio },
          }
        );

        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating user profile:", error.message);
        res.status(500).send({ message: "Failed to update user profile" });
      }
    });

    app.delete("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ success: true, message: "User deleted successfully" });
      } catch (error) {
        console.error("Error deleting user:", error.message);
        res.status(500).send({ message: "Failed to delete user" });
      }
    });

    // ------------------------------------------------
    // ---------------------> TUTORS APIs <------------
    app.post("/tutors", verifyFBToken, verifyTutor, async (req, res) => {
      try {
        const tutor = req.body;
        tutor.email = tutor.email.toLowerCase();
        tutor.role = "tutor";
        tutor.status = "pending";
        tutor.createdAt = new Date();

        const exists = await tutorsCollection.findOne({ email: tutor.email });
        if (exists)
          return res.status(400).send({ message: "Tutor already exists" });

        const result = await tutorsCollection.insertOne(tutor);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating tutor:", error.message);
        res.status(500).send({ message: "Failed to create tutor" });
      }
    });

    app.get("/tutors", async (req, res) => {
      try {
        const result = await tutorsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching tutors:", error.message);
        res.status(500).send({ message: "Failed to fetch tutors" });
      }
    });

    app.get(
      "/tutor/ongoing-tuitions",
      verifyFBToken,
      verifyTutor,
      async (req, res) => {
        try {
          const email = req.query.email?.toLowerCase();
          if (!email)
            return res.status(400).send({ message: "Tutor email required" });

          const approvedApplications = await applicationsCollection
            .find({ tutorEmail: email, status: "approved" })
            .toArray();
          if (!approvedApplications.length) return res.send([]);

          const tuitionIds = approvedApplications.map((app) =>
            typeof app.tuitionId === "string"
              ? new ObjectId(app.tuitionId)
              : app.tuitionId
          );

          const tuitions = await tuitionsCollection
            .find({ _id: { $in: tuitionIds } })
            .toArray();

          const ongoingTuitions = approvedApplications.map((app) => {
            const tuition = tuitions.find(
              (t) => t._id.toString() === app.tuitionId.toString()
            );
            return {
              applicationId: app._id,
              tuitionId: tuition?._id,
              subject: tuition?.subject,
              classLevel: tuition?.classLevel,
              location: tuition?.location,
              salary: tuition?.salary,
              studentEmail: tuition?.studentEmail,
              tutorName: app.tutorName,
              tuitionStatus: tuition?.status,
              status: app.status,
              assignedAt: app.createdAt,
            };
          });

          res.send(ongoingTuitions);
        } catch (error) {
          console.error("Error fetching ongoing tuitions:", error.message);
          res.status(500).send({ message: "Failed to load ongoing tuitions" });
        }
      }
    );

    app.get("/tutors/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const tutor = await tutorsCollection.findOne({ _id: new ObjectId(id) });

        if (!tutor) return res.status(404).send({ message: "Tutor not found" });

        res.send(tutor);
      } catch (error) {
        console.error("Error fetching tutor details:", error.message);
        res.status(500).send({ message: "Failed to fetch tutor details" });
      }
    });

    // --------------------------------------------------
    // ---------------------> Payment APIs <-------------
    app.post(
      "/create-tutor-checkout-session",
      verifyFBToken,
      async (req, res) => {
        try {
          const { amount, tutorName, studentEmail, applicationId, tuitionId } =
            req.body;

          // Normalize student email
          const normalizedEmail = studentEmail.toLowerCase();

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
            customer_email: normalizedEmail,
            metadata: {
              applicationId,
              tuitionId,
              tutorName,
              subject,
            },
            success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
          });

          res.send({ success: true, url: session.url });
        } catch (error) {
          console.error("Error creating checkout session:", error.message);
          res
            .status(500)
            .send({ message: "Failed to create checkout session" });
        }
      }
    );

    app.patch("/tutor-payment-success", verifyFBToken, async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId)
          return res.status(400).send({ message: "Session ID missing" });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== "paid") {
          return res.send({ success: false, message: "Payment not completed" });
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
        if (!application)
          return res.status(404).send({ message: "Application not found" });

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

        // Save payment with tutorEmail normalized
        await paymentsCollection.insertOne({
          transactionId,
          amount,
          currency: session.currency,
          studentEmail: session.customer_email.toLowerCase(),
          tutorEmail: application.tutorEmail.toLowerCase(),
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
        console.error("Error processing payment:", error.message);
        res.status(500).send({ message: "Payment processing failed" });
      }
    });

    app.get("/payments", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email?.toLowerCase();
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
        console.error("Error fetching payments:", error.message);
        res.status(500).send({ message: "Failed to fetch payments" });
      }
    });

    app.get("/payments/admin", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const result = await paymentsCollection
          .find()
          .sort({ paidAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching admin payments:", error.message);
        res.status(500).send({ message: "Failed to fetch admin payments" });
      }
    });

    app.get("/payments/tutor", verifyFBToken, verifyTutor, async (req, res) => {
      try {
        const email = req.query.email?.toLowerCase();
        if (!email)
          return res.status(400).send({ message: "Tutor email required" });

        const payments = await paymentsCollection
          .find({ tutorEmail: email })
          .sort({ paidAt: -1 })
          .toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error fetching tutor payments:", error.message);
        res.status(500).send({ message: "Failed to fetch tutor payments" });
      }
    });

    // ----------------------------------------------------
    // ---------------------> Application APIs <-----------
    app.post("/applications", verifyFBToken, async (req, res) => {
      try {
        const application = req.body;
        application.tuitionId = new ObjectId(application.tuitionId);
        application.tutorEmail = application.tutorEmail?.toLowerCase();
        application.status = "pending";
        application.createdAt = new Date();

        const result = await applicationsCollection.insertOne(application);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating application:", error.message);
        res.status(500).send({ message: "Failed to apply for tuition" });
      }
    });

    app.get("/applications/tutor", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email?.toLowerCase();
        if (!email)
          return res.status(400).send({ message: "Tutor email required" });

        const result = await applicationsCollection
          .find({ tutorEmail: email })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching tutor applications:", error.message);
        res.status(500).send({ message: "Failed to fetch tutor applications" });
      }
    });

    app.get("/applications/tuition/:id", verifyFBToken, async (req, res) => {
      try {
        const tuitionId = req.params.id;
        const result = await applicationsCollection
          .find({ tuitionId: new ObjectId(tuitionId) })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching tuition applications:", error.message);
        res
          .status(500)
          .send({ message: "Failed to fetch tuition applications" });
      }
    });

    app.get("/applications/student", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email?.toLowerCase();
        if (!email) return res.send([]);

        const tuitions = await tuitionsCollection
          .find({ studentEmail: email })
          .project({ _id: 1 })
          .toArray();
        const tuitionIds = tuitions.map((t) => t._id);

        const applications = await applicationsCollection
          .find({ tuitionId: { $in: tuitionIds } })
          .toArray();
        res.send(applications);
      } catch (error) {
        console.error("Error fetching student applications:", error.message);
        res
          .status(500)
          .send({ message: "Failed to fetch student applications" });
      }
    });

    app.get("/applications", verifyFBToken, async (req, res) => {
      try {
        const result = await applicationsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching applications:", error.message);
        res.status(500).send({ message: "Failed to fetch applications" });
      }
    });

    app.patch("/applications/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!application)
          return res.status(404).send({ message: "Application not found" });
        if (application.status === "accepted") {
          return res
            .status(403)
            .send({ message: "Approved applications cannot be updated" });
        }

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body }
        );

        res.send({
          success: true,
          modifiedCount: result.modifiedCount,
          message: "Application updated successfully",
        });
      } catch (error) {
        console.error("Error updating application:", error.message);
        res.status(500).send({ message: "Failed to update application" });
      }
    });

    app.patch("/applications/approve/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!application)
          return res.status(404).send({ message: "Application not found" });
        if (application.status !== "pending")
          return res.send({ message: "Already processed" });

        await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } }
        );
        await applicationsCollection.updateMany(
          { tuitionId: application.tuitionId, _id: { $ne: new ObjectId(id) } },
          { $set: { status: "rejected" } }
        );
        await tuitionsCollection.updateOne(
          { _id: application.tuitionId },
          { $set: { status: "assigned" } }
        );

        res.send({
          success: true,
          message: "Tutor approved & others rejected",
        });
      } catch (error) {
        console.error("Error approving application:", error.message);
        res.status(500).send({ message: "Failed to approve application" });
      }
    });

    app.patch("/applications/reject/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.send({
          success: true,
          modifiedCount: result.modifiedCount,
          message: "Tutor rejected",
        });
      } catch (error) {
        console.error("Error rejecting application:", error.message);
        res.status(500).send({ message: "Failed to reject application" });
      }
    });

    app.delete("/applications/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const application = await applicationsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!application)
          return res.status(404).send({ message: "Application not found" });
        if (application.status === "accepted") {
          return res
            .status(403)
            .send({ message: "Approved applications cannot be deleted" });
        }

        const result = await applicationsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({
          success: true,
          deletedCount: result.deletedCount,
          message: "Application deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting application:", error.message);
        res.status(500).send({ message: "Failed to delete application" });
      }
    });

    // --------------------------------------------------
    // ---------------------> TUITIONS APIs <------------
    app.get("/tuitions", async (req, res) => {
      try {
        const email = req.query.email?.toLowerCase();
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
      } catch (error) {
        console.error("Error fetching tuitions:", error.message);
        res.status(500).send({ message: "Failed to fetch tuitions" });
      }
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
        console.error("Error fetching tuition details:", error.message);
        res.status(500).json({ message: "Failed to fetch tuition" });
      }
    });

    app.post("/tuitions", verifyFBToken, async (req, res) => {
      try {
        const {
          subject,
          classLevel,
          location,
          salary,
          duration,
          studentEmail,
          description,
          daysPerWeek,
          image,
        } = req.body;

        if (!subject || !classLevel || !location || !salary || !studentEmail) {
          return res.status(400).send({ message: "All fields are required" });
        }

        const tuition = {
          subject,
          classLevel,
          location,
          salary,
          studentEmail: studentEmail.toLowerCase(),
          createdAt: new Date(),
          status: "pending",
          appliedTutors: [],
          description,
          duration,
          daysPerWeek,
          image,
        };

        const result = await tuitionsCollection.insertOne(tuition);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating tuition:", error.message);
        res.status(500).send({ message: "Failed to create tuition" });
      }
    });

    app.patch("/tuitions/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const result = await tuitionsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Error updating tuition status:", error.message);
        res.status(500).send({ message: "Failed to update tuition status" });
      }
    });

    app.delete("/tuitions/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await tuitionsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Tuition not found" });
        }

        res.json({ success: true, message: "Tuition deleted successfully" });
      } catch (error) {
        console.error("Error deleting tuition:", error.message);
        res.status(500).json({ message: "Failed to delete tuition" });
      }
    });

    // --------------------------------------------------
    // ---------------------> Reviews APIs <-------------

    app.post("/reviews", verifyFBToken, async (req, res) => {
      try {
        const review = req.body;
        review.createdAt = new Date();

        // Insert review
        const result = await reviewsCollection.insertOne(review);

        // Recalculate average rating for this tutor
        const reviews = await reviewsCollection
          .find({ tutorId: review.tutorId })
          .toArray();
        const avg =
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

        await tutorsCollection.updateOne(
          { _id: new ObjectId(review.tutorId) }, // ensure tutorId is stored as ObjectId in tutors
          { $set: { rating: avg.toFixed(1), reviews: reviews.length } }
        );

        res.send({
          success: true,
          insertedId: result.insertedId,
          message: "Review added successfully",
        });
      } catch (error) {
        console.error("Error adding review:", error.message);
        res
          .status(500)
          .send({ success: false, message: "Failed to add review" });
      }
    });

    app.get("/reviews/:tutorId", async (req, res) => {
      try {
        const tutorId = req.params.tutorId;

        const reviews = await reviewsCollection
          .find({ tutorId }) // keep tutorId as string consistently
          .sort({ createdAt: -1 })
          .toArray();

        res.send({ success: true, reviews });
      } catch (error) {
        console.error("Error fetching reviews:", error.message);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch reviews" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("ETutionBd running ....!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
