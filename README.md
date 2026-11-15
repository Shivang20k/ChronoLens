# ChronoLens — Developer Time Toolkit ⏱

> A fast, 100% browser-based timestamp converter, timezone inspection suite, and screenshot OCR toolkit. Everything runs entirely client-side in the browser — no backend, no database, no analytics, and no image uploads.

---

## 🌟 Key Features

### 1. Time Converter
- **Epoch Timestamps (Seconds & Milliseconds):**
  - Accepts both 10-digit Unix seconds (`1735689600`) and 13-digit JavaScript/Java milliseconds (`1735689600000`).
  - Unit auto-detection displays a friendly conversion note.
  - "Use current time" button to quickly grab the current timestamp.
  - Live ticking epoch clock in the sticky header with 1-click copy.
- **Segmented Keyboard-Friendly Wall-Clock Input:**
  - `YYYY-MM-DDTHH:mm:ss.SSS` segmented inputs with arrow navigation, auto-advance, and calendar validation (including leap years and 24h clock).
  - **Direct Paste Support:** Paste standard ISO timestamps (e.g. `2025-01-01T14:30:00Z`), and all blocks populate and convert automatically.
  - **Source Timezone Resolver:** Accurately interprets wall-clock times in any time zone (handles DST transitions, fall-back ambiguity, and nonexistent spring-forward times).
- **Multi-Zone Output Rows:**
  - Dynamic user local timezone detection automatically placed at the top of the list.
  - Preloaded global developer hubs: UTC, IST (India), US Eastern, US Central, US Mountain, US Pacific, UK / London, Central Europe (Paris/Berlin), Dubai (GST), Singapore, Japan, and Australia (Sydney).
  - Add or remove target timezone rows on the fly.
  - Each target timezone displays:
    - **Format A:** ISO 8601 (`YYYY-MM-DDTHH:mm:ss.SSSZ` or `...±HH:MM`)
    - **Format B:** European style (`DD/MM/YYYYTHH:mm:ss.SSSZ` or `...±HH:MM`)
    - **Human Date & Time:** Readable string (e.g. `Wed, 01 Jan 2025, 05:30:00.000 (Asia/Kolkata)`)
    - 1-click copy buttons for every format.
  - Outputs matching **Epoch seconds** and **Epoch milliseconds** when converting from a date/time string.

### 2. JSON Inspector
- Paste any JSON payload or click "Load sample".
- Recursively traverses nested JSON structures, scanning both timestamp keys (`timestamp`, `epoch`, `startTime`, `endTime`, `createdAt`, etc.) and ISO/epoch values.
- Interprets ISO strings and epoch numbers.
- Converts every detected value into your chosen **Target Timezone**.
- **⚡ Convert Button:** Click directly on any detected result row to load it into the Time Converter for deep multi-zone inspection.
- Copy buttons for instant clipboard extraction.

### 3. Screenshot OCR Inspector
- **Instant Clipboard Paste (<kbd>Ctrl</kbd>+<kbd>V</kbd>):** Snip a database query output or log table, and press Ctrl+V directly on the page — OCR executes automatically! Also supports drag-and-drop and file browsing.
- **Client-Side WebAssembly OCR:** Powered by Tesseract.js running locally in WebAssembly. **Your screenshots never leave your browser.**
- **Candidate Timestamp Detection:**
  - ISO-8601 timestamps (`YYYY-MM-DD HH:mm:ss.SSSSSS+00`, `YYYY-MM-DDTHH:mm:ssZ`, etc.) with arbitrary subsecond precision (milliseconds/microseconds).
  - Slash dates (`DD/MM/YYYY`, `YYYY/MM/DD`).
  - 10-digit epoch seconds and 13-digit epoch milliseconds.
- Converts all detected candidates to the selected target timezone.
- **⚡ Convert Button:** 1-click loads any OCR-extracted timestamp straight into the Time Converter.
- Expandable raw OCR text view for manual verification.

---

## 🚀 Running Locally

ChronoLens requires no complex toolchains or npm dependencies:

```bash
# Option A: Built-in Node.js server (zero dependencies)
npm start
# or: node serve.js
# Then open: http://localhost:5173/

# Option B: Python 3
python3 -m http.server 5173

# Option C: Any static file server (npx serve, VS Code Live Server, etc.)
npx serve -l 5173 .
```

---

## 🌐 Deploying to GitHub Pages (For Team Sharing)

ChronoLens is pre-configured with a GitHub Actions workflow (`.github/workflows/deploy.yml`) for 1-click GitHub Pages deployment.

### Step 1: Create a new repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Name the repository `chronolens` (or any name you prefer).
3. Leave it empty (do NOT initialize with a README or .gitignore).

### Step 2: Push this repository to GitHub
Open your terminal in this project directory and run:

```bash
# Initialize git (if not already initialized)
git init -b main

# Add all files and make the initial commit
git add .
git commit -m "feat: complete browser-based timestamp converter & OCR inspector"

# Connect your GitHub repository
git remote add origin https://github.com/Shivang20k/ChronoLens.git

# Push to GitHub
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. Go to your repository on GitHub: [github.com/Shivang20k/ChronoLens/settings/pages](https://github.com/Shivang20k/ChronoLens/settings/pages).
2. Under **Build and deployment** ➔ **Source**, select:
   - **GitHub Actions** (recommended — the included `.github/workflows/deploy.yml` workflow will deploy automatically).
   - *Or* select **Deploy from a branch** ➔ pick branch `main` with folder `/(root)` and click **Save**.
3. Once deployed, your team sharing link will be live at:
   ```
   https://Shivang20k.github.io/ChronoLens/
   ```

Share this link with your team — anyone can use all conversion and OCR features directly in their browser without installing anything!

---

## 🔒 Privacy & Security

- **100% Client-Side:** No telemetry, analytics, cookies, tracking scripts, or server logging.
- **No Uploads:** Screenshot image bytes and JSON payloads are processed exclusively inside browser memory and immediately released when cleared or refreshed.
- **HTTPS & WASM:** Safe to host on GitHub Pages or internal intranet static servers.

---

## 📁 Repository Structure

```
chronolens/
├── .github/
│   └── workflows/
│       └── deploy.yml            # Automated GitHub Actions deployment to GitHub Pages
├── js/
│   ├── app.js                    # Top-level view switching & tab coordination
│   ├── converter.js              # Time converter, timezone resolvers, live clock & load helpers
│   ├── json-inspector.js         # JSON recursive scanner & timezone converter
│   └── screenshot-inspector.js   # Clipboard paste handler, Tesseract WASM OCR & candidate extractor
├── .gitignore                    # Git ignore file
├── index.html                    # Single-page responsive application UI
├── package.json                  # NPM project metadata & local run scripts
├── README.md                     # Documentation & team deployment guide
├── serve.js                      # Zero-dependency local development server
└── styles.css                    # Responsive developer tool design system
```
