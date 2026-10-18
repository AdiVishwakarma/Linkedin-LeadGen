# LinkedIn Lead Discovery Platform - Frontend

A modern, professional SaaS web dashboard built with **React**, **Vite**, and **TypeScript** for assisted LinkedIn lead discovery, post classification, intent scoring, and client pipeline management.

---

## 🚀 Key Features

### 1. Executive Dashboard (`/`)
- **Metric Cards**: Total unique leads, high-intent leads, shortlisted prospects, pending LinkedIn search tasks, open system errors, and total import batches.
- **Human Review Precision**: Real-time evaluation of NLP classifier performance (% of reviewed leads accepted by human reviewers, overall and by intent label).
- **Interactive Visualizations**:
  - Daily leads volume chart over the past 14 days.
  - Leads breakdown by Review Status (`new`, `reviewed`, `shortlisted`, `rejected`).
  - Leads breakdown by Service Category (`influencer_marketing`, `ad_agency`, `production_house`, `brand_film`, `other`).
  - Distribution by Intent Level (`high`, `medium`, `low`, `not_a_lead`).
- **Recent Import Batches**: Real-time audit log of recent ingestion runs with statuses and creation/deduplication metrics.

### 2. Campaign Management
- **Campaign CRUD**: Create, view, edit, and delete campaigns (`POST`, `GET`, `PUT`, `DELETE /api/campaigns`).
- **Targeting Attributes**: Service categories, relevance keywords, excluded noise keywords, and target geographic locations.
- **Search Task Generation**: Generates targeted LinkedIn content queries with date range filters (`past-24h`, `past-week`, `past-month`) and configurable query volume (`POST /api/campaigns/{id}/generate-searches`).
- **Assisted Search Checklist**: Direct "Open Search" links to LinkedIn with exact operators, checklist toggles (`pending`, `done`, `skipped`), and one-click "Capture Post" actions.

### 3. Lead Discovery & Assisted Ingestion
- **100% Policy-Safe & Zero Scraping**: Compliant with LinkedIn terms; assisted workflow enables manual discovery while automating classification.
- **Manual Single Post Form**:
  - Required: Post URL and Post Content (min. 20 characters).
  - Optional: Author Name, Author Headline, Profile URL, Company, Location, Posted Date (supports relative strings like `2d`, `1w` or ISO dates).
  - Campaign & Search Task association.
  - Submits to `POST /api/imports`.
- **Bulk Text Mode**: Paste multiple posts separated by `---` blocks (`POST /api/imports/bulk-text`).
- **CSV Upload Mode**: Upload CSV files with posts (`POST /api/imports/csv`).
- **Real-Time Run Result**: Instant display of created leads, identical post duplicates, near-duplicates, and failed items.

### 4. Leads Pipeline & Review Workflow
- **Data Table**: Paginated, sortable table fetching real leads from `GET /api/leads`.
- **Advanced Filtering**:
  - Full-text search across content, author, company, and headline.
  - Filter by review status, campaign, service category, and intent label.
  - Minimum intent score & minimum relevance score sliders/inputs.
  - "India Only", "Include Duplicates", and "Include Non-Leads" toggles.
- **Sorting**: Multi-column sorting (`captured_at`, `posted_at`, `relevance`, `intent`, `author`, `category`, `status`) in ascending or descending order.
- **Multi-Select Bulk Actions**: Bulk mark as `reviewed`, `shortlisted`, or `rejected` (`POST /api/leads/bulk-status`).
- **Lead Detail Drawer**:
  - Full post content with quick copy action.
  - Matched signals tags (e.g. `looking for agency`, `budget mentioned`, `urgent hiring`).
  - Author and company details with external link to author profile and original post.
  - Editable human review notes (`PATCH /api/leads/{id}`).
  - Editable service category (`PATCH /api/leads/{id}`).
  - Lead deletion (`DELETE /api/leads/{id}`).

### 5. CSV Export
- Uses the existing backend streaming endpoint `GET /api/leads/export.csv`.
- Automatically inherits the active table filters (search term, category, intent, status, India only, etc.).
- Includes formula injection protection and Excel UTF-8 BOM headers.

### 6. Import History & Diagnostic Logs
- **Import Runs**: Inspect batch statuses (`completed`, `partial`, `failed`, `running`, `queued`, `interrupted`), item counts, and durations (`GET /api/runs`).
- **Run Audit Drawer**: View specific run errors and item breakdowns (`GET /api/runs/{run_id}`).
- **Batch Retry**: Re-process failed items from saved payloads in the error log (`POST /api/runs/{run_id}/retry`).
- **System Error Logs**: Comprehensive view of pipeline errors across stages (`parse`, `validate`, `classify`, `save`, `run`) with raw payload inspection modal (`GET /api/errors`).

---

## 🛠️ Tech Stack & Architecture

- **Framework**: React 18+ with TypeScript
- **Bundler & Dev Server**: Vite 6+
- **Styling**: Modern SaaS Vanilla CSS Design System with custom properties, glassmorphism, accessible dark navy palette, and micro-animations.
- **Icons**: Lucide React
- **HTTP Client**: Clean fetch wrapper with error handling, status checking, and query serialization.

---

## ⚙️ Configuration & Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Base URL of the FastAPI backend. |

In development mode, `vite.config.ts` also provides a local proxy forwarding `/api` to `http://127.0.0.1:8000`.

---

## 🏃 Quick Start: Running Backend and Frontend Together

### Step 1: Start the Backend (Terminal 1)

```bash
cd backend

# On Windows (PowerShell):
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# On Linux/macOS:
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- Backend API: `http://127.0.0.1:8000`
- FastAPI Interactive Docs: `http://127.0.0.1:8000/docs`

### Step 2: Start the Frontend (Terminal 2)

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start Vite dev server
npm run dev
```

- Frontend Application: `http://127.0.0.1:5173`

### Step 3: Production Build & Type Check

To verify production bundling and TypeScript validity:

```bash
npm run build
```

---

## 🔍 Backend API Integration Audit

Every feature in the frontend uses real backend endpoints:

| Feature | Backend Endpoint | Status |
| :--- | :--- | :--- |
| Health Check | `GET /api/health` | Fully Integrated |
| Dashboard Metrics | `GET /api/dashboard` | Fully Integrated |
| List Campaigns | `GET /api/campaigns` | Fully Integrated |
| Create Campaign | `POST /api/campaigns` | Fully Integrated |
| Edit Campaign | `PUT /api/campaigns/{id}` | Fully Integrated |
| Delete Campaign | `DELETE /api/campaigns/{id}` | Fully Integrated |
| Generate Searches | `POST /api/campaigns/{id}/generate-searches` | Fully Integrated |
| List Search Tasks | `GET /api/campaigns/{id}/search-tasks` | Fully Integrated |
| Update Search Task | `PATCH /api/search-tasks/{task_id}` | Fully Integrated |
| Single Post Import | `POST /api/imports` | Fully Integrated |
| Bulk Text Import | `POST /api/imports/bulk-text` | Fully Integrated |
| CSV File Import | `POST /api/imports/csv` | Fully Integrated |
| List Leads | `GET /api/leads` | Fully Integrated |
| Get Lead Detail | `GET /api/leads/{id}` | Fully Integrated |
| Update Lead (Notes/Status/Category) | `PATCH /api/leads/{id}` | Fully Integrated |
| Delete Lead | `DELETE /api/leads/{id}` | Fully Integrated |
| Bulk Status Update | `POST /api/leads/bulk-status` | Fully Integrated |
| Export Filtered CSV | `GET /api/leads/export.csv` | Fully Integrated |
| List Import Runs | `GET /api/runs` | Fully Integrated |
| Get Run Details | `GET /api/runs/{id}` | Fully Integrated |
| Retry Run | `POST /api/runs/{id}/retry` | Fully Integrated |
| List Error Logs | `GET /api/errors` | Fully Integrated |

*No mock data is used anywhere in the frontend.*
