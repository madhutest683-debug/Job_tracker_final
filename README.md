# ⚡ Job Tracker — Mobile PWA

Track your job applications from Naukri & LinkedIn. Never miss a deadline or follow-up.

---

## 📱 Install on Android (3 steps)

### Step 1 — Deploy (one time, ~10 minutes)

**Windows:**
```
Double-click install.bat
```

**Mac / Linux:**
```bash
chmod +x install.sh
./install.sh
```

**What happens:**
- Installs all dependencies
- Deploys to Vercel (free) — you'll get a URL like `https://job-tracker-abc.vercel.app`

### Step 2 — Open on Android
Open the Vercel URL in **Chrome** on your Android phone.

### Step 3 — Add to Home Screen
Tap **⋮ (3-dot menu)** → **"Add to Home Screen"** → **Add**

✅ Done! The app opens full screen like a native app.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Add Jobs** | Company, role, URL, source, status, referral contact, notes |
| **Deadline Tracker** | Set last date to apply — get alerts when approaching |
| **Follow-up Alerts** | Auto-flags jobs older than 1 day with no action |
| **Dashboard** | Deadline buckets: Expired / Today / ≤3 days / ≤7 days |
| **Pipeline View** | Visual bar chart of jobs by status |
| **Referral Contacts** | Track who can refer you at each company |
| **Bulk Import** | Paste URLs, upload CSV, or restore JSON backup |
| **Export** | Download as CSV (for Excel/Sheets) or full JSON backup |
| **Offline Support** | Works without internet after first load |
| **No login needed** | All data stored on your device |

---

## 📋 Status Flow

```
Saved → Applied → Referral Requested → Interview → Offer
                                               ↓
                                           Rejected
```

---

## 📥 Bulk Import Formats

### Paste URLs (fastest)
```
https://www.naukri.com/job-listings-salesforce-developer-...
https://www.linkedin.com/jobs/view/123456789
https://www.naukri.com/job-listings-lwc-developer-...
```

### CSV Format
```csv
company,role,url,source,status,referral,deadline,notes
Infosys,Salesforce Developer,https://naukri.com/...,Naukri,Saved,,,
Wipro,LWC Developer,https://linkedin.com/...,LinkedIn,Applied,,,
```

Valid `source` values: `Naukri` · `LinkedIn` · `Company Site` · `Other`  
Valid `status` values: `Saved` · `Applied` · `Referral Requested` · `Interview` · `Offer` · `Rejected`  
`deadline` format: `YYYY-MM-DD`

---

## 🔄 Updating the App

After making changes to `src/App.jsx`:
```bash
vercel --prod
```
The app on your phone updates automatically on next open.

---

## 🛠 Manual Setup (if scripts don't work)

```bash
# 1. Install Node from nodejs.org

# 2. Install dependencies
npm install

# 3. Test locally
npm start
# Opens at http://localhost:3000

# 4. Install Vercel CLI
npm install -g vercel

# 5. Deploy
vercel --prod

# 6. Open URL on Android Chrome → Add to Home Screen
```

---

## 📁 Project Structure

```
job-tracker/
├── public/
│   ├── index.html          ← PWA entry point
│   ├── manifest.json       ← Makes it installable on Android
│   ├── service-worker.js   ← Offline support
│   └── icons/              ← App icons (6 sizes)
├── src/
│   ├── index.js            ← React entry + SW registration
│   └── App.jsx             ← Complete app (all features)
├── package.json
├── install.sh              ← Mac/Linux one-click deploy
├── install.bat             ← Windows one-click deploy
└── README.md
```
