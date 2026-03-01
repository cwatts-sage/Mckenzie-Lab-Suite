# McKenzie's Lab Suite — v2 Plan
## Hub Dashboard + Lab Notebook

### Overview
Restructure the existing Lab Inventory app into a **multi-app Lab Suite** with a central Hub dashboard and a new Lab Notebook module. Single SPA architecture — one login, one URL, seamless navigation between all tools.

**URL:** https://witty-meadow-0d01fc30f.6.azurestaticapps.net (unchanged)

---

## Phase 1: Hub Dashboard Restructure

### What Changes
- **New home page:** Hub dashboard with app cards (replaces current direct-to-Inventory flow)
- **App title:** "Lab Inventory" → "🔬 McKenzie's Lab Suite" (or similar)
- **Navigation restructure:** Top nav becomes app-aware
  - Hub (home) → Inventory section → Notebook section
  - Each section has its own sub-navigation tabs
- **Login stays the same** — one auth, one session

### Hub Dashboard Design
After login, user sees:
```
🔬 McKenzie's Lab Suite                    [McKenzie] [Logout]
─────────────────────────────────────────────────────────────

Welcome back, McKenzie!

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  📦 Inventory    │  │  📓 Notebook     │  │  🔧 Coming Soon  │
│                  │  │                  │  │                  │
│  12 reagents     │  │  3 experiments   │  │  Future apps     │
│  2 low stock     │  │  Last entry: 2h  │  │  go here         │
│  1 expiring      │  │  ago             │  │                  │
│                  │  │                  │  │                  │
│  [Open →]        │  │  [Open →]        │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

Each card shows a live summary (counts from the API). Tapping opens that section.

### Navigation Flow
```
Hub (home)
├── 📦 Inventory
│   ├── 📋 Reagents
│   ├── 📦 Samples  
│   ├── 🔔 Notifications
│   ├── 🗄️ Storage
│   ├── 📚 Catalog
│   └── 📄 Export
├── 📓 Notebook
│   ├── 📝 Entries (chronological)
│   ├── 🧪 Experiments (by project)
│   └── 📎 Media Library
├── ⚙️ Settings
└── 🔐 Admin (admin only)
```

Top bar: `🏠 Hub | 📦 Inventory ▾ | 📓 Notebook ▾ | ⚙️ | 🔐`

Inventory and Notebook dropdowns show their sub-tabs.

---

## Phase 2: Lab Notebook

### Core Concept
A digital laboratory notebook for recording experiments, observations, and results. Each entry is timestamped and linked to reagents/samples from the Inventory.

### Data Model

#### Experiments Table
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique ID |
| user_id | UUID | Owner |
| title | string | Experiment name (e.g., "Western Blot - GAPDH") |
| description | string | Brief purpose/hypothesis |
| status | enum | active, completed, paused, abandoned |
| tags | string | Comma-separated tags for filtering |
| created_at | timestamp | When created |
| updated_at | timestamp | Last modified |

#### Notebook Entries Table
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique ID |
| user_id | UUID | Owner |
| experiment_id | UUID | FK → Experiments (nullable for standalone notes) |
| title | string | Entry title |
| content | text | Rich text / markdown content |
| entry_date | date | Date of the work (user-set, defaults to today) |
| entry_type | enum | protocol, observation, result, note |
| linked_items | JSON string | Array of {type: "reagent"|"sample", id: UUID, name: string} |
| media | JSON string | Array of {id, filename, url, type} |
| created_at | timestamp | Original creation time |
| updated_at | timestamp | Last edit time |

#### Entry History Table (edit tracking)
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique ID |
| entry_id | UUID | FK → Notebook Entries |
| content_snapshot | text | Full content at time of edit |
| edited_at | timestamp | When the edit was made |
| edit_reason | string | Optional note about what changed |

#### Media Table (for attachments)
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique ID |
| user_id | UUID | Owner |
| entry_id | UUID | FK → Notebook Entries |
| filename | string | Original filename |
| blob_url | string | Azure Blob Storage URL |
| content_type | string | MIME type |
| size_bytes | number | File size |
| uploaded_at | timestamp | Upload time |

### Features

#### 2a. Experiment Management
- Create/edit/archive experiments
- Each experiment has a title, description, status, tags
- View all entries for one experiment
- Status tracking: Active → Completed / Paused / Abandoned

#### 2b. Notebook Entries
- Create entries tied to an experiment (or standalone)
- Fields: title, date, type (protocol/observation/result/note), content
- **Rich text editor** with markdown support
- Entries are timestamped at creation; edit history preserved
- **Entry types** help organize:
  - 📋 Protocol — steps followed
  - 👁️ Observation — what was seen/measured
  - 📊 Result — data, conclusions
  - 📝 Note — general notes

#### 2c. @-Mention Linking (Reagents & Samples)
- Type `@` in the content editor → shows searchable dropdown of reagents and samples
- Selecting an item creates a clickable link
- Stored as structured data in `linked_items` JSON
- Rendered as styled chips/tags in the entry
- Clicking a linked item opens it in the Inventory section

#### 2d. Media Attachments
- Upload images (gel photos, microscopy, plots) and files
- Drag-and-drop or file picker
- Stored in Azure Blob Storage (new container in labinventorystore)
- Displayed inline in entries
- Embed external links (YouTube, Google Drive, etc.)

#### 2e. Views
- **Chronological view:** All entries across all experiments, sorted by date
  - Filter by date range (this week, this month, custom)
  - Filter by experiment
  - Filter by entry type
- **Experiment view:** Select an experiment → see all its entries
  - Timeline layout within the experiment
- **Weekly view:** Calendar-style view showing entries per day for a week
- **Search:** Full-text search across entry titles and content

#### 2f. Edit History
- Every save creates a snapshot in the history table
- "View History" button on each entry shows all versions
- Can view any previous version (read-only)
- Optional edit reason when saving changes

### API Endpoints (Azure Functions)

```
# Experiments
GET    /api/experiments              — list all (user's)
POST   /api/experiments              — create
PUT    /api/experiments/{id}         — update
DELETE /api/experiments/{id}         — delete (+ cascade entries)

# Notebook Entries
GET    /api/notebook                 — list entries (supports ?experiment_id=, ?date_from=, ?date_to=, ?type=, ?search=)
POST   /api/notebook                 — create entry
PUT    /api/notebook/{id}            — update entry (creates history snapshot)
DELETE /api/notebook/{id}            — delete entry

# Entry History
GET    /api/notebook/{id}/history    — get edit history for an entry

# Media
POST   /api/media/upload             — upload file to blob storage
DELETE /api/media/{id}               — delete a media file

# Hub Summary
GET    /api/hub/summary              — returns counts for dashboard cards
```

---

## Phase 3: Future Apps (Placeholder)
The Hub dashboard supports adding more app cards later:
- 📊 Data Analysis
- 📅 Experiment Scheduler
- 📖 Protocol Library
- etc.

---

## Implementation Order

### Step 1: Hub Restructure (frontend only)
1. Create Hub component with dashboard cards
2. Restructure App.js routing (nested routes)
3. Add app-aware navigation (top bar with dropdowns)
4. Hub summary API endpoint
5. Deploy & test

### Step 2: Notebook Backend
1. Create Azure Tables: experiments, notebookentries, entryhistory
2. Create Azure Blob container for media
3. Build experiments.js Azure Function (CRUD)
4. Build notebook.js Azure Function (CRUD + history)
5. Build media.js Azure Function (upload/delete)
6. Deploy & test API

### Step 3: Notebook Frontend
1. Experiments list & management page
2. Notebook entries list with chronological/weekly views
3. Entry editor with rich text (markdown)
4. @-mention system for linking reagents/samples
5. Media upload & inline display
6. Entry history viewer
7. Deploy & test

### Step 4: Polish
1. Search across entries
2. Cross-linking (click reagent in notebook → opens in Inventory)
3. Hub summary cards with live data
4. Mobile/iPad responsive refinements

---

## Azure Resources Needed
- **New Tables:** experiments, notebookentries, entryhistory
- **New Blob Container:** notebook-media (in labinventorystore account)
- **New Functions:** experiments.js, notebook.js, media.js, hub.js
- No new Azure resources to create — everything fits in existing RG/Storage/Function App

## Risks & Notes
- Azure Table Storage has no full-text search — search will be client-side filter or basic contains query
- Blob storage for media needs CORS configured for uploads
- Rich text editor: using a lightweight library (e.g., react-markdown + textarea, or a simple WYSIWYG)
- @-mention: custom implementation with dropdown overlay on `@` keypress
- Edit history could grow large — may need cleanup policy eventually

---

## Status
- [ ] Plan reviewed & approved
- [ ] Phase 1: Hub restructure
- [ ] Phase 2: Notebook backend
- [ ] Phase 3: Notebook frontend
- [ ] Phase 4: Polish
