import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Product from "./models/Product.js";
import Order from "./models/Order.js";
import Customer from "./models/Customer.js";
import Supplier from "./models/Supplier.js";
import authRoutes from './routes/authRoutes.js';

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// __dirname setup for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚡ Static file serving (images, pdf, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/udyog_retailersDB";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ Mongo Error:", err));

// Health route
app.get("/", (_req, res) => res.json("Udyog Sutra Backend Running on Prasad Test 🚀"));

// Database connection test
app.get('/api/db-test', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    res.json({
      connected: dbStatus === 1,
      database: mongoose.connection.name,
      collections: collections.map(c => c.name),
      status: dbStatus === 1 ? 'Connected' : 'Disconnected'
    });
  } catch (error) {
    res.status(500).json({ error: error.message, connected: false });
  }
});

// Auth routes
app.use('/api/auth', authRoutes);

// Products route
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders route
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Customers route
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Suppliers route
app.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await mongoose.connection.db.collection('suppliers').find({}).sort({ createdAt: -1 }).toArray();
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get supplier by ID
app.get('/api/suppliers/:id', async (req, res) => {
  try {
    let query;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      query = { _id: new mongoose.Types.ObjectId(req.params.id) };
    } else {
      query = { supplierId: req.params.id };
    }
    
    const supplier = await mongoose.connection.db.collection('suppliers').findOne(query);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update supplier
app.put('/api/suppliers/:id', async (req, res) => {
  try {
    let query;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      query = { _id: new mongoose.Types.ObjectId(req.params.id) };
    } else {
      query = { supplierId: req.params.id };
    }
    
    const updatedSupplier = await mongoose.connection.db.collection('suppliers').findOneAndUpdate(
      query,
      { $set: { ...req.body, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    
    if (!updatedSupplier.value) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    
    res.json(updatedSupplier.value);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Settings route (exclude _id)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await mongoose.connection.db.collection('settings').find({}, { projection: { _id: 0 } }).toArray();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings by userId
app.put('/api/settings/:userId', async (req, res) => {
  try {
    const updatedSetting = await mongoose.connection.db.collection('settings').findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { ...req.body, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    
    if (!updatedSetting.value) {
      return res.status(404).json({ message: 'Settings not found for this user' });
    }
    
    res.json(updatedSetting.value);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check suppliers data structure
app.get('/api/suppliers-raw', async (req, res) => {
  try {
    const suppliers = await mongoose.connection.db.collection('suppliers').find({}).limit(2).toArray();
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check existing users (temporary)
app.get('/api/check-users', async (req, res) => {
  try {
    const users = await mongoose.connection.db.collection('ser').find({}).limit(2).toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test specific user
app.get('/api/test-user/:email', async (req, res) => {
  try {
    const user = await mongoose.connection.db.collection('ser').findOne({ email: req.params.email });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
app.post("/api/products", async (req, res) => {
  try {
    const product = new Product(req.body);
    const saved = await product.save();
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List products
app.get("/api/products", async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚡ Server running on port ${PORT}`));
