# Paste these into cloud dashboards after URLs exist

## Render → Environment

```
MONGO_URI=<atlas connection string>
DB_NAME=sushrutha_grid
JWT_SECRET=<generate long random>
CORS_ORIGINS=*
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail>
SMTP_PASSWORD=<gmail app password>
SMTP_FROM_EMAIL=<gmail>
SMTP_FROM_NAME=Sushrutha Grid Hospital Platform
PATIENT_LLM_PROVIDER=off
HOST=0.0.0.0
```

After Vercel URL is known, replace `CORS_ORIGINS` with:
`https://YOUR-APP.vercel.app`

## Vercel → Environment (Production)

```
VITE_API_URL=https://YOUR-SERVICE.onrender.com/api
```

Root Directory = `frontend`
