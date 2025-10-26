// scheduler.js
require("dotenv").config();
const { Pool } = require("pg");
const cron = require("node-cron");
const winston = require("winston");

// 🔹 PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 🔹 Logger setup
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

// 🔹 Helper: Random result generator (customize later)
function generateRandomResult() {
  const num = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return num;
}

// 🔹 Main scheduler logic
async function createDailyGameResults() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const today = new Date();
    const resultDate = today.toISOString().split("T")[0];

    // Step 1️⃣ : Fetch all active games
    const { rows: activeGames } = await client.query(
      "SELECT id, name FROM games WHERE status = 'active'"
    );

    if (activeGames.length === 0) {
      logger.info("No active games found, skipping...");
      await client.query("COMMIT");
      return;
    }

    // Step 2️⃣ : Loop through games and insert into game_results if not already inserted
    for (const game of activeGames) {
      const checkQuery = `
        SELECT id FROM game_results
        WHERE game_id = $1 AND result_date = $2
      `;
      const { rows: existing } = await client.query(checkQuery, [
        game.id,
        resultDate,
      ]);

      if (existing.length > 0) {
        logger.info(
          `Result already exists for game_id=${game.id} (${game.name}) on ${resultDate}`
        );
        continue;
      }

      const openResult = generateRandomResult();
      const closeResult = generateRandomResult();

      const insertQuery = `
        INSERT INTO game_results (
          game_id, result_date, open_result, close_result,
          open_status, close_status, open_declared_at, close_declared_at,
          created_at, created_by, updated_at, updated_by, winning_number
        )
        VALUES (
          $1, $2, $3, $4,
          'declared', 'declared', NOW(), NOW(),
          NOW(), $5, NOW(), $6, $7
        )
        RETURNING id;
      `;

      const values = [
        game.id,
        resultDate,
        openResult,
        closeResult,
        process.env.CREATED_BY || "Scheduler",
        process.env.UPDATED_BY || "Scheduler",
        openResult.slice(-2),
      ];

      const res = await client.query(insertQuery, values);
      logger.info(
        `✅ Game result inserted for game_id=${game.id} (${game.name}) → result_id=${res.rows[0].id}`
      );
    }

    await client.query("COMMIT");
    logger.info(`🎯 Daily game results created for date ${resultDate}`);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("❌ Error creating daily game results:", err.message);
  } finally {
    client.release();
  }
}

// 🔹 Schedule job at midnight (12:00 AM)
const cronSchedule = process.env.CRON_SCHEDULE || "0 0 * * *"; // default midnight
const timezone = process.env.TIMEZONE || "Asia/Kolkata";

cron.schedule(
  cronSchedule,
  () => {
    logger.info("⏰ Running scheduled job: createDailyGameResults()");
    createDailyGameResults().catch((err) =>
      logger.error("Scheduler error:", err.message)
    );
  },
  { scheduled: true, timezone }
);

(async () => {
  console.log("⏱ Running scheduler immediately for testing...");
  await createDailyGameResults();  // ye wahi function hai jo 12 AM pe bhi run hota
})();