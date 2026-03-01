# 🔬 McKenzie's Lab Suite

A multi-app web platform for biomedical research lab management. Built for PhD researchers to track reagent inventory, record experiments in a digital lab notebook, and manage lab operations — all from one place.

**Live:** [https://witty-meadow-0d01fc30f.6.azurestaticapps.net](https://witty-meadow-0d01fc30f.6.azurestaticapps.net)

## Features

### 🏠 Hub Dashboard
- Central landing page with app cards showing live stats
- Quick navigation to all sections
- Personalized greeting

### 📦 Inventory
| Feature | Description |
|---------|-------------|
| **📋 Reagents** | Full CRUD for lab reagents — name, catalog #, vendor, lot #, quantity, expiration, storage location. Filter by storage unit or low stock status |
| **🧫 Samples** | Track experimental samples — organism/strain, date collected, experiment, quantity, status (active/used/depleted/contaminated) |
| **🔔 Notifications** | Dashboard showing expired reagents, expiring soon, and low stock items at a glance |
| **🗄️ Storage** | Hierarchical storage management — define freezers/fridges/shelves, then racks, boxes, and positions within each |
| **📚 Catalog** | Shared reagent library — paste a vendor URL (Thermo Fisher, Sigma-Aldrich, Abcam, etc.) to auto-scrape product info. Pick from catalog when adding to inventory |
| **📄 Export** | Generate formatted reagent lists for paper Materials & Methods sections. Copy to clipboard |

### 📓 Lab Notebook
| Feature | Description |
|---------|-------------|
| **📝 Entries** | Record lab work with timestamped entries. Types: Protocol, Observation, Result, Note. Two views: chronological list or grouped by date |
| **🧪 Experiments** | Organize entries by experiment/project. Status tracking: Active, Paused, Completed, Abandoned. Tags for categorization |
| **@-Mention Linking** | Type `@` in any entry to search and link reagents or samples from your inventory. Shows as colored chips |
| **📜 Edit History** | Every save creates a version snapshot. View previous versions anytime |

### 🔐 Admin & Auth
- User registration with admin approval (new users can't access until approved)
- Admin panel to approve, disable, or delete users
- JWT-based authentication
- Customizable settings (display name, default alert days)

### 📱 PWA Support
- Add to Home Screen on iOS and Android
- Runs in standalone mode (no browser chrome)
- Responsive design — iPad primary, phone secondary

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React (Create React App), React Router |
| **Backend** | Azure Functions v4 (Node.js) |
| **Database** | Azure Table Storage |
| **Hosting** | Azure Static Web Apps (frontend) + Azure Functions Consumption Plan (API) |
| **Auth** | JWT (jsonwebtoken + bcryptjs) |
| **Region** | East US |

## Project Structure

```
├── api/                          # Azure Functions API
│   ├── host.json
│   ├── package.json
│   └── src/
│       ├── functions/
│       │   ├── auth.js           # Register, login, profile, settings
│       │   ├── admin.js          # User management (route: /manage/*)
│       │   ├── reagents.js       # Reagent CRUD, export, notifications
│       │   ├── samples.js        # Sample CRUD
│       │   ├── storage.js        # Storage units + locations CRUD
│       │   ├── catalog.js        # Shared catalog + URL scraping
│       │   ├── experiments.js    # Experiment CRUD
│       │   ├── notebook.js       # Notebook entries + edit history
│       │   └── hub.js            # Dashboard summary stats
│       └── shared/
│           ├── auth.js           # JWT helpers, password hashing
│           └── db.js             # Azure Table Storage client
├── frontend/                     # React SPA
│   ├── public/
│   │   ├── index.html            # PWA meta tags
│   │   ├── manifest.json         # PWA manifest
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── src/
│       ├── api.js                # Axios client + all API modules
│       ├── App.js                # Routing + navigation
│       └── components/
│           ├── Hub.js, Login.js, Settings.js, Admin.js
│           ├── Inventory.js, Samples.js, Notifications.js
│           ├── Storage.js, Catalog.js, Export.js
│           └── Notebook.js, Experiments.js
├── staticwebapp.config.json      # SPA routing + CORS
└── backend/                      # Legacy local dev server (not deployed)
```

## Deployment

### Prerequisites
- Azure CLI (`az`) authenticated
- Azure SWA CLI (`swa`)
- Node.js 18+

### Environment Variables (Azure Function App)
| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Table Storage connection string |
| `JWT_SECRET` | JWT signing secret |

### Deploy API
```bash
cd api
rm -f /tmp/func-deploy.zip
zip -r /tmp/func-deploy.zip . -x "local.settings.json" ".git/*"
az functionapp deployment source config-zip \
  --resource-group mckenzie \
  --name lab-inventory-api \
  --src /tmp/func-deploy.zip
```

### Deploy Frontend
```bash
cd frontend
GENERATE_SOURCEMAP=false npm run build
cp ../staticwebapp.config.json build/
swa deploy frontend/build \
  --deployment-token <SWA_DEPLOY_TOKEN> \
  --env production
```

## Azure Resources
| Resource | Name |
|----------|------|
| Resource Group | `mckenzie` |
| Static Web App | `witty-meadow-0d01fc30f` |
| Function App | `lab-inventory-api` |
| Storage Account | `labinventorystore` |

### Azure Tables
`users` · `storageunits` · `storagelocations` · `reagents` · `samples` · `catalog` · `experiments` · `notebookentries` · `entryhistory`

## Current Status
- ✅ All features deployed and functional
- 🧪 McKenzie testing in production
- 📋 Awaiting feedback for refinements

## Roadmap
- [ ] Media attachments in notebook entries (gel photos, microscopy images)
- [ ] Use history / audit trail for reagents
- [ ] Protocol templates library
- [ ] Data analysis tools
- [ ] Multi-user sharing / PI review

---

Built with 🍄 by Toadstool + Chris for McKenzie's PhD research
