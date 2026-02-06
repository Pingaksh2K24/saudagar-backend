// scheduler.js
import dotenv from 'dotenv';
import pkg from 'pg';
import cron from 'node-cron';
import winston from 'winston';

dotenv.config();
const { Pool } = pkg;

// Database connection with explicit config
const pool = new Pool({
  user: 'postgres',
  host: 'localhost', 
  database: 'saudagar',
  password: 'Pingaksha@2024',
  port: 5432,
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

// 🔹 Main scheduler logic - Create entries from tomorrow for next 3 months
async function createDailyGameResults() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Start from tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get end date - 3 months from tomorrow
    const threeMonthsEnd = new Date(tomorrow);
    threeMonthsEnd.setMonth(threeMonthsEnd.getMonth() + 3);
    threeMonthsEnd.setDate(threeMonthsEnd.getDate() - 1); // Last day of 3rd month
    
    logger.info(`Creating entries from ${tomorrow.toISOString().split('T')[0]} to ${threeMonthsEnd.toISOString().split('T')[0]}`);

    // Step 1️⃣ : Fetch all active games (not deleted)
    const { rows: activeGames } = await client.query(
      "SELECT id, game_name FROM games WHERE status = 'active' AND deleted_by IS NULL"
    );

    if (activeGames.length === 0) {
      logger.info("No active games found, skipping...");
      await client.query("COMMIT");
      return;
    }

    let totalEntriesCreated = 0;

    // Step 2️⃣ : Loop through each date from tomorrow for next 3 months
    const currentDate = new Date(tomorrow);
    while (currentDate <= threeMonthsEnd) {
      const resultDate = currentDate.toISOString().split("T")[0];
      
      // Loop through games for this date
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
            `Result already exists for game_id=${game.id} (${game.game_name}) on ${resultDate}`
          );
          continue;
        }

        const insertQuery = `
          INSERT INTO game_results (
            game_id, result_date, created_at, created_by, updated_at
          )
          VALUES (
            $1, $2, NOW(), $3, NULL
          )
          RETURNING id;
        `;

        const values = [
          game.id,
          resultDate,
          "Scheduler"
        ];

        const res = await client.query(insertQuery, values);
        totalEntriesCreated++;
        logger.info(
          `✅ Game result inserted for game_id=${game.id} (${game.game_name}) on ${resultDate} → result_id=${res.rows[0].id}`
        );
      }
      
      // Move to next date
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await client.query("COMMIT");
    logger.info(`🎯 Total ${totalEntriesCreated} game result entries created from tomorrow for next 3 months`);
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

// Run once immediately for testing
(async () => {
  logger.info("🚀 Game Scheduler Service started...");
  logger.info("🧪 Running test execution immediately...");
  await createDailyGameResults();
  logger.info("✅ Test execution completed. Check your database!");
})();