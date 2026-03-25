# Wine Management App - Implementation Plan

## Project Overview
A cross-platform wine portfolio management app (Desktop via Electron + Android via Capacitor) with persistent SQLite storage, built with React + Vite + Tailwind CSS.

**Stack:** React 18 + TypeScript + Vite | Tailwind CSS | Electron + Capacitor | SQLite

---

## Data Model

### Wine Entity
```
wines (table)
├── id (primary key)
├── name (string) - Wine name/label
├── producer (string) - Producer/Château
├── vintage (int) - Vintage year
├── region (string) - Region/Appellation
├── country (string) - Country
├── type (enum) - Red, White, Rosé, Sparkling, Fortified
├── varietal (string) - Primary grape variety
├── tier (int) - 1-EVERYDAY, 2-QUALITY, 3-FINE, 4-PREMIUM, 5-ICON
├── location (enum) - 'home' | 'storage'
├── quantity (int) - Number of bottles
├── format (enum) - '375ml', '750ml', '1.5L', '3L', etc.
├── drinking_window_start (int) - Year
├── drinking_window_end (int) - Year
├── scores (json) - {rp: 98, js: 97, ...} (critic scores)
├── critic_note (text)
├── personal_note (text)
├── flavor_profile (json) - Array of flavor tags
├── vintage_note (text)
├── serving_temp_min (int) - Celsius
├── serving_temp_max (int)
├── alcohol_percent (decimal)
├── image_url (string) - Bottle image
├── created_at (timestamp)
├── updated_at (timestamp)
└── last_consumed_at (timestamp) - Track when last bottle was consumed
```

### Supporting Tables
- **cellar_config** - Home cellar capacity settings
- **tier_definitions** - User-configurable tier names (optional)
- **consumption_log** - History of wines consumed (date, quantity, notes)
- **delivery_schedule** - Pending deliveries from storage to home

---

## Feature Set

### MVP (Phase 1-4)
1. **Collection Page**
   - Grid view of all wines (home + storage)
   - Location filter toggle (All/Home Only/Storage Only)
   - Wine cards with image, name, tier, varietal, drinking status, quantity
   - Mark as Consumed button (decrements quantity by 1)
   - Add New Wine FAB button

2. **Wine Detail Page**
   - Full wine information display
   - Scores, critic notes, personal notes, vintage notes, flavor profile
   - Drinking window, serving temperature
   - Edit and Extract Bottle buttons

3. **Add/Edit Wine Form**
   - All wine fields
   - Location selection (home/storage)
   - Tier selection (1-5)
   - Image upload/selection

4. **Settings Page**
   - Cellar capacity configuration
   - CSV import functionality
   - Data export
   - About/info section

### Extended (Phase 5-7)
5. **Drinking Schedule Page**
   - Timeline view grouped by month
   - Algorithm-based ordering (based on drinking windows)
   - Status labels (Peak Maturity, Window Closing, Optimal Window, Early Access)
   - Tap to view wine details

6. **Delivery Schedule Page**
   - Grouped by delivery date
   - Wines transitioning from storage → home
   - Cellar capacity visualization (slot availability)
   - Delivery confirmation/tracking

7. **Scheduling Rules Engine** (once user provides rules)
   - Auto-generate drinking schedule
   - Auto-generate delivery schedule
   - Apply delivery constraints (lead time, capacity, etc.)

---

## Architecture

```
src/
├── components/
│   ├── WineCard.tsx           # Collection grid item
│   ├── WineDetailPanel.tsx    # Side panel detail view
│   ├── TopAppBar.tsx
│   ├── BottomNavBar.tsx
│   ├── WineForm.tsx           # Add/edit wine form
│   ├── Timeline.tsx           # For drinking/delivery schedules
│   └── ...
├── pages/
│   ├── CollectionPage.tsx
│   ├── WineDetailPage.tsx
│   ├── DrinkingSchedulePage.tsx
│   ├── DeliverySchedulePage.tsx
│   └── SettingsPage.tsx
├── services/
│   ├── database.ts            # SQLite connection, migrations
│   ├── wine.service.ts        # Wine CRUD operations
│   ├── import.service.ts      # CSV import logic
│   ├── schedule.service.ts    # Schedule generation (future)
│   └── storage.service.ts     # Cross-platform storage abstraction
├── store/
│   ├── wineStore.ts          # Zustand state management
│   ├── appStore.ts
│   └── types.ts
├── types/
│   └── index.ts              # TypeScript interfaces
├── styles/
│   ├── globals.css
│   └── (Tailwind via config)
├── App.tsx
└── main.tsx
```

---

## Implementation Phases

### **Phase 1: Project Setup** (3-4 hours)
- [x] Initialize Vite + React + TypeScript
- [ ] Configure Tailwind CSS (use your existing color config)
- [ ] Set up Material Symbols Outlined icons
- [ ] Create folder structure
- [ ] Configure Electron for development
- [ ] Configure Capacitor for Android

**Deliverable:** Working dev environment, can run `npm run dev` for web/Electron/Android builds

---

### **Phase 2: Data Layer & Database** (2-3 hours)
- [ ] Design SQLite schema
- [ ] Create database service (better-sqlite3 for Electron, capacitor-sqlite for mobile)
- [ ] Implement database initialization & migrations
- [ ] Create Wine TypeScript interfaces
- [ ] Implement CRUD operations (create, read, update, delete wine)
- [ ] Test with sample data

**Deliverable:** Functional database with sample wines inserted

---

### **Phase 3: UI Components & Layouts** (4-5 hours)
- [ ] Build reusable components (TopAppBar, BottomNavBar, WineCard, etc.)
- [ ] Create responsive page layouts matching your HTML designs
- [ ] Implement navigation between pages
- [ ] Set up routing (React Router)
- [ ] Mobile-first responsive CSS (Tailwind)

**Deliverable:** App shell with navigation working, pages placeholder content

---

### **Phase 4: Collection Page & Core Features** (5-6 hours)
- [ ] Fetch wines from SQLite
- [ ] Render wine grid dynamically
- [ ] Implement location filter (All/Home/Storage)
- [ ] Add WineCard component with hover states
- [ ] Implement "Mark as Consumed" (decrement quantity)
- [ ] Implement wine detail side panel (desktop)
- [ ] Wine detail modal (mobile)
- [ ] Add wine form (modal or page)
- [ ] Edit wine functionality
- [ ] Delete wine functionality

**Deliverable:** Fully functional collection page with CRUD

---

### **Phase 5: Settings & Import/Export** (3-4 hours)
- [ ] Build Settings page UI
- [ ] Cellar capacity configuration
- [ ] CSV import parser (map user's spreadsheet → wine model)
- [ ] Bulk insert wines from CSV
- [ ] Export wines to CSV
- [ ] Validation & error handling

**Deliverable:** Users can import existing wine data from CSV

---

### **Phase 6: Drinking & Delivery Schedules** (4-5 hours)
- [ ] Drinking Schedule page layout (timeline with months)
- [ ] Delivery Schedule page layout (grouped by date)
- [ ] Mock data for both schedules
- [ ] Implement tap-to-detail functionality
- [ ] Cellar capacity visualization

**Deliverable:** Schedule pages display data (algorithm logic added later once rules defined)

---

### **Phase 7: Scheduling Rules & Algorithm** (6-8 hours - *After user provides rules*)
- [ ] Define scheduling rules (from user input)
- [ ] Implement drinking schedule generation algorithm
- [ ] Implement delivery schedule generation algorithm
- [ ] Apply constraints (delivery lead time, cellar capacity, etc.)
- [ ] Test with various scenarios

**Deliverable:** Auto-generated schedules based on wine drinking windows & rules

---

### **Phase 8: Platform-Specific Builds** (2-3 hours)
- [ ] Finalize Electron configuration (Windows/Mac/Linux)
- [ ] Test desktop builds
- [ ] Finalize Capacitor configuration (Android)
- [ ] Build APK/app bundle
- [ ] Test on Android device/emulator
- [ ] Handle platform-specific storage differences

**Deliverable:** Working executables for desktop and Android

---

### **Phase 9: Polish & Testing** (2-3 hours)
- [ ] E2E testing (key workflows)
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] UI refinements based on user feedback
- [ ] Icon/image optimization

**Deliverable:** Production-ready app

---

## CSV Import Format (Expected)

Your spreadsheet should have columns like:
```
producer,name,vintage,region,country,type,varietal,tier,location,quantity,format,drink_from,drink_to,rp_score,js_score,critic_note,personal_note,...
```

Example:
```
Château Margaux,Margaux,2015,Margaux,France,Red,Cabernet Sauvignon,5,home,3,750ml,2025,2060,98,97,"Exceptional balance",...
```

---

## Critical Questions to Resolve

1. **CSV Format:** Please share the exact column names/structure of your spreadsheet (sample row)
2. **Scheduling Rules:** When ready, define the rules for:
   - How drinking schedule is generated (drinking window priority? user preference order?)
   - How delivery schedule is generated (when/how often? size constraints?)
   - Any constraints on delivery frequency, batch size, etc.

---

## Next Steps

1. User confirms plan looks good
2. Start Phase 1 (project setup)
3. User shares CSV format example
4. Once Phases 1-5 complete, user provides scheduling rules
5. Complete Phases 6-7 with rules implemented

---

## Storage Strategy

- **Electron (Desktop):** better-sqlite3 (native SQLite binding for Node.js) → local `~/.cellar/wines.db`
- **Capacitor (Android):** @capacitor-community/sqlite → app-specific storage directory
- **Web (if PWA):** Same Capacitor SQLite or IndexedDB fallback

Data is **entirely local** — no cloud sync. Import/export via CSV for backups.

