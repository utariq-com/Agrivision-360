require("dotenv").config();
console.log("Loaded ENV variables:", process.env);
const express = require("express");
const mysql = require("mysql2");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());




const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.PORT || 3306, // Default MySQL port
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err.stack);
    return;
  }
  console.log("✅ Connected to MySQL database.");
});





const mongoUrl = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}?authSource=${process.env.MONGO_AUTH}`;
console.log("MongoDB Connection URL:", mongoUrl); // Debugging line
const mongoClient = new MongoClient(mongoUrl);

async function connectMongo() {
  try {
    await mongoClient.connect();
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error);
    process.exit(1);
  }
}
connectMongo();




app.get("/", (req, res) => {
  res.send("🚀 API is running...");
});


app.get("/mysql", (req, res) => {
  db.query("SELECT * FROM accounts", (err, results) => {
    if (err) {
      console.error("❌ MySQL Query Error:", err);
      res.status(500).json({ error: err.message });
    } else {
      console.log("📦 MySQL Data Fetched:", results);
      res.json(results);
    }
  });
});


app.get("/mongo", async (req, res) => {
  try {
    const db = mongoClient.db("testDB");
    const users = await db.collection("users").find().toArray();
    res.json({ success: true, data: users });
  } catch (error) {
    console.error("❌ MongoDB Query Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});



app.post("/mongo/devices", async (req, res) => {
  try {
    const { device_name, mac_address } = req.body;

    if (!device_name || !mac_address) {
      return res.status(400).json({ success: false, message: "Device name and MAC address are required" });
    }

    const db = mongoClient.db("agriVision");
    const devicesCollection = db.collection("devices");

    // Check if a device with the same MAC already exists
    const existingDevice = await devicesCollection.findOne({ mac_address });

    if (existingDevice) {
      if (existingDevice.device_name !== device_name) {
        // Delete the old record since the device_name has changed
        await devicesCollection.deleteOne({ mac_address });
      } else {
        // If the device name is the same, just update last_online
        await devicesCollection.updateOne(
          { mac_address },
          { $set: { last_online: new Date() } }
        );
        return res.json({ success: true, message: "Device last_online updated", data: existingDevice });
      }
    }

    // Get the last inserted document to determine the next id
    const lastDevice = await devicesCollection.find().sort({ id: -1 }).limit(1).toArray();
    const newId = lastDevice.length > 0 ? lastDevice[0].id + 1 : 1;

    // Insert new device with active status
    const newDevice = {
      id: newId,
      device_name,
      mac_address,
      status: "active",
      last_online: new Date(),
    };

    await devicesCollection.insertOne(newDevice);
    res.json({ success: true, message: "Device added successfully", data: newDevice });

  } catch (error) {
    console.error("❌ Error inserting/updating device:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});




const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
