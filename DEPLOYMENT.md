# Cloud Deployment Runbook: SIH 2026 Thermal Classifier

This guide explains how to deploy the **Industrial Fire & Persistent Thermal Source Classifier** prototype to free cloud hosting tiers:
- **Backend:** [Render](https://render.com/) or [Railway](https://railway.app/)
- **Frontend:** [Vercel](https://vercel.com/) or [Netlify](https://www.netlify.com/)

Because the SQLite database (`backend/data/thermal_classifier.db`) is checked into the repository, the cloud deployment requires **zero external database servers** and **zero external API keys**.

---

## 1. Push to GitHub

From the project root:
```bash
cd /Users/shahzaman/projects/sih-thermal-classifier

# Verify git status
git status

# Add files and commit
git add .
git commit -m "feat: SIH 2026 Industrial Thermal Classifier Prototype (NTRO SIH26162)"

# Add your remote GitHub repo and push
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/sih-thermal-classifier.git
git branch -M main
git push -u origin main
```

---

## 2. Deploy Backend on Render (Free Tier)

1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository `sih-thermal-classifier`.
4. Configure the service:
   - **Name:** `sih-thermal-classifier-api`
   - **Region:** Any (e.g. Singapore or Oregon)
   - **Root Directory:** `backend`
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`
5. Click **Deploy Web Service**.
6. Once deployed, note down your public backend URL:  
   `https://sih-thermal-classifier-api.onrender.com`

---

## 3. Alternative: Deploy Backend via Docker (Railway / Render)

If deploying via container, a production [`backend/Dockerfile`](./backend/Dockerfile) is pre-configured:
```bash
# Railway automatically detects the Dockerfile in the backend folder:
railway up
```

---

## 4. Deploy Frontend on Vercel (Free Tier)

1. Log in to [Vercel Dashboard](https://vercel.com/).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository `sih-thermal-classifier`.
4. Configure the project settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click Edit and select `frontend`.
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. **Environment Variables:**
   - Add a new environment variable:
     - **Key:** `VITE_API_URL`
     - **Value:** Your Render backend URL (e.g., `https://sih-thermal-classifier-api.onrender.com`)
6. Click **Deploy**.
7. Vercel will build and assign your live production domain:  
   `https://sih-thermal-classifier.vercel.app`

---

## 5. Verification Checklist

1. Open `https://<YOUR_BACKEND_URL>/health` in browser:
   - Should return `{"status": "ok", ...}` with table counts.
2. Open `https://<YOUR_FRONTEND_URL>/` in browser:
   - Verify that the dark-matter Leaflet map renders with markers.
   - Verify clicking any marker opens the 6-feature vector inspector.
   - Test the **"Tune Weights"** and **"Simulate Anomaly"** modals.
