# McKenzie's Lab Suite — v3 Plan
## Fixes, Enhancements & Projects Restructure

**Date:** 2026-03-10
**Requested by:** McKenzie
**Status:** In Progress

---

## Phase 1: Bug Fixes & Quick UI Tweaks

### 1. Fix @-mention search showing incomplete results
- Remove the `.slice(0, 5)` cap on results in getMentionResults()
- Prioritize samples/reagents linked to the current experiment FIRST
- Show a separator, then unlinked items below
- Allow scrolling through all results
- **Files:** Notebook.js, ExperimentDetail.js

### 2. Fix period in search crashing/clearing results
- Escape special regex characters in sample search input
- "3.6" should match samples named with dates/periods
- **Files:** Samples.js (frontend search), possibly samples.js API

### 3. Make tagged items clickable in notebook entries
- When viewing an entry, clicking @[SomeSample] navigates to that item in Inventory
- Use linked_items data (has type + id) to determine route
- Reagent → /inventory, Sample → /inventory/samples
- **Files:** Notebook.js, ExperimentDetail.js (renderContent function)

### 4. Move Samples to left of Reagents in Inventory sub-nav
- New order: 🧫 Samples | 📋 Reagents | 🔔 Alerts | 🗄️ Storage | 📚 Catalog | 📄 Export
- **Files:** App.js (SubNav component)

### 5. Remove Calendar & Notes dropdown from Notebook entry list
- Remove the collapsible "📅 Calendar & Notes" panel from Notebook.js ONLY
- KEEP the calendar sidebar on ExperimentDetail.js
- **Files:** Notebook.js

### 6. Remove "Observation" entry type
- Remove from ENTRY_TYPES arrays
- Remaining types: Protocol, Result, Note
- **Files:** Notebook.js, ExperimentDetail.js

### 7. Keep Notes tab (no change)
- Notes tab stays in sub-nav as-is

---

## Phase 2: Feature Enhancements

### 8. Add Experiment filter dropdown to Samples list
- New `<select>` in Samples search bar alongside Status and Storage filters
- Filter samples by linked experiment_id
- **Files:** Samples.js

### 9. Smart status prompt when linking samples to entries
- On save, detect newly linked samples (compare original vs current linked_items)
- Show modal: "Update status to 'In Use' for these samples?"
  - Yes (all) → batch update all newly linked samples
  - No → skip
  - Custom → checkboxes to pick which ones
- Needs API call to batch-update sample statuses
- **Files:** Notebook.js, ExperimentDetail.js, sampleAPI (new batch endpoint?)

---

## Phase 3: Projects → Experiments → Replicates Restructure

### 10. Restructure hierarchy

**Current:** Experiment → Notebook Entries
**New:** Project → Experiments → Replicates, with Notebook Entries at Experiment level

#### Data Model Changes
- Rename `experiments` table → `projects` (or add new `projects` table)
- New experiments within projects: title, method/type, project_id (FK), replicate_group, replicate_number
- Notebook entries link to experiment level (not replicate)

#### New Structure
```
📁 Project: Protein Levels in Brain
  🧪 Experiment: Western Blot - GAPDH
    Rep 1, Rep 2, Rep 3 (grouped/collapsed view)
  🧪 Experiment: RNAi Knockdown
    Rep 1, Rep 2
  📓 All project entries (aggregated view)
  📓 Per-experiment entries
```

#### UI
- Projects list page (replaces current Experiments list)
- Project detail page with experiments listed inside
- Experiment detail with replicates (grouped/collapsed) and notebook entries
- Replicates displayed in a compact grouped manner (not individual cards)
- Option to view all entries across entire project

#### API Changes
- New endpoints: /api/projects (CRUD), /api/projects/{id}/experiments
- Existing /api/experiments becomes nested under projects
- Notebook entries: experiment_id still works, add project_id for aggregate queries

#### Migration
- Existing experiments become projects
- User creates experiments within them going forward

---

## Implementation Order
- [x] Plan reviewed & approved
- [ ] Phase 1: Items 1-6 (bug fixes & UI tweaks)
- [ ] Phase 2: Items 8-9 (enhancements)
- [ ] Phase 3: Item 10 (projects restructure)
