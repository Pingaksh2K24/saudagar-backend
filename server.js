import express from "express";
import cors from "cors";
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import gameRoutes from "./routes/gameRoutes.js";

const app = express();
app.use(cors());
app.use(express.json());

// All APIs in auth routes
app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
