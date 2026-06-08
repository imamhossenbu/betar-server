# 🖥️ Betar Quesheet — Backend Server

Express.js + MongoDB REST API server for the **Betar Barishal Quesheet Management System**. Handles authentication, user management, cue programs, special programs, and song data.

---

## 🚀 Live API Base URL

```
https://your-server-url.com
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js v5 |
| Database | MongoDB Atlas |
| Auth | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs |
| Admin SDK | Firebase Admin |
| Cookie Parsing | cookie-parser |
| Environment | dotenv |
| Dev Tool | nodemon |

---

## 📦 Getting Started

### Prerequisites

- Node.js v18+
- npm
- A MongoDB Atlas cluster
- A Firebase project (for Firebase Admin SDK)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/betar-demo-server.git
cd betar-demo-server

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=your_jwt_secret_here
```

> ⚠️ Never commit `.env` to version control. Add it to `.gitignore`.

### Running the Server

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

Server will run at `http://localhost:3000`

---

## 📁 Project Structure

```
betar-demo-server/
├── index.js          # Main server entry point (all routes & DB logic)
├── .env              # Environment variables (not committed)
├── .gitignore
└── package.json
```

---

## 🗄️ Database

**MongoDB Atlas** — Database name: `betar`

| Collection | Description |
|-----------|-------------|
| `cue_programs` | Regular daily cue sheet programs |
| `special_programs` | Special/event-based programs |
| `users` | Registered users with roles |
| `songs_metadata` | Song reference metadata |

---

## 🔐 Authentication

JWT-based authentication. Include the token in every protected request:

```
Authorization: Bearer <token>
```

### Get JWT Token

```
POST /jwt
Body: { "email": "user@example.com" }
```

Token expires in **5 hours**.

---

## 📡 API Reference

### General

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ❌ | Health check |
| GET | `/ping` | ❌ | Server alive check |

---

### 👤 Users

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/users` | ❌ | — | Register a new user |
| GET | `/users` | ✅ | Admin | Get all users |
| GET | `/users/admin/:email` | ❌ | — | Check if a user is admin |
| PATCH | `/users/:id` | ✅ | Admin | Update user role |
| DELETE | `/users/:id` | ✅ | Admin | Delete a user |

---

### 📋 Cue Programs

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/api/programs?day=&shift=` | ❌ | — | Get programs by day & shift |
| POST | `/api/programs` | ✅ | Any | Add a new program |
| PUT | `/api/programs/:id` | ✅ | Admin | Update a program |
| DELETE | `/api/programs/:id` | ✅ | Any | Delete a program |

**Query Parameters for GET `/api/programs`:**

| Param | Required | Example |
|-------|----------|---------|
| `day` | ✅ | `শনিবার` |
| `shift` | ✅ | `সকাল` |

---

### 🎶 Special Programs

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/api/special?source=` | ❌ | — | Get special programs (optional source filter) |
| POST | `/api/special` | ✅ | Any | Add a special program |
| PUT | `/api/special/:id` | ✅ | Admin | Update a special program |
| DELETE | `/api/special/:id` | ✅ | Any | Delete a special program |

---

### 🎵 Songs

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/songs` | ❌ | — | Get all songs from cue programs |
| DELETE | `/songs/:id` | ✅ | Admin | Delete a song from cue programs |
| GET | `/api/specialSongs` | ❌ | — | Get all special songs |
| GET | `/api/songs/byCdCut/:cdCut` | ❌ | — | Find a song by CD Cut number |
| GET | `/api/specialSongs/byCdCut/:cdCut` | ❌ | — | Find a special song by CD Cut |
| DELETE | `/specialSongs/:id` | ✅ | Admin | Delete a special song |

---

## 🧩 Program Data Schema

### General Program (programType ≠ `Song`)

```json
{
  "serial": "1",
  "broadcastTime": "06:00",
  "programDetails": "সংবাদ",
  "day": "শনিবার",
  "shift": "সকাল",
  "period": "১ম পর্ব",
  "programType": "General",
  "orderIndex": 1
}
```

### Song Program (programType = `Song`)

```json
{
  "programDetails": "আমার সোনার বাংলা",
  "programType": "Song",
  "artist": "রবীন্দ্রনাথ ঠাকুর",
  "lyricist": "রবীন্দ্রনাথ ঠাকুর",
  "composer": "রবীন্দ্রনাথ ঠাকুর",
  "cdCut": "123-A",
  "duration": "03:00",
  "day": "শনিবার",
  "shift": "সকাল",
  "orderIndex": 2
}
```

---

## 🌐 CORS

Allowed origins:

```
http://localhost:5173
https://equesheet.com
```

To allow additional origins, update the `allowedOrigins` array in `index.js`.

---

## 🚢 Deployment

This server can be deployed to **Railway**, **Render**, or **any Node.js-compatible host**.

### Environment Variables to Set in Production

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT signing |

---

## 📄 License

Private project — for internal use by **Betar Barishal**. All rights reserved.

---

## 🙌 Acknowledgements

Built for **Bangladesh Betar, Barishal** to modernize daily broadcast cue sheet operations.
