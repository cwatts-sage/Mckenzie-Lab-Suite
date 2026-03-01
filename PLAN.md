# Lab Reagent Inventory Manager — Project Plan

## Overview
A web-based inventory management system for biomedical research reagents. Designed for a PhD student to track reagents across multiple storage locations, get expiration and low-stock alerts, and easily export reagent info for paper Materials sections.

## v1 Scope

### 1. Reagent Inventory
Each reagent entry includes:
- **Name**
- **Catalog number**
- **Lot number**
- **Vendor / Supplier**
- **Source link** (URL to vendor product page)
- **Storage conditions:**
  - Temperature (e.g., -80°C, -20°C, 4°C, RT)
  - **Hierarchical location:** Freezer/Fridge → Rack → Box → Position
  - Multiple freezers at the same temperature supported
  - Special conditions (light-sensitive, desiccated, etc.)
- **Quantity on hand** (with unit — e.g., 500 µL, 50 mg, 1 vial)
- **Expiration date**

### 2. Storage Location Management
- Define storage units (freezers, fridges, shelves) with names and temperatures
- Each unit has racks, each rack has boxes, each box has positions
- Example: "-80°C Freezer #2 → Rack 3 → Box B → Position 12"
- Reagents are assigned to a specific position within this hierarchy

### 3. Low Stock Alerts
- Manually flag a reagent as "running low"
- Flagged items appear in a **Notifications** dashboard
- Option to mark as "ordered" to track reorder status

### 4. Customizable Expiration Alerts
- Set a per-reagent alert lead time (e.g., 14 days, 30 days, 60 days)
- Default lead time configurable in user settings
- Expiring/expired reagents appear in the Notifications dashboard
- Visual indicators (color coding) on inventory list

### 5. Materials Export
- Select reagents used in an experiment/paper
- Generate a formatted list suitable for a Materials & Methods section
- Include: name, catalog #, vendor, lot # (optional)
- Copy-to-clipboard or download as text

### 6. User Authentication
- Login page with email/password
- Secure session management
- Single-user to start (McKenzie), expandable later

### 7. Responsive Design
- **Primary:** iPad (landscape & portrait)
- **Secondary:** Phone (iOS Safari)
- Touch-friendly UI, appropriately sized tap targets

## v2+ (Future)
- Use history linked to a lab notebook feature
- Order history tracking
- Multi-user support / lab group sharing

## Tech Stack (Proposed)
- **Frontend:** React (responsive SPA)
- **Backend:** Node.js API
- **Database:** SQLite or PostgreSQL
- **Auth:** JWT-based or session-based
- **Hosting:** Azure Static Web Apps (frontend) + Azure Functions or App Service (backend)
- **Resource Group:** mckenzie (eastus)
- **Service Principal:** sp-mckenzie-deploy

## Data Model (Draft)

### Users
| Field | Type |
|-------|------|
| id | UUID |
| email | string |
| password_hash | string |
| default_alert_days | integer (default: 30) |

### StorageUnits
| Field | Type |
|-------|------|
| id | UUID |
| name | string (e.g., "-80°C Freezer #2") |
| temperature | string |
| type | enum (freezer, fridge, shelf, other) |

### StorageLocations
| Field | Type |
|-------|------|
| id | UUID |
| storage_unit_id | FK → StorageUnits |
| rack | string |
| box | string |
| position | string (nullable) |

### Reagents
| Field | Type |
|-------|------|
| id | UUID |
| user_id | FK → Users |
| name | string |
| catalog_number | string |
| lot_number | string (nullable) |
| vendor | string |
| source_url | string (nullable) |
| storage_location_id | FK → StorageLocations |
| special_conditions | string (nullable) |
| quantity | decimal |
| quantity_unit | string |
| expiration_date | date (nullable) |
| alert_days_before | integer (nullable, falls back to user default) |
| is_low_stock | boolean (default: false) |
| is_ordered | boolean (default: false) |
| created_at | timestamp |
| updated_at | timestamp |

## Status
- [x] Requirements gathered
- [x] Plan drafted
- [x] Plan approved by McKenzie & Chris (2026-03-01)
- [x] Development started
- [x] Backend API built & deployed (Azure Functions)
- [x] Frontend built & deployed (Azure Static Web Apps)
- [x] Database configured (Azure Table Storage)
- [x] Auth system working (register, login, JWT)
- [x] Storage management working (units, locations)
- [x] Reagent CRUD working
- [x] Notifications endpoint working
- [x] Materials export working
- [x] CORS configured
- [ ] User testing / feedback
