# Careflow Patient

Patient QR check-in app.

```bash
npm install
npm run dev
```

Open via `/q/:queueCode` from a clinic or doctor QR.

## DigitalOcean App Platform

Use a **Web Service** (Dockerfile detected automatically) or Node buildpack:

| Setting | Value |
|---------|--------|
| Build command | `npm install --include=dev && npm run build` |
| Run command | `npm start` |
| HTTP port | `8080` (or `$PORT`) |
| Env | `VITE_API_BASE=https://your-api.ondigitalocean.app` |

`VITE_API_BASE` must be set at **build** time (Vite inlines it into the bundle).
