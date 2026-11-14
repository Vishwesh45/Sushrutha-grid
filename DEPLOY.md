# Deploy Sushrutha Grid

Stack: **GitHub** → **MongoDB Atlas** → **Render (API)** → **Vercel (frontend)**

## 1. GitHub

Repo should already be pushed as `sushrutha-grid` (or your fork). Never commit `backend/.env`.

## 2. MongoDB Atlas

1. [cloud.mongodb.com](https://cloud.mongodb.com) → Create free **M0** cluster.
2. **Database Access** → Add user (password auth). Save password.
3. **Network Access** → Add IP `0.0.0.0/0` (allow Render).
4. **Connect** → Drivers → copy URI, replace `<password>`.
5. Example:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

Use database name `sushrutha_grid` via env `DB_NAME` (not necessarily in the URI path).

## 3. Render (API)

1. [render.com](https://render.com) → **New** → **Blueprint** (uses `render.yaml`)  
   **or** **Web Service** from GitHub:
   - Root directory: `backend`
   - Runtime: **Docker** (`backend/Dockerfile`)
   - Health check path: `/api/health`
2. Environment (Dashboard → Environment):

| Key | Value |
|-----|--------|
| `MONGO_URI` | Atlas connection string |
| `DB_NAME` | `sushrutha_grid` |
| `JWT_SECRET` | long random string |
| `CORS_ORIGINS` | `*` first, then your Vercel URL |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASSWORD` | Gmail App Password (16 chars) |
| `SMTP_FROM_EMAIL` | same as user (or alias) |
| `SMTP_FROM_NAME` | `Sushrutha Grid Hospital Platform` |
| `PATIENT_LLM_PROVIDER` | `off` (optional) |

3. Deploy → note URL: `https://YOUR-SERVICE.onrender.com`
4. Smoke: open `https://YOUR-SERVICE.onrender.com/api/health`

Free tier spins down after idle; first request may take ~30–60s.

## 4. Vercel (frontend)

1. [vercel.com](https://vercel.com) → **Add New Project** → import the same GitHub repo.
2. **Root Directory:** `frontend`
3. Framework: Vite (auto). Build: `npm run build`. Output: `dist`.
4. Environment variable:

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `https://YOUR-SERVICE.onrender.com/api` |

5. Deploy → note URL: `https://YOUR-APP.vercel.app`
6. Back on **Render**, set `CORS_ORIGINS` to that exact origin (no trailing slash), e.g.  
   `https://YOUR-APP.vercel.app`  
   Redeploy API if needed.

`frontend/vercel.json` rewrites all routes to `index.html` for React Router.

## 5. Smoke checklist

- [ ] `/api/health` → healthy + Mongo connected  
- [ ] Patient register / login on Vercel site  
- [ ] Doctor demo login  
- [ ] Lobby / desk WebSocket (browser console: `wss://…/ws/hospital`)  
- [ ] Forgot password email  
- [ ] Create visit → token appears  

## Local vs production

| | Local | Production |
|--|--------|------------|
| API | `http://127.0.0.1:8000` | Render HTTPS |
| UI | Vite `:5173` / `:5174` | Vercel |
| `VITE_API_URL` | `http://127.0.0.1:8000/api` | `https://…onrender.com/api` |
| DB | local Mongo or Atlas | Atlas only |

Whisper / spaCy are **not** in the Render Docker image (`requirements-ml.txt`). Speech may be limited until you upgrade the service.
