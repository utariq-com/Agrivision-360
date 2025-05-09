require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(cors({
  origin: "*",
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization"
}));


app.options("*", cors());


const mongoUrl = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}?authSource=${process.env.MONGO_AUTH}`;
console.log("🔌 Connecting to MongoDB...");

const mongoClient = new MongoClient(mongoUrl);

async function connectMongo() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}
connectMongo();

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ message: "Access Denied" });

  try {
    const verified = jwt.verify(token, SECRET_KEY);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid Token" });
  }
};

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    const usersCollection = mongoClient.db("agriVision").collection("users");
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ username, password: hashedPassword });

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const usersCollection = mongoClient.db("agriVision").collection("users");
    const user = await usersCollection.findOne({ username });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: "1h" });
    res.json({ token, username });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Error logging in" });
  }
});


app.get("/search-device", async (req, res) => {
  try {
    const { name } = req.query;
    const devicesCollection = mongoClient.db("agriVision").collection("devices");
    const devices = await devicesCollection.find({ device_name: { $regex: name, $options: "i" } }).toArray();
    res.json({ success: true, devices });
  } catch (error) {
    console.error("Error searching devices:", error);
    res.status(500).json({ success: false, message: "Error searching devices" });
  }
});


app.get("/devices", async (req, res) => {
  try {
    const devicesCollection = mongoClient.db("agriVision").collection("devices");
    const devices = await devicesCollection.find().toArray();
    res.json({ success: true, data: devices });
  } catch (error) {
    console.error("Error fetching devices:", error);
    res.status(500).json({ success: false, message: "Error fetching devices" });
  }
});

// gets the devices linked to the user - linked in settings
app.get("/user-devices", authMiddleware, async (req, res) => {
  try {
    const username = req.user.id;
    const userDevicesCollection = mongoClient.db("agriVision").collection("user_devices");
    const userDevices = await userDevicesCollection.find({ username }).toArray();

    res.json({ success: true, data: userDevices });
  } catch (error) {
    console.error("Error fetching user devices:", error);
    res.status(500).json({ success: false, message: "Error fetching user devices" });
  }
});

app.post("/add-user-device", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const username = req.user.id;

    console.log(`🔹 Received request to add device:`, { username, deviceId });

    if (!deviceId) return res.status(400).json({ success: false, message: "Invalid device ID" });

    const devicesCollection = mongoClient.db("agriVision").collection("devices");
    const userDevicesCollection = mongoClient.db("agriVision").collection("user_devices");

    const device = await devicesCollection.findOne({ _id: new ObjectId(deviceId) });
    if (!device) return res.status(404).json({ success: false, message: "Device not found" });

    const existingDevice = await userDevicesCollection.findOne({ username, deviceId });
    if (existingDevice) return res.status(400).json({ success: false, message: "Device already added" });

    await userDevicesCollection.insertOne({
      username,
      deviceId: device._id.toString(),
      device_name: device.device_name,
      mac_address: device.mac_address,
      added_at: new Date(),
    });

    console.log(`Device ${deviceId} successfully added for user ${username}.`);
    res.json({ success: true, message: "Device added successfully!" });
  } catch (error) {
    console.error("Error adding user device:", error);
    res.status(500).json({ success: false, message: "Error adding device" });
  }
});


app.delete("/user-devices/:deviceId", authMiddleware, async (req, res) => {
  try {
    const username = req.user.id;
    const { deviceId } = req.params;
    const userDevicesCollection = mongoClient.db("agriVision").collection("user_devices");
    const existingDevice = await userDevicesCollection.findOne({ username, deviceId });

    if (!existingDevice) return res.status(404).json({ success: false, message: "Device not found for user" });
    await userDevicesCollection.deleteOne({ username, deviceId });
    res.json({ success: true, message: "Device removed successfully" });

  } catch (error) {
    console.error("Error removing user device:", error);
    res.status(500).json({ success: false, message: "Error removing device" });
  }
});




app.post("/sensorDataAdd", async (req, res) => {
  try {
    const {
      device_mac_address,
      dataval_01, // temperature
      dataval_02, // humidity
      dataval_03, // soil
      dataval_04
    } = req.body;

    if (!device_mac_address) {
      return res.status(400).json({ success: false, message: "Missing device_mac_address" });
    }

    const db = mongoClient.db("agriVision");
    const sensorsCollection = db.collection("sensors");
    const notificationsCollection = db.collection("notifications");
    const devicesCollection = db.collection("devices");

    const device = await devicesCollection.findOne({ mac_address: device_mac_address });
    const deviceName = device?.device_name || device_mac_address;

    // Save or Update Sensor Data
    const result = await sensorsCollection.updateOne(
      { device_mac_address },
      {
        $set: {
          dataval_01,
          dataval_02,
          dataval_03,
          dataval_04,
          timestamp: new Date()
        }
      },
      { upsert: true }
    );

    const timestamp = new Date();
    const alerts = [
      {
        condition: dataval_03 === "DRY",
        type: "soil",
        title: "Soil Moisture Alert",
        message: `🚨 Soil is dry in ${deviceName}. Consider irrigation.`,
      },
      {
        condition: dataval_01 > 30,
        type: "temperature",
        title: "Temperature Warning",
        message: `🔥 Temperature exceeded 30°C in ${deviceName}. Ventilation triggered.`,
      },
      {
        condition: dataval_02 >= 60 && dataval_01 >= 20 && dataval_01 <= 28,
        type: "humidity",
        title: "Humidity Alert",
        message: `💧 High humidity detected in ${deviceName}. Dehumidifier ON.`,
      }
    ];

    let hasNewIssue = false;
    let hasAnyIssue = false;

    for (const alert of alerts) {
      if (alert.condition) {
        hasAnyIssue = true;
        const exists = await notificationsCollection.findOne({
          device_mac_address,
          type: alert.type
        });

        if (!exists) {
          hasNewIssue = true;
          await notificationsCollection.insertOne({
            title: alert.title,
            message: alert.message,
            device_name: deviceName,
            device_mac_address,
            type: alert.type,
            timestamp
          });
        }
      }
    }


    if (!hasAnyIssue) {
      const deleted = await notificationsCollection.deleteMany({ device_mac_address });
      console.log(`🧹 Cleared ${deleted.deletedCount} notifications for ${device_mac_address}`);
    }


    let trendChange = 0;
    if (hasNewIssue) {
      trendChange = -1;
    } else if (!hasAnyIssue) {
      trendChange = 1;
    }

    if (trendChange !== 0) {
      await devicesCollection.updateOne(
        { mac_address: device_mac_address },
        [
          {
            $set: {
              trend: {
                $cond: [
                  { $lt: [{ $add: ["$trend", trendChange] }, 0] },
                  0,
                  { $add: ["$trend", trendChange] }
                ]
              }
            }
          }
        ]
      );
    }

    res.status(result.upsertedCount > 0 ? 201 : 200).json({
      success: true,
      message: result.upsertedCount > 0 ? "Sensor data added (new)" : "Sensor data updated"
    });

  } catch (error) {
    console.error("❌ Error saving sensor data:", error);
    res.status(500).json({ success: false, message: "Error saving sensor data" });
  }
});



app.get("/notifications", async (req, res) => {
  try {
    const notifications = await mongoClient
      .db("agriVision")
      .collection("notifications")
      .find({})
      .sort({ timestamp: -1 })
      .toArray();

    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error("❌ Failed to fetch notifications:", error);
    res.status(500).json({ success: false, message: "Error fetching notifications" });
  }
});




app.get("/user-devices-with-sensors", authMiddleware, async (req, res) => {
  try {
    const username = req.user.id;

    const db = mongoClient.db("agriVision");
    const userDevices = await db.collection("user_devices").find({ username }).toArray();

    const macAddresses = userDevices.map(dev => dev.mac_address);
    const sensors = await db.collection("sensors").find({ device_mac_address: { $in: macAddresses } }).toArray();

    // Merge sensor data into devices
    const result = userDevices.map(device => ({
      ...device,
      sensors: sensors.filter(sensor => sensor.device_mac_address === device.mac_address)
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching user devices with sensors:", error);
    res.status(500).json({ success: false, message: "Error fetching data" });
  }
});



app.get("/user-trends", authMiddleware, async (req, res) => {
  try {
    const username = req.user.id;

    const db = mongoClient.db("agriVision");
    const userDevicesCollection = db.collection("user_devices");
    const devicesCollection = db.collection("devices");


    const linkedDevices = await userDevicesCollection.find({ username }).toArray();
    const macs = linkedDevices.map(d => d.mac_address);


    const devices = await devicesCollection
      .find({ mac_address: { $in: macs } })
      .sort({ trend: -1 })
      .toArray();

    res.json({ success: true, data: devices });
  } catch (error) {
    console.error("❌ Error fetching user trends from devices:", error);
    res.status(500).json({ success: false, message: "Error fetching trends" });
  }
});




app.post("/add-new-device", async (req, res) => {
  try {
    const { device_name, mac_address, status, device_location } = req.body;

    // Validate required fields
    if (!device_name || !mac_address || !status || !device_location) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const devicesCollection = mongoClient.db("agriVision").collection("devices");


    
    const result = await devicesCollection.updateOne(
      { mac_address },
      {
        $set: {
          device_name,
          status,
          device_location,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      console.log(`New device inserted: ${device_name} (${mac_address})`);
      res.json({
        success: true,
        message: "Device inserted successfully",
        upserted: true,
        deviceId: result.upsertedId,
      });
    } else {
      console.log(`🔄 Existing device updated: ${device_name} (${mac_address})`);
      res.json({
        success: true,
        message: "Device updated successfully",
        upserted: false,
      });
    }

  } catch (error) {
    console.error("Error saving device:", error);
    res.status(500).json({
      success: false,
      message: "Server error while saving device",
    });
  }
});




app.get("/", (req, res) => res.json({ message: "Server is running fine!" }));




const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
