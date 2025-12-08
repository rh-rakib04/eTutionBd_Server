const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// -----------------------------
// Middlewares
// -----------------------------
app.use(express.json());
app.use(cors());

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
