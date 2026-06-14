# CalTrack

A self-hosted, privacy-first daily nutrition tracker. No backend, no subscriptions, no data leaving your browser — except writing directly to your own Google Sheet.

![CalTrack screenshot](https://via.placeholder.com/680x400/0f0f0f/b5f542?text=CalTrack)

## Features

- **USDA FoodData Central search** — deterministic macro data from SR Legacy + Foundation datasets
- **Personal recipe library** — save custom dishes (chole sabji, dal, etc.) with macros per 100g, stored in localStorage
- **Manual entry** — paste totals from any app (HealthifyMe, MyFitnessPal, etc.)
- **Optional AI parsing** — natural language food entry via Anthropic API (your own key, ~$0.003/day)
- **Google Sheets sync** — writes directly to your spreadsheet via OAuth at end of day
- **Accumulates all day** — add meals across multiple sessions, data persists per date
- **Fully configurable** — column mapping, targets, sheet tab name all adjustable in Settings
- **Zero backend** — pure HTML/CSS/JS, host anywhere

## Quick start

### 1. Fork & host

```bash
git clone https://github.com/yourusername/caltrack.git
cd caltrack
# Drop into any static host: GitHub Pages, Netlify, your own domain
```

Open `index.html` directly in a browser for local use, or host on any static server.

### 2. Google Sheets setup

You need a Google Cloud OAuth Client ID to write to your sheet.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use existing)
3. **APIs & Services → Enable APIs** → search "Google Sheets API" → Enable
4. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add your hosted URL to **Authorized JavaScript origins** (e.g. `https://yourdomain.com`)
7. Copy the **Client ID**

Then in CalTrack → **Settings**:
- Paste your **Spreadsheet ID** (from the Sheet URL: `/spreadsheets/d/[ID]/edit`)
- Paste your **OAuth Client ID**
- Set your **sheet tab name** (default: `Daily Tracker`)
- Set **header row** (the row with column names like "Date", "Calories", etc.)
- Configure **column mapping** to match your sheet's layout

### 3. Your sheet format

CalTrack expects a row per day where column A contains a date string. The default format is `14-Jun` (matching the included template). You can change this in `js/app.js` → `formatDateForSheet()`.

A Google Sheets template matching the default column map is available [here](#) *(add your link)*.

### 4. Optional: AI food parsing

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add it in CalTrack → **Settings → AI food parsing**
3. The **AI parse** tab appears in the Log view
4. Type meals naturally: *"2 scrambled eggs, bowl of oats with 30g whey, black coffee"*

This uses `claude-sonnet-4-6`. Cost is roughly $0.001–0.003 per food log entry.

## Column map defaults

| Field | Default column |
|-------|---------------|
| Date | A |
| Calories | C |
| Protein (g) | D |
| Fats (g) | E |
| Carbs (g) | F |
| Fibre (g) | G |
| Water (L) | H |
| Weight (kg) | I |
| Weights (gym) | L |
| Cardio | M |
| Sleep (hrs) | Q |
| Steps | R |

All configurable in Settings → Column mapping.

## Apple Watch / Health data

Automatic sleep + steps sync from Apple Health is not yet built in (Apple locks HealthKit to on-device only). Two options:

1. **Manual** — glance at the Health app, type hours + steps in the Sync tab (10 seconds)
2. **Health Auto Export** app ([healthyapps.dev](https://healthyapps.dev)) — auto-syncs Apple Health to Google Sheets on a schedule. Set it to write to the same sheet.

An iOS Shortcut for automatic sync is planned for a future release.

## Project structure

```
caltrack/
├── index.html          # App shell, layout, all panels
├── css/
│   └── style.css       # All styles, dark theme, responsive
├── js/
│   ├── storage.js      # localStorage helpers, namespaced
│   ├── usda.js         # USDA FoodData Central API wrapper
│   ├── sheets.js       # Google OAuth + Sheets API v4 write
│   └── app.js          # UI logic, state, event handlers
└── README.md
```

## Self-hosting for others

Anyone can fork this repo and use it with their own:
- Google Sheet (any layout — just remap columns in Settings)
- Google Cloud OAuth credentials
- Anthropic API key (optional)

No environment variables, no build step, no node_modules.

## Privacy

- All data stays in your browser's `localStorage` under the `caltrack_` namespace
- Food logs, recipes, and settings never leave your device
- The only external calls are:
  - USDA FoodData Central API (read-only, no auth)
  - Google Sheets API (writes to your own sheet, OAuth-scoped)
  - Anthropic API (only if you add your key and use AI parse)

## License

MIT — use it, fork it, build on it.

---

Built by [Mihir Agarwal](https://mihiragarwal.com)
