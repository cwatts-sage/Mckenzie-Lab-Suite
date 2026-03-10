# McKenzie's Lab Suite — v3 Plan
## Enhanced Experiments, Linking & UX

### Overview
Major upgrade focused on experiment detail pages, better cross-referencing between experiments/samples/entries, improved delete safety, and UX polish.

---

## Phase 1: Experiment Detail Page & Append View

### 1a. Experiment Detail Page (new route: `/notebook/experiments/:id`)
**Current:** Experiments are just cards with title + short description. Clicking navigates to filtered notebook entries.

**New:** Dedicated experiment page with structured fields and appended entries.

**New fields on experiments table:**
| Field | Type | Description |
|-------|------|-------------|
| purpose | text | Full purpose/rationale for the experiment |
| hypothesis | text | Working hypothesis |
| strains | JSON string | Array of {type: "reagent"\|"sample", id, name} — linked strains |
| controls | JSON string | Array of {type: "reagent"\|"sample", id, name} — linked controls |

**Experiment detail page layout:**
```
🧪 Fat Body Experiment                    [Edit] [Back to Experiments]
─────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────┐  ┌───────────────────┐
│ 📋 Purpose                              │  │ 📅 Mini Calendar  │
│ Study fat body morphology under...      │  │  [March 2026]     │
│                                         │  │  ● ● ○ ○ ● ...   │
│ 🔬 Hypothesis                           │  │                   │
│ TBI increases fat body size...          │  │  ● = entry exists │
│                                         │  └───────────────────┘
│ 🧬 Strain(s): @[C57BL/6J] @[WT ctrl]  │  
│ 🎯 Control(s): @[Sham] @[PBS]          │  ┌───────────────────┐
│                                         │  │ 📝 Scratch Pad    │
│ Status: 🟢 Active                       │  │ (session-only)    │
│ Tags: TBI, fat body, drosophila         │  │ - check gel       │
│ Created: Mar 1, 2026                    │  │ - order antibody  │
└─────────────────────────────────────────┘  └───────────────────┘

📓 Entries (Append View)                             [+ New Entry]
──────────────────────────────────────────────────────────────────
▼ March 9, 2026 — Sunday
  📋 Protocol: Western blot prep
  Content here... @[Anti-GAPDH] mentioned...

▼ March 7, 2026 — Friday  
  👁️ Observation: Unexpected banding pattern
  Content here...

▶ March 5, 2026 — Wednesday (collapsed)
▶ March 3, 2026 — Monday (collapsed)
```

### 1b. Append View
- All entries for the experiment on one scrollable page
- Grouped by date with collapsible headers (▼ expanded / ▶ collapsed)
- Most recent entries at top by default
- Each entry shows: type icon, title, full content, linked items
- Entries are editable inline (click Edit to open edit modal)

### 1c. Mini Monthly Calendar
- Small calendar widget in the sidebar of experiment detail page
- Shows current month with dots on days that have entries
- Color-coded dots by entry type (blue = protocol, purple = observation, green = result, gray = note)
- Clicking a dot-day scrolls to that date's entries in the append view
- Navigate between months with arrows

### 1d. Scratch Pad (Synced To-Do)
- Small floating/sidebar panel on experiment detail page
- Simple text area or checklist for quick notes/reminders
- Saved to the database as a `scratch_pad` field on the experiment (syncs across devices)
- Auto-saves on blur or after a short debounce (no manual save button needed)
- Clear button to wipe the scratch pad

### API Changes (Phase 1)
```
PUT /api/experiments/{id}  — now accepts: purpose, hypothesis, strains (JSON), controls (JSON)
GET /api/experiments/{id}  — new endpoint: get single experiment with all fields
```

### Frontend Changes (Phase 1)
- New component: `ExperimentDetail.js`
- New component: `MiniCalendar.js`
- New component: `ScratchPad.js`
- New route: `/notebook/experiments/:id`
- Updated: `Experiments.js` — card click navigates to detail page instead of filtering notebook
- Updated: experiment create/edit modal — add purpose, hypothesis, strains, controls fields
- Strains & Controls use same @-mention picker as notebook (search reagents + samples)

---

## Phase 2: Better Linking & Cross-References

### 2a. Create-on-the-fly from @-mention
**Current:** @-mention in notebook only searches existing reagents/samples.

**New:** If no match found, show "Create new reagent" / "Create new sample" option at bottom of dropdown.
- Clicking opens a quick-create modal (name + minimal fields)
- After creation, automatically inserts the @-mention
- Works in both notebook entries AND experiment strains/controls fields

### 2b. Sample → Experiment Linking (dropdown)
**Current:** Sample form has a free-text "Experiment" field.

**New:** Replace with dropdown of existing experiments + option to type custom text.
- Combo-box style: dropdown with search, but also allows free text for experiments not in the system
- Store both `experiment` (text, for backward compat) and `experiment_id` (UUID link)
- If linked via dropdown, clicking experiment name on sample detail opens experiment detail page

### 2c. Sample Cross-Reference View
**Current:** Sample table row shows basic info.

**New:** When viewing/editing a sample, show:
- **Experiment:** Linked experiment (clickable → experiment detail page)
- **Mentioned in entries:** List of notebook entries that @-mention this sample (with clickable links)
- Requires new API: `GET /api/samples/{id}/references` — returns entries that link to this sample

### 2d. ⌘K Hyperlink in Notebook Entries
- In the notebook entry content editor, pressing ⌘K (or Ctrl+K) opens a small popover
- Fields: Link text, URL
- Inserts markdown-style link: `[text](url)` 
- Rendered as clickable link in entry view
- Update `renderContent()` to parse and render markdown links

### API Changes (Phase 2)
```
GET /api/samples/{id}/references  — returns {experiment: {...}, entries: [...]} 
PUT /api/samples/{id}             — now accepts experiment_id field
POST /api/samples                 — now accepts experiment_id field
```

### Frontend Changes (Phase 2)
- Updated: @-mention dropdown — add "Create new..." option at bottom
- New: Quick-create modal for reagent/sample (minimal fields)
- Updated: `Samples.js` — experiment field becomes combo dropdown
- New: Sample detail/references panel (expand row or modal)
- Updated: `Notebook.js` — ⌘K handler in textarea
- Updated: `renderContent()` — parse `[text](url)` as clickable links

---

## Phase 3: UX & Safety

### 3a. Delete Confirmation — Type "DELETE"
**Current:** Simple `window.confirm()` dialog.

**New:** Custom modal that requires typing "DELETE" to confirm.
- Applies to: experiments, notebook entries, reagents, samples
- Modal shows: "Are you sure you want to delete [item name]? Type DELETE to confirm."
- Input field that must match "DELETE" (case-sensitive)
- Delete button stays disabled until text matches
- Red/warning styling to make it feel serious

### 3b. Nav Layout — Settings/Admin to Right
**Current:** All nav items in a row: Hub | Inventory | Notebook | ⚙️ | 🔐

**New:** Split nav into left and right groups:
```
🏠 Hub | 📦 Inventory | 📓 Notebook          ⚙️ | 🔐
```
- Use `justify-content: space-between` or flexbox with margin-left: auto on settings

### Frontend Changes (Phase 3)
- New component: `DeleteConfirmModal.js` (reusable)
- Updated: All delete handlers across Experiments, Notebook, Inventory, Samples
- Updated: `App.js` nav layout — CSS change for right-aligned settings/admin
- Updated: `App.css` — nav styling

---

## Implementation Order

### Step 1: Backend updates
1. Add new fields to experiments API (purpose, hypothesis, strains, controls)
2. Add GET single experiment endpoint
3. Add experiment_id to samples API
4. Add GET /api/samples/{id}/references endpoint
5. Deploy API

### Step 2: Experiment Detail Page
1. ExperimentDetail component with structured fields
2. Append view with collapsible date headers
3. Mini monthly calendar
4. Scratch pad (localStorage)
5. Update experiment create/edit modal with new fields
6. Update routing

### Step 3: Linking Improvements
1. Create-on-the-fly in @-mention
2. Sample experiment dropdown
3. Sample cross-reference view
4. ⌘K hyperlink support

### Step 4: UX & Safety
1. DeleteConfirmModal component
2. Replace all confirm() calls
3. Nav layout fix
4. Deploy & test

---

## Status
- [ ] Plan reviewed & approved by McKenzie
- [ ] Step 1: Backend updates
- [ ] Step 2: Experiment Detail Page
- [ ] Step 3: Linking Improvements  
- [ ] Step 4: UX & Safety
