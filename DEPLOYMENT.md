# Deployment: Netlify + Render

Deploy **backend first** on Render so you have the API URL, then deploy the **frontend** on Netlify and point it to that URL.

---

## 1. Render (Backend API)

1. **Sign in**  
   Go to [render.com](https://render.com) and sign in (or create an account).

2. **New Web Service**  
   - Click **New** → **Web Service**.  
   - Connect your GitHub account if needed, then select the repo **Teamsplitit/split-it-stags**.

3. **Configure the service**
   - **Name:** e.g. `split-it-api`
   - **Region:** Choose one close to you.
   - **Root Directory:** `backend`  
     (so Render runs from the `backend` folder).
   - **Runtime:** `Node`.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. **Environment variables**  
   Open **Environment** and add:

   | Key             | Value |
   |-----------------|--------|
   | `MONGODB_URI`   | Your MongoDB Atlas connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net/splitit?retryWrites=true&w=majority`) |
   | `JWT_SECRET`    | A long random string (e.g. from `openssl rand -hex 32`). You can use Render’s “Generate” for a secret. |
   | `FRONTEND_ORIGIN` | Your Netlify app URL. Use a placeholder for now (e.g. `https://split-it.netlify.app`) and update it after you deploy the frontend. |

5. **Create Web Service**  
   Click **Create Web Service**. Render will build and deploy. Wait until the service is **Live**.

6. **Copy the backend URL**  
   From the service dashboard, copy the URL (e.g. `https://split-it-api.onrender.com`). You’ll use this in Netlify.

---

## 2. Netlify (Frontend)

1. **Sign in**  
   Go to [netlify.com](https://netlify.com) and sign in (or create an account).

2. **Add new site**
   - Click **Add new site** → **Import an existing project**.
   - Choose **GitHub** and authorize Netlify if asked.
   - Select the repo **Teamsplitit/split-it-stags**.

3. **Build settings**
   - **Branch to deploy:** `main` (or your default branch).
   - **Base directory:** `frontend`  
     (leave **Build command** and **Publish directory** empty for now; Netlify may auto-detect them).
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`

4. **Environment variables**  
   Open **Site configuration** → **Environment variables** → **Add a variable** (or **Add environment variables**):

   | Key              | Value |
   |------------------|--------|
   | `VITE_API_URL`   | Your Render backend URL from step 1.6 (e.g. `https://split-it-api.onrender.com`). **No trailing slash.** |

5. **Deploy**  
   Click **Deploy site**. Wait until the deploy finishes.

6. **Copy the frontend URL**  
   Netlify will show the site URL (e.g. `https://random-name-123.netlify.app`). You can change it under **Domain management** → **Options** → **Edit site name** (e.g. `split-it` → `https://split-it.netlify.app`).

---

## 3. Connect frontend and backend

1. **Update Render**
   - In Render, open your **Web Service** → **Environment**.
   - Set `FRONTEND_ORIGIN` to your **actual** Netlify URL (e.g. `https://split-it.netlify.app`).
   - Save. Render will redeploy with the new value.

2. **Optional: custom domain on Netlify**  
   In Netlify: **Domain management** → **Add custom domain** and follow the steps if you want your own domain.

---

## 4. Quick checklist

- [ ] MongoDB Atlas cluster created and connection string copied.
- [ ] Render Web Service: root directory `backend`, env vars `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_ORIGIN`.
- [ ] Render service is **Live** and URL copied.
- [ ] Netlify site: base directory `frontend`, build `npm run build`, publish `dist`, env `VITE_API_URL` = Render URL.
- [ ] Netlify deploy succeeded.
- [ ] `FRONTEND_ORIGIN` on Render set to final Netlify URL.

---

## 5. Troubleshooting

- **CORS / “blocked by CORS”**  
  Ensure `FRONTEND_ORIGIN` on Render exactly matches your Netlify URL (including `https://`, no trailing slash).

- **“Failed to fetch” / network errors from frontend**  
  Check `VITE_API_URL` on Netlify: it must be the full Render URL (e.g. `https://split-it-api.onrender.com`) and trigger a new deploy after changing env vars.

- **Render free tier**  
  The service may spin down after inactivity; the first request after that can be slow (cold start).

- **MongoDB**  
  In Atlas, ensure the Render IP (or `0.0.0.0/0` for “allow from anywhere”) is in the Network Access list, and the database user has read/write access.
