# CalTrack

A self-hosted, privacy-first daily nutrition tracker. No backend, no subscriptions, no data leaving your browser — except writing directly to your own Google Sheet.

Pure HTML/CSS/JS. No build step. No node_modules. Host anywhere.

---

## Features

- **USDA FoodData Central search** — deterministic macro data from SR Legacy + Foundation datasets, with serving size support (1 cup, 1 large, etc.)
- **Open Food Facts search** — branded and packaged foods not in USDA (Kit Kat, Fairlife, Quest bars, etc.), with product images
- **Database toggle** — switch between USDA and Open Food Facts in one tap
- **Recipe library** — save custom dishes with macros per serving, synced to/from your Google Sheet
- **Manual entry** — name + macros, including fibre
- **AI food parsing** — natural language entry via Anthropic API (your own key, ~$0.002/entry)
- **Google Sheets sync** — writes daily totals to your spreadsheet at end of day
- **Add vs Replace mode** — sync can add to existing sheet values (useful across multiple meal sessions)
- **Food Log sync** — push/pull individual food items to a dedicated sheet tab
- **Check Sheet status** — see what's already been synced for any date
- **Activity toggles** — Weights, Cardio, Medicine (Yes/No per day)
- **PWA** — installable on iPhone and Android, works offline
- **Auto cache-busting** — GitHub Action bumps service worker version on every deploy

---

## Quick start

### 1. Copy the Google Sheet template

Make a copy of the [CalTrack template](#) *https://docs.google.com/spreadsheets/d/1xYoPEx7Svq5YKlLAdDaOV6Fkc-dMBk_xq-xHKQzcp1I/edit?usp=sharing* — it has three pre-configured tabs:

| Tab | Purpose |
|-----|---------|
| `Daily Tracker` | One row per day, totals synced here |
| `Recipes` | Recipe library synced to/from the app |
| `Food Log` | Individual food items per day |

### 2. Set up Google OAuth

The app needs a Google Cloud OAuth Client ID to write to your sheet.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use existing)
3. **APIs & Services → Enable APIs** → enable **Google Sheets API**
4. **Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add your hosted URL under **Authorized JavaScript origins** (e.g. `https://yourdomain.com`)
7. Copy the **Client ID**

### 3. Fork & deploy

```bash
git clone https://github.com/mihir-agarwal0211/caltrack.git
```

Push to your own GitHub repo. Enable **GitHub Pages** in repo Settings → Pages → Source: `gh-pages` branch. The included GitHub Action automatically bumps the service worker cache version and deploys on every push to `main`.

### 4. Configure in the app

Open the app → **Settings**:

| Field | What to enter |
|-------|--------------|
| Spreadsheet ID | From your Sheet URL: `/spreadsheets/d/[ID]/edit` |
| Sheet tab name | `Daily Tracker` (or whatever you named it) |
| Google OAuth Client ID | From step 2 above |
| Header row | Row number where your column headers live (default: 2) |
| Calorie target | Your daily goal |
| Protein target (g) | Your daily goal |

Then set the **Column mapping** to match your sheet layout (see defaults below).

---

## Google Sheet structure

### Daily Tracker tab

- **Row 1**: anything — title, empty, notes
- **Row 2**: column headers (this is what "Header row = 2" means in Settings)
- **Row 3+**: one row per day, with dates in column A

Date format in column A must be `14-Jun` — day then three-letter month abbreviation, no leading zero, hyphen-separated.

Default column layout (fully configurable in Settings → Column mapping):

| Column | Field | Notes |
|--------|-------|-------|
| A | Date | Required — `14-Jun` format |
| C | Calories | kcal |
| D | Protein | grams |
| E | Fats | grams |
| F | Carbs | grams |
| G | Fibre | grams |
| H | Water | litres |
| I | Weight | kg |
| L | Weights (gym) | Yes / blank |
| M | Cardio | Yes / blank |
| Q | Sleep | hours |
| R | Steps | count |

Medicine column is blank by default — map it to any free column in Settings.

### Recipes tab

Columns: `Name | Per (g) | Calories | Protein | Fat | Carbs | Fibre`

Written and read by the **Push to Sheet / Pull from Sheet** buttons in the Recipes tab of the app. Push overwrites the sheet; Pull replaces local recipes.

### Food Log tab

Columns: `Date | Name | Cal | Pro | Fat | Carb | Fibre`

One row per food item. Push replaces all existing entries for that date; Pull loads them back into the app. Useful for restoring a day's log on another device.

---

## Open Food Facts proxy (optional but recommended)

Open Food Facts doesn't include CORS headers for arbitrary domains, so browser-based calls are blocked. The simplest fix is a one-location reverse proxy on your own server.

If you have a VPS (Oracle, DigitalOcean, etc.) with **Caddy** already running:

**1. Add a DNS A record:**
```
api.yourdomain.com → your server IP
```

**2. Add to your Caddyfile:**
```caddyfile
api.yourdomain.com {
    handle /off/* {
        uri strip_prefix /off
        reverse_proxy https://search.openfoodfacts.org {
            header_up Host search.openfoodfacts.org
        }
        header Access-Control-Allow-Origin *
        header Access-Control-Allow-Methods "GET, OPTIONS"
    }
}
```

**3. Update `js/usda.js`:**
```js
const res = await fetch(`https://api.yourdomain.com/off/search?${params}`);
```

Without this proxy, the Open Food Facts toggle still appears but searches will fail silently. USDA search works fine without it.

---

## Optional features

### AI food parsing

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add it in **Settings → AI food parsing**
3. The **AI parse** tab appears — describe a meal in plain language:
   > *"2 scrambled eggs, bowl of oats with 30g whey, black coffee"*

Uses `claude-sonnet-4-6`. Cost is roughly $0.001–0.003 per entry.

### USDA API key

The app ships with a built-in key that works for normal personal use. For higher usage:

1. Get a free key at [fdc.nal.usda.gov/api-guide.html](https://fdc.nal.usda.gov/api-guide.html)
2. Add it in **Settings → USDA API**

---

## Sync tab walkthrough

| Control | What it does |
|---------|-------------|
| Weight / Sleep / Steps / Water | Manual inputs synced alongside macros |
| Weights / Cardio / Medicine toggles | Writes "Yes" to mapped columns when active |
| **Add to existing** toggle | Adds macros to whatever's already in the sheet (instead of replacing) |
| **Check Sheet** | Shows what's currently in the sheet for the selected date |
| **Sync to Google Sheet** | Pushes daily totals to the Daily Tracker tab |
| **Push Food Log** | Writes individual food items to the Food Log tab |
| **Pull Food Log** | Loads food items from the Food Log tab into the app |

---

## Project structure

```
caltrack/
├── index.html              # App shell and all tab panels
├── css/
│   └── style.css           # Dark theme, responsive layout
├── js/
│   ├── storage.js          # localStorage helpers (caltrack_ namespace)
│   ├── usda.js             # USDA + Open Food Facts API wrappers
│   ├── sheets.js           # Google OAuth 2.0 + Sheets API v4
│   └── app.js              # UI logic, state, event handlers
├── service-worker.js       # PWA offline cache
├── manifest.json           # PWA manifest
└── .github/
    └── workflows/
        └── deploy.yml      # Auto cache-bump + GitHub Pages deploy
```

---

## Privacy

All your data stays in your browser's `localStorage` under the `caltrack_` namespace. The only external calls are:

| Service | Why | Auth |
|---------|-----|------|
| USDA FoodData Central | Food search | Optional API key |
| Open Food Facts (via your proxy) | Branded food search | None |
| Google Sheets API | Write to your sheet | OAuth 2.0 (your own credentials) |
| Anthropic API | AI meal parsing | Your own API key |
| world.openfoodfacts.org | Barcode product lookup (USDA serving sizes) | None |

Nothing goes to any CalTrack server — there isn't one.

---

## Self-hosting checklist

- [ ] Copy the Google Sheet template
- [ ] Create Google Cloud project + enable Sheets API
- [ ] Create OAuth 2.0 Client ID, add your domain to Authorized JavaScript origins
- [ ] Fork the repo, enable GitHub Pages (gh-pages branch)
- [ ] Open the app → Settings → fill in Spreadsheet ID + OAuth Client ID
- [ ] Configure column mapping to match your sheet
- [ ] *(Optional)* Set up Caddy proxy for Open Food Facts
- [ ] *(Optional)* Add Anthropic API key for AI parsing
- [ ] *(Optional)* Add USDA API key for higher rate limits

---

## License

MIT — fork it, build on it, make it yours.

---

Built by [Mihir Agarwal](https://mihiragarwal.com)
