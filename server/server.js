/**
 * Phone Tracker — Backend Server
 * Stack: Node.js + Express + Socket.io + PostgreSQL (pg)
 *
 * Install:  npm install
 * Env:      cp .env.example .env  (fill in DB_URL)
 * Run:      node server.js
 */
 
require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const { Pool }   = require("pg");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
 
// ─── App setup ───────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });
 
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.static("../client"));
 
// Rate limiter — 100 req / 15 min per IP
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
 
// ─── Database ─────────────────────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });
 
// ─── Real-time broadcast helper ───────────────────────────────────────────────
function broadcast(event, payload) {
  io.emit(event, { ...payload, ts: new Date().toISOString() });
}
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function logEvent(phone_id, event_type, payload = {}, ip = null) {
  await db.query(
    `INSERT INTO phone_events (phone_id, event_type, payload, ip_address)
     VALUES ($1,$2,$3,$4)`,
    [phone_id, event_type, JSON.stringify(payload), ip]
  );
}
 
// ─── REST Routes ──────────────────────────────────────────────────────────────
 
/** GET /api/phones — list all records, optional ?search=&status= */
app.get("/api/phones", async (req, res) => {
  try {
    const { search = "", status = "" } = req.query;
    const values = [];
    let where = "WHERE 1=1";
 
    if (search) {
      values.push(`%${search}%`);
      where += ` AND (phone ILIKE $${values.length} OR label ILIKE $${values.length} OR location ILIKE $${values.length})`;
    }
    if (status) {
      values.push(status);
      where += ` AND status = $${values.length}`;
    }
 
    const { rows } = await db.query(
      `SELECT * FROM phone_records ${where} ORDER BY created_at DESC LIMIT 200`,
      values
    );
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** GET /api/phones/:id — single record + recent events */
app.get("/api/phones/:id", async (req, res) => {
  try {
    const { rows: [record] } = await db.query(
      `SELECT * FROM phone_records WHERE id = $1`, [req.params.id]
    );
    if (!record) return res.status(404).json({ error: "Not found" });
 
    const { rows: events } = await db.query(
      `SELECT * FROM phone_events WHERE phone_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({ data: { ...record, events } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** POST /api/phones — create new record */
app.post("/api/phones", async (req, res) => {
  try {
    const { label, phone, country, carrier, line_type, status, latitude, longitude, location, notes, tags } = req.body;
    if (!phone) return res.status(400).json({ error: "phone is required" });
 
    const { rows: [record] } = await db.query(
      `INSERT INTO phone_records (label,phone,country,carrier,line_type,status,latitude,longitude,location,notes,tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [label, phone, country, carrier, line_type || "mobile", status || "active",
       latitude, longitude, location, notes, tags]
    );
 
    await logEvent(record.id, "created", { phone }, req.ip);
    broadcast("phone:created", { record });
    res.status(201).json({ data: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** PATCH /api/phones/:id — update record */
app.patch("/api/phones/:id", async (req, res) => {
  try {
    const fields = ["label","phone","country","carrier","line_type","status","latitude","longitude","location","notes","tags"];
    const updates = [];
    const values  = [];
 
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        values.push(req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    });
 
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
 
    values.push(req.params.id);
    const { rows: [record] } = await db.query(
      `UPDATE phone_records SET ${updates.join(",")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!record) return res.status(404).json({ error: "Not found" });
 
    await logEvent(record.id, "updated", req.body, req.ip);
    broadcast("phone:updated", { record });
    res.json({ data: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** DELETE /api/phones/:id */
app.delete("/api/phones/:id", async (req, res) => {
  try {
    const { rows: [record] } = await db.query(
      `DELETE FROM phone_records WHERE id = $1 RETURNING *`, [req.params.id]
    );
    if (!record) return res.status(404).json({ error: "Not found" });
 
    broadcast("phone:deleted", { id: req.params.id, phone: record.phone });
    res.json({ data: record, deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** GET /api/phones/:id/events — activity log */
app.get("/api/phones/:id/events", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM phone_events WHERE phone_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** GET /api/stats — dashboard summary */
app.get("/api/stats", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
        COUNT(*)                                      AS total,
        COUNT(*) FILTER (WHERE status = 'active')     AS active,
        COUNT(*) FILTER (WHERE status = 'flagged')    AS flagged,
        COUNT(*) FILTER (WHERE status = 'inactive')   AS inactive,
        COUNT(*) FILTER (WHERE status = 'blocked')    AS blocked,
        COUNT(*) FILTER (WHERE line_type = 'mobile')  AS mobile,
        COUNT(*) FILTER (WHERE line_type = 'landline')AS landline
       FROM phone_records`
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** GET /api/watchlist */
app.get("/api/watchlist", async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM watchlist ORDER BY created_at DESC`);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
/** POST /api/watchlist */
app.post("/api/watchlist", async (req, res) => {
  try {
    const { phone, reason, alert_email } = req.body;
    const { rows: [entry] } = await db.query(
      `INSERT INTO watchlist (phone, reason, alert_email) VALUES ($1,$2,$3)
       ON CONFLICT (phone) DO UPDATE SET reason=$2, alert_email=$3 RETURNING *`,
      [phone, reason, alert_email]
    );
    broadcast("watchlist:added", { entry });
    res.status(201).json({ data: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on("connection", socket => {
  console.log(`[WS] Client connected: ${socket.id}`);
 
  // Allow clients to request a lookup broadcast
  socket.on("lookup:request", async ({ phone }) => {
    const { rows } = await db.query(
      `SELECT * FROM phone_records WHERE phone = $1`, [phone]
    );
    socket.emit("lookup:result", { phone, found: rows.length > 0, record: rows[0] || null });
  });
 
  socket.on("disconnect", () => console.log(`[WS] Client disconnected: ${socket.id}`));
});
 
// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Phone Tracker API running on :${PORT}`));
 
