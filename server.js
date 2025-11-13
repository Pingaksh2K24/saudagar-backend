
 import express from "express";
import cors from "cors";
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import gameRoutes from "./routes/gameRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import bidRoutes from "./routes/bidRoutes.js";
import optimizedRoutes from "./routes/optimizedRoutes.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";
import { createRateLimit } from "./middleware/rateLimiter.js";
import { securityHeaders, sanitizeInput } from "./middleware/security.js";
import HealthCheck from "./utils/healthCheck.js";

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(createRateLimit(15 * 60 * 1000, 1000)); // 1000 requests per 15 minutes
app.use(sanitizeInput);

// CORS middleware - must be first
app.use((req, res, next) => {
res.header('Access-Control-Allow-Origin', '*');
res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
res.header('Access-Control-Allow-Credentials', 'true');

if (req.method === 'OPTIONS') {
res.sendStatus(200);
} else {
next();
}
});

app.use(cors({
origin: '*',
credentials: true,
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.use(express.json());

// All APIs in auth routes
// Health check endpoint
app.get('/health', async (req, res) => {
const health = await HealthCheck.getFullHealthReport();
res.json(health);
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/optimized", optimizedRoutes);

// Global error handler - must be last
app.use(globalErrorHandler);

const PORT = 3000;
app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});