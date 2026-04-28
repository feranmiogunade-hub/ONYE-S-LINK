# CellTrace — Phone Number Tracker

A real-time micro-website for tracking cell and phone numbers with a PostgreSQL backend, WebSocket live feed, and a clean dark dashboard UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (or swap React) |
| Backend | Node.js + Express |
| Real-time | Socket.io WebSockets |
| Database | PostgreSQL 15 |
| Rate Limiting | express-rate-limit |
| Security | helmet |

## Project Structure

```
phone-tracker/
├── db/
│   └── schema.sql          # PostgreSQL schema + seed data
├── server/
│   ├── server.js           # Express + Socket.io API
│   ├── package.json
│   └── .env.example
└── client/
    └── index.html          # Full SPA dashboard
```

## Setup

### 1. PostgreSQL

```bash
createdb phone_tracker
psql phone_tracker -f db/schema.sql
```

### 2. Server

```bash
cd server
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL
npm run dev      # development with hot reload
npm start        # production
```

### 3. Client

The client is served as static files from the server.
Open: `http://localhost:3001`

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/phones | List all records (?search=&status=) |
| GET | /api/phones/:id | Single record + events |
| POST | /api/phones | Create new record |
| PATCH | /api/phones/:id | Update record |
| DELETE | /api/phones/:id | Delete record |
| GET | /api/phones/:id/events | Activity log |
| GET | /api/stats | Dashboard stats |
| GET | /api/watchlist | Watchlist |
| POST | /api/watchlist | Add to watchlist |

## WebSocket Events

**Server → Client**
- `phone:created` — new record added
- `phone:updated` — record changed
- `phone:deleted` — record removed
- `watchlist:added` — new watchlist entry

**Client → Server**
- `lookup:request` `{ phone }` — lookup a number in real time

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/phone_tracker
PORT=3001
NODE_ENV=development
```

## Add Real Geolocation

Plug in any of these APIs for real carrier + geo lookup:
- **NumVerify** — carrier, line type, country
- **Twilio Lookup** — carrier, caller name
- **Google Maps** — geocoding / map display
- **IPQualityScore** — fraud scoring

Example integration in `server.js`:
```js
const numverify = await fetch(`http://apilayer.net/api/validate?access_key=${KEY}&number=${phone}`);
const info = await numverify.json();
// merge into record before INSERT
```
