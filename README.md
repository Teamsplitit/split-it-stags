# Split It – Splitwise clone

Split expenses with friends: create channels, add expenses, see who owes whom, and settle up.

- **Frontend**: Netlify (static build from `frontend/`)
- **Backend**: Render (Node/Express from `backend/`)
- **Database**: MongoDB
- **Auth**: Email signup/login with JWT

## Security

- All secrets in environment variables (no hardcoded keys).
- Passwords hashed with bcrypt.
- JWT for auth; rate limiting on auth and general API to reduce abuse/DDoS risk.
- Helmet and CORS configured; request body size limited.

## Local setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set MONGODB_URI (your MongoDB DSN) and JWT_SECRET
npm install
npm run dev
```

Backend runs at `http://localhost:3000`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# For local dev with proxy, VITE_API_URL can stay empty or http://localhost:3000
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` to the backend.

### 3. MongoDB

Create a cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas), get the connection string, and set it as `MONGODB_URI` in `backend/.env`. Never commit `.env`.

## Deploy

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for step-by-step Netlify and Render deployment.

**Summary:**
- **Render (backend):** New Web Service → repo, root directory `backend`, Build `npm install`, Start `npm start`. Set `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_ORIGIN`.
- **Netlify (frontend):** Import repo → base directory `frontend`, Build `npm run build`, Publish `dist`. Set `VITE_API_URL` to your Render URL.

## Features

- Sign up / log in with email.
- Create channels and invite friends via invite code.
- Add expenses (no cap); split equally by default.
- Per-channel pie chart: who spent how much.
- Simplified balances: “A owes B ₹X” with minimal transactions (cycles like A→B→C→A cancel out).
- Settle up: record a payment to clear debts.
- Mobile-friendly layout.

## Repo

[https://github.com/Teamsplitit/split-it-stags](https://github.com/Teamsplitit/split-it-stags)
