# Wine Management - Complete Workflows & Database Schema

---

# PART 1: DATABASE SCHEMA

## **Table: wines**
Master table storing all wine inventory with split quantities for storage and home.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | UUID | PRIMARY KEY | Unique wine identifier |
| name | TEXT | NOT NULL | Wine name/label |
| vintage | INTEGER | NOT NULL | Vintage year (4-digit, >= 1800) |
| tier | INTEGER | NOT NULL, CHECK(1-5) | Quality tier 1-5 |
| region | TEXT | NOT NULL | Wine region (Bordeaux, Napa Valley, etc.) |
| producer | TEXT | | Producer/winery name |
| classification | TEXT | | Wine classification (Grand Cru, etc.) |
| wine_type | TEXT | | Type (Red, White, Rosé, Sparkling) |
| varietal | TEXT | | Primary grape varietal |
| country | TEXT | | Country of origin |
| alcohol_percent | REAL | CHECK(0-20) | Alcohol by volume |
| serving_temp_min | INTEGER | | Minimum serving temperature (°F) |
| serving_temp_max | INTEGER | | Maximum serving temperature (°F) |
| flavor_profile | TEXT | | Tasting notes/flavor descriptors |
| critic_ratings | TEXT | | Critic scores or reviews |
| drinking_window_start | INTEGER | NOT NULL | Earliest year wine is drinkable |
| drinking_window_end | INTEGER | NOT NULL | Latest year wine is optimal |
| image_url | TEXT | | URL to wine image |
| quantity_in_storage | INTEGER | NOT NULL, DEFAULT 0, CHECK(>=0) | Bottles in storage |
| quantity_at_home | INTEGER | NOT NULL, DEFAULT 0, CHECK(>=0) | Bottles at home |
| notes | TEXT | | User notes about wine |
| created_at | TIMESTAMP | NOT NULL | Record creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update time |

---

## **Table: cellar_config**
Singleton configuration table (id=1 enforced by CHECK constraint).

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | INTEGER | PRIMARY KEY, CHECK(id=1) | Only one config record allowed |
| max_home_capacity | INTEGER | NOT NULL, CHECK(>0) | Max bottles allowed at home |
| annual_consumption_target | INTEGER | NOT NULL, CHECK(>0) | Target bottles/year for scheduling |
| created_at | TIMESTAMP | NOT NULL | Record creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update time |

---

## **Table: consumption_log**
Historical record of wine consumption.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | UUID | PRIMARY KEY | Unique consumption record |
| wine_id | UUID | NOT NULL, FK wines(id) | Wine consumed |
| consumed_date | DATE | NOT NULL | Date wine was consumed |
| notes | TEXT | | Tasting notes or occasion |
| created_at | TIMESTAMP | NOT NULL | Record creation time |

---

## **Table: delivery_window**
Delivery occasions with scheduling and locking status.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | UUID | PRIMARY KEY | Unique delivery window |
| scheduled_date | DATE | NOT NULL | Scheduled delivery date |
| locked | BOOLEAN | NOT NULL, DEFAULT FALSE | Is window manually locked? |
| status | TEXT | NOT NULL, DEFAULT 'planned' | Status: 'planned', 'in_transit', 'completed' |
| created_at | TIMESTAMP | NOT NULL | Record creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update time |

---

## **Table: delivery_window_wines**
Persists manually-edited wines for locked delivery windows.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | UUID | PRIMARY KEY | Unique record |
| delivery_window_id | UUID | NOT NULL, FK delivery_window(id) | Associated delivery window |
| wine_id | UUID | NOT NULL, FK wines(id) | Wine in delivery |
| quantity | INTEGER | NOT NULL, CHECK(>0) | Bottles to deliver |
| status | TEXT | NOT NULL, DEFAULT 'pending' | Status: 'pending', 'delivered', 'failed' |
| created_at | TIMESTAMP | NOT NULL | Record creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update time |

**Composite Key:** (delivery_window_id, wine_id)

---

## **Table: delivery_completion_log**
History of completed deliveries for each wine.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | UUID | PRIMARY KEY | Unique delivery record |
| wine_id | UUID | NOT NULL, FK wines(id) | Wine delivered |
| delivery_window_id | UUID | NOT NULL, FK delivery_window(id) | Delivery window |
| quantity_delivered | INTEGER | NOT NULL, CHECK(>0) | Bottles delivered |
| delivered_date | DATE | NOT NULL | Actual delivery date |
| status | TEXT | NOT NULL, DEFAULT 'completed' | Status: 'completed', 'failed', 'partial' |
| created_at | TIMESTAMP | NOT NULL | Record creation time |

---

## **Table: audit_log**
Action history for traceability and debugging.

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| id | UUID | PRIMARY KEY | Unique audit record |
| action | TEXT | NOT NULL | Action type (edit_wine, add_bottles, consume, lock_window, etc.) |
| wine_id | UUID | FK wines(id) | Related wine (if applicable) |
| delivery_window_id | UUID | FK delivery_window(id) | Related delivery window (if applicable) |
| details | JSON | | JSON object with action-specific details |
| user_id | TEXT | | User performing action (if available) |
| created_at | TIMESTAMP | NOT NULL | When action occurred |

---

## **Database Relationships Summary**

```
wines (1) ──────┬──────── (N) delivery_window_wines
                ├──────── (N) consumption_log
                ├──────── (N) delivery_completion_log
                └──────── (N) audit_log

delivery_window (1) ──────┬──────── (N) delivery_window_wines
                          ├──────── (N) delivery_completion_log
                          └──────── (N) audit_log

cellar_config (singleton) ─ used by all workflows for constraints
```

---

---

# PART 2: WORKFLOWS

## **Workflow 1: Load Wine Collection**

**Purpose:** Import wine collection from CSV file at app startup or on user request.

**Triggers:**
- App startup (if no wines in database)
- User clicks "Import Wines" button
- User selects CSV file from file dialog

**Input:**
```csv
name,vintage,tier,region,producer,wine_type,varietal,country,alcohol_percent,drinking_window_start,drinking_window_end,quantity_in_storage,quantity_at_home
Château Margaux,2015,1,Bordeaux,Château Margaux,Red,Cabernet Sauvignon,France,13.0,2020,2045,12,0
...
```

**Output:** Wine records inserted into database; collection loaded into wineStore

---

### **Logic Flow:**

```
USER IMPORTS WINES:
  1. User clicks "Import Wines" or selects CSV file
  
  2. Parse CSV file:
     FOR each row in CSV:
       a) Extract fields: name, vintage, tier, region, producer, etc.
       
       b) Validate row:
          - name: NOT NULL, NOT empty
          - vintage: 4-digit year, >= 1800
          - tier: 1-5
          - quantity_in_storage: >= 0
          - quantity_at_home: >= 0
          - drinking_window_start <= drinking_window_end
          
          IF validation fails:
            Log error with row number and field name
            Mark row as FAILED
            Continue to next row
       
       c) Check for duplicates:
          existing = SELECT * FROM wines
                    WHERE name = row.name
                    AND vintage = row.vintage
                    AND producer = row.producer
          
          IF exists:
            Mark row as SKIPPED (already in collection)
            Continue to next row
  
  3. Check total capacity:
     total_quantity_at_home = SUM(quantity_at_home) from all valid rows
     
     IF total_quantity_at_home > cellar_config.max_home_capacity:
       Show warning: "Collection exceeds home capacity ({total} > {max})"
       Proceed with import (user can move to storage later)
  
  4. Insert valid wines:
     FOR each validated, non-duplicate row:
       INSERT INTO wines (
         id = UUID,
         name = row.name,
         vintage = row.vintage,
         tier = row.tier,
         region = row.region,
         producer = row.producer,
         wine_type = row.wine_type,
         varietal = row.varietal,
         country = row.country,
         alcohol_percent = row.alcohol_percent,
         drinking_window_start = row.drinking_window_start,
         drinking_window_end = row.drinking_window_end,
         quantity_in_storage = row.quantity_in_storage,
         quantity_at_home = row.quantity_at_home,
         created_at = NOW,
         updated_at = NOW
       )
  
  5. Load all wines into wineStore:
     wineStore.wines = SELECT * FROM wines (all records)
  
  6. Set invalidation flags:
     deliveryScheduleInvalidated = TRUE
       (New wines available for scheduling)
     consumptionScheduleInvalidated = TRUE
       (New wines available for consumption)
  
  7. Display import summary:
     - Total rows in CSV: X
     - Rows imported: Y
     - Rows skipped (duplicates): Z
     - Rows failed (validation errors): [list with details]
  
  8. Navigate to main wine listing page
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Insert wines | wines | WRITE (bulk) |
| Select all wines | wines | READ |
| Read config | cellar_config | READ (for capacity check) |

---

### **Validation Rules:**

- **Name:** Required, non-empty string
- **Vintage:** 4-digit year, >= 1800
- **Tier:** Integer 1-5
- **Quantities:** Non-negative integers
- **Drinking Window:** start ≤ end
- **Duplicates:** Skip if name+vintage+producer already exists

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE`
- `consumptionScheduleInvalidated = TRUE`

---

### **Error Handling:**

- **Invalid row:** Log with row number; skip and continue
- **File format:** Validate CSV headers; show error if missing required columns
- **Capacity warning:** Show warning but proceed (user can manage later)

---

---

## **Workflow 2A: Edit Wine Details**

**Purpose:** Modify wine metadata (name, year, drinking window, etc.) without affecting inventory.

**Triggers:**
- User clicks "Edit" on wine in main listing page
- User opens wine detail page and edits fields

**Input:**
```json
{
  wine_id: "uuid-xxx",
  fields_to_update: {
    name: "string (optional)",
    vintage: "integer (optional)",
    notes: "string (optional)",
    critic_ratings: "string (optional)",
    flavor_profile: "string (optional)",
    classification: "string (optional)",
    wine_type: "string (optional)",
    varietal: "string (optional)",
    country: "string (optional)",
    region: "string (optional)",
    alcohol_percent: "number (optional)",
    serving_temp_min: "integer (optional)",
    serving_temp_max: "integer (optional)",
    image_url: "string (optional)",
    drinking_window_start: "integer (optional)",
    drinking_window_end: "integer (optional)"
  }
}
```

**Output:** Updated wine object; wine listing/detail page refreshes

---

### **Logic Flow:**

```
USER EDITS WINE DETAILS:
  1. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  2. Validate new values:
     
     IF field is vintage:
       Validate: 4-digit year, >= 1800
       IF invalid: REJECT with error
     
     IF field is tier:
       Validate: 1-5
       IF invalid: REJECT with error
     
     IF field is drinking_window_start or drinking_window_end:
       new_start = fields_to_update.drinking_window_start ?? wine.drinking_window_start
       new_end = fields_to_update.drinking_window_end ?? wine.drinking_window_end
       Validate: new_start ≤ new_end
       IF invalid: REJECT with error "End year must be >= start year"
     
     IF field is alcohol_percent:
       Validate: 0 ≤ value ≤ 20
       IF invalid: REJECT with error
  
  3. IF all validation passes:
     UPDATE wines SET
       name = fields_to_update.name ?? wine.name,
       vintage = fields_to_update.vintage ?? wine.vintage,
       notes = fields_to_update.notes ?? wine.notes,
       critic_ratings = fields_to_update.critic_ratings ?? wine.critic_ratings,
       flavor_profile = fields_to_update.flavor_profile ?? wine.flavor_profile,
       classification = fields_to_update.classification ?? wine.classification,
       wine_type = fields_to_update.wine_type ?? wine.wine_type,
       varietal = fields_to_update.varietal ?? wine.varietal,
       country = fields_to_update.country ?? wine.country,
       region = fields_to_update.region ?? wine.region,
       alcohol_percent = fields_to_update.alcohol_percent ?? wine.alcohol_percent,
       serving_temp_min = fields_to_update.serving_temp_min ?? wine.serving_temp_min,
       serving_temp_max = fields_to_update.serving_temp_max ?? wine.serving_temp_max,
       image_url = fields_to_update.image_url ?? wine.image_url,
       drinking_window_start = fields_to_update.drinking_window_start ?? wine.drinking_window_start,
       drinking_window_end = fields_to_update.drinking_window_end ?? wine.drinking_window_end,
       updated_at = NOW
     WHERE id = wine_id
  
  4. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'edit_wine_details',
       wine_id = wine_id,
       details = JSON {
         fields_changed: [list of field names],
         old_values: {original values},
         new_values: {updated values}
       },
       created_at = NOW
     )
  
  5. Update wineStore:
     wineStore.wines[wine_id] = updated wine object
  
  6. Set invalidation flags:
     IF drinking_window_start or drinking_window_end changed:
       deliveryScheduleInvalidated = TRUE
       consumptionScheduleInvalidated = TRUE
     ELSE:
       No flags set
  
  7. Refresh wine listing page or detail page
  8. Display success message: "Wine details updated"
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |

---

### **Validation Rules:**

- **Vintage:** 4-digit year, >= 1800
- **Tier:** 1-5
- **Drinking Window:** start ≤ end
- **Alcohol Percent:** 0-20
- **Text fields:** Optional, but if provided must be non-empty

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE` (if drinking_window changed)
- `consumptionScheduleInvalidated = TRUE` (if drinking_window changed)
- No flags if only editing metadata

---

### **UI Availability:**

- Main wine listing page: "Edit" button/menu item per wine
- Wine detail page: Editable fields with save button

---

---

## **Workflow 2B: Add Bottles**

**Purpose:** Increase wine quantity by adding more bottles to storage or home (subject to capacity).

**Triggers:**
- User clicks "Add Bottles" on wine in main listing page
- User clicks "Add Bottles" on wine detail page

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity_to_add: 12,
  destination: "storage" or "home"
}
```

**Output:** Updated wine with new quantity; wine listing/detail page refreshes

---

### **Logic Flow:**

```
USER CLICKS "ADD BOTTLES":
  1. Open dialog with:
     - Quantity to add: [input, min=1]
     - Destination: [Storage / Home radio buttons]
     - Note: [optional text]
  
  2. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  3. User fills form and clicks "Add":
     quantity = input.quantity_to_add
     destination = input.destination
     note = input.note
  
  4. Validate:
     
     IF quantity <= 0:
       REJECT with error: "Quantity must be > 0"
     
     IF destination == 'home':
       total_at_home = SUM(quantity_at_home) FROM wines
       new_total_at_home = total_at_home + quantity
       
       IF new_total_at_home > cellar_config.max_home_capacity:
         REJECT with error: "Adding {quantity} bottles would exceed home capacity.
                             Current: {total_at_home}, Max: {max}, Available: {available}"
  
  5. IF validation passes:
     
     IF destination == 'storage':
       UPDATE wines SET
         quantity_in_storage = quantity_in_storage + quantity,
         updated_at = NOW
       WHERE id = wine_id
     
     ELSE IF destination == 'home':
       UPDATE wines SET
         quantity_at_home = quantity_at_home + quantity,
         updated_at = NOW
       WHERE id = wine_id
  
  6. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'add_bottles',
       wine_id = wine_id,
       details = JSON {
         quantity_added: quantity,
         destination: destination,
         old_quantity: wine.quantity_in_storage or wine.quantity_at_home,
         new_quantity: old + quantity,
         notes: note
       },
       created_at = NOW
     )
  
  7. Update wineStore:
     wineStore.wines[wine_id] = updated wine object
  
  8. Set invalidation flags:
     deliveryScheduleInvalidated = TRUE
     consumptionScheduleInvalidated = TRUE
  
  9. Close dialog and refresh page
  10. Display: "Added {quantity} bottles to {destination}"
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |
| Read config | cellar_config | READ (capacity check) |

---

### **Validation Rules:**

- **Quantity:** > 0, integer
- **Destination:** 'storage' or 'home'
- **Capacity Check (home):** total_at_home + quantity ≤ max_home_capacity

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE`
- `consumptionScheduleInvalidated = TRUE`

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Quantity ≤ 0 | "Quantity must be a positive number" |
| Home capacity exceeded | "Adding {X} bottles exceeds capacity. Current: {Y}, Max: {Z}, Available: {A}" |

---

### **UI Availability:**

- Main wine listing page: "Add Bottles" button per wine
- Wine detail page: "Add Bottles" button/section

---

---

## **Workflow 2C: Consume Wine**

**Purpose:** Mark bottles as consumed, logging the date and optional notes.

**Triggers:**
- User clicks "Consume" on wine in main listing page
- User clicks "Log Consumption" on wine detail page

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity_consumed: 1,
  consumed_date: "2026-04-04",
  notes: "Dinner with friends"
}
```

**Output:** Wine quantity updated; consumption logged

---

### **Logic Flow:**

```
USER CLICKS "CONSUME":
  1. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  2. Check if wine is available:
     IF wine.quantity_at_home == 0:
       REJECT with error: "No bottles at home to consume"
  
  3. Open dialog with:
     - Quantity to consume: [input, min=1, max=wine.quantity_at_home]
     - Consumed date: [date picker, DEFAULT=TODAY]
     - Notes: [optional text]
  
  4. User fills form and clicks "Log Consumption":
     quantity = input.quantity_consumed
     consumed_date = input.consumed_date (defaults to TODAY)
     notes = input.notes
  
  5. Validate:
     
     IF quantity <= 0:
       REJECT with error: "Quantity must be > 0"
     
     IF quantity > wine.quantity_at_home:
       REJECT with error: "Cannot consume more than available.
                           Available: {wine.quantity_at_home}, Requested: {quantity}"
     
     IF consumed_date > TODAY:
       REJECT with error: "Cannot log consumption for future date"
  
  6. IF validation passes:
     
     INSERT consumption_log (
       id = UUID,
       wine_id = wine_id,
       consumed_date = consumed_date,
       notes = notes,
       created_at = NOW
     )
     
     UPDATE wines SET
       quantity_at_home = quantity_at_home - quantity,
       updated_at = NOW
     WHERE id = wine_id
  
  7. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'consume_wine',
       wine_id = wine_id,
       details = JSON {
         quantity_consumed: quantity,
         consumed_date: consumed_date,
         notes: notes,
         old_quantity_at_home: wine.quantity_at_home,
         new_quantity_at_home: wine.quantity_at_home - quantity
       },
       created_at = NOW
     )
  
  8. Update wineStore:
     wineStore.wines[wine_id] = updated wine object
  
  9. Set invalidation flags:
     consumptionScheduleInvalidated = TRUE
  
  10. Close dialog and refresh page
  11. Display: "Logged {quantity} bottle(s) consumed on {consumed_date}"
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Insert consumption log | consumption_log | WRITE |
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |

---

### **Validation Rules:**

- **Quantity:** > 0, integer, ≤ quantity_at_home
- **Consumed Date:** ≤ TODAY (past or today, not future)
- **Wine location:** quantity_at_home > 0

---

### **Flags Set:**

- `consumptionScheduleInvalidated = TRUE`

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Quantity ≤ 0 | "Quantity must be positive" |
| Quantity > at home | "Cannot consume more than available ({available} at home)" |
| Future date | "Cannot log consumption for future date" |
| No bottles at home | "No bottles at home to consume" |

---

### **UI Availability:**

- Main wine listing page: "Consume" button (only if quantity_at_home > 0)
- Wine detail page: "Log Consumption" button (only if quantity_at_home > 0)

---

---

## **Workflow 2D: Move to Home**

**Purpose:** Transfer bottles from storage to home (subject to home capacity).

**Triggers:**
- User clicks "Move to Home" on wine in main listing page
- User clicks "Move to Home" on wine detail page

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity_to_move: 6
}
```

**Output:** Wine quantities updated (storage decreased, home increased)

---

### **Logic Flow:**

```
USER CLICKS "MOVE TO HOME":
  1. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  2. Check if wine is in storage:
     IF wine.quantity_in_storage == 0:
       REJECT with error: "No bottles in storage to move"
  
  3. Open dialog with:
     - Quantity to move: [input, min=1, max=wine.quantity_in_storage]
     - Note: [optional]
  
  4. User selects quantity and clicks "Move":
     quantity = input.quantity_to_move
     note = input.note
  
  5. Validate:
     
     IF quantity <= 0:
       REJECT with error: "Quantity must be > 0"
     
     IF quantity > wine.quantity_in_storage:
       REJECT with error: "Cannot move more than available in storage.
                           Available: {wine.quantity_in_storage}, Requested: {quantity}"
     
     Check home capacity:
       total_at_home = SUM(quantity_at_home) FROM wines WHERE id != wine_id
       wine_at_home = wine.quantity_at_home
       total_including_this = total_at_home + wine_at_home + quantity
       
       IF total_including_this > cellar_config.max_home_capacity:
         available_space = max_home_capacity - (total_at_home + wine_at_home)
         REJECT with error: "Insufficient home capacity.
                             Current home total: {total_at_home + wine_at_home},
                             Trying to add: {quantity},
                             Max capacity: {max},
                             Available space: {available_space}"
  
  6. IF validation passes:
     
     UPDATE wines SET
       quantity_in_storage = quantity_in_storage - quantity,
       quantity_at_home = quantity_at_home + quantity,
       updated_at = NOW
     WHERE id = wine_id
  
  7. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'move_to_home',
       wine_id = wine_id,
       details = JSON {
         quantity_moved: quantity,
         old_quantity_in_storage: wine.quantity_in_storage,
         new_quantity_in_storage: wine.quantity_in_storage - quantity,
         old_quantity_at_home: wine.quantity_at_home,
         new_quantity_at_home: wine.quantity_at_home + quantity,
         notes: note
       },
       created_at = NOW
     )
  
  8. Update wineStore:
     wineStore.wines[wine_id] = updated wine object
  
  9. Set invalidation flags:
     deliveryScheduleInvalidated = TRUE
     consumptionScheduleInvalidated = TRUE
  
  10. Close dialog and refresh page
  11. Display: "Moved {quantity} bottles to home"
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |
| Read config | cellar_config | READ (capacity check) |

---

### **Validation Rules:**

- **Quantity:** > 0, integer, ≤ quantity_in_storage
- **Home Capacity:** total_at_home + quantity ≤ max_home_capacity

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE`
- `consumptionScheduleInvalidated = TRUE`

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| No storage bottles | "No bottles in storage to move" |
| Quantity ≤ 0 | "Quantity must be positive" |
| Quantity > in storage | "Cannot move more than available in storage ({available})" |
| Home capacity exceeded | "Moving {X} bottles exceeds capacity. Current: {Y}, Max: {Z}, Available: {A}" |

---

### **UI Availability:**

- Main wine listing page: "Move to Home" button (only if quantity_in_storage > 0)
- Wine detail page: "Move to Home" button (only if quantity_in_storage > 0)

---

---

## **Workflow 3: Update Cellar Configuration**

**Purpose:** Update cellar settings (home capacity, annual consumption target).

**Triggers:**
- User clicks "Settings" or "Cellar Configuration"
- User modifies configuration on settings page

**Input:**
```json
{
  max_home_capacity: 50,
  annual_consumption_target: 30
}
```

**Output:** Updated config in database; settings page refreshes

---

### **Logic Flow:**

```
USER UPDATES CELLAR CONFIG:
  1. Retrieve current config:
     config = SELECT * FROM cellar_config WHERE id = 1
  
  2. User edits fields and clicks "Save":
     new_max_home_capacity = input.max_home_capacity
     new_annual_consumption_target = input.annual_consumption_target
  
  3. Validate:
     
     IF new_max_home_capacity <= 0:
       REJECT with error: "Home capacity must be > 0"
     
     IF new_annual_consumption_target <= 0:
       REJECT with error: "Annual consumption target must be > 0"
     
     Check home inventory vs new capacity:
       total_at_home = SUM(quantity_at_home) FROM wines
       IF total_at_home > new_max_home_capacity:
         Show warning: "Current home inventory ({total_at_home}) exceeds new capacity ({new_max}).
                       Move excess to storage or consume wines."
         Allow user to proceed anyway (they can fix inventory later)
  
  4. IF validation passes:
     
     UPDATE cellar_config SET
       max_home_capacity = new_max_home_capacity ?? config.max_home_capacity,
       annual_consumption_target = new_annual_consumption_target ?? config.annual_consumption_target,
       updated_at = NOW
     WHERE id = 1
  
  5. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'update_cellar_config',
       details = JSON {
         old_max_home_capacity: config.max_home_capacity,
         new_max_home_capacity: new_max_home_capacity,
         old_annual_consumption_target: config.annual_consumption_target,
         new_annual_consumption_target: new_annual_consumption_target
       },
       created_at = NOW
     )
  
  6. Update cellarConfig in app state
  
  7. Set invalidation flags:
     consumptionScheduleInvalidated = TRUE
       (If annual_consumption_target changed, algorithm must recalculate)
  
  8. Refresh settings page
  9. Display: "Cellar configuration updated"
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update config | cellar_config | WRITE |
| Read wines | wines | READ (for capacity check) |
| Log action | audit_log | WRITE |

---

### **Validation Rules:**

- **max_home_capacity:** > 0
- **annual_consumption_target:** > 0

---

### **Flags Set:**

- `consumptionScheduleInvalidated = TRUE` (if annual_consumption_target changed)

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Invalid capacity | "Home capacity must be greater than 0" |
| Invalid target | "Annual consumption target must be greater than 0" |
| Capacity warning | "Current home inventory ({X}) exceeds new capacity ({Y})" |

---

---

## **Workflow 4: Generate Initial Delivery Schedule**

**Purpose:** Algorithm creates initial delivery schedule for wines in storage across multiple windows.

**Triggers:**
- User clicks "Generate Delivery Schedule"
- App startup (if no current delivery window exists)
- User navigates to Delivery Schedule page (if flag is set)

**Input:** None (reads from database and current config)

**Output:** Array of delivery schedule entries in-memory; one delivery_window record marked as current

---

### **Logic Flow:**

```
GENERATE DELIVERY SCHEDULE:
  1. Check for existing current window:
     current_window = SELECT * FROM delivery_window
                     WHERE status != 'completed'
                     ORDER BY scheduled_date ASC
                     LIMIT 1
     
     IF current_window exists and is locked:
       LOAD locked window from delivery_window_wines table
       Use as current window; regenerate all other windows
     ELSE:
       Create new delivery_window record
  
  2. Identify candidate wines:
     FOR each wine in wines WHERE quantity_in_storage > 0:
       
       Drinking window check:
         IF drinking_window_start > CURRENT_YEAR:
           SKIP (wine not yet drinkable)
         IF drinking_window_end < CURRENT_YEAR + 1:
           SKIP (wine is past optimal drinking)
       
       Add to candidates: wine_id, tier, quantity_in_storage, region, producer
  
  3. Create delivery windows:
     
     window_index = 1
     bottles_delivered_so_far = 0
     monthly_quota = 20 (example; adjust based on storage quantity)
     
     WHILE candidates remain:
       
       a) Create new delivery_window:
          INSERT delivery_window (
            id = UUID,
            scheduled_date = CURRENT_DATE + (window_index * 30 days),
            locked = FALSE,
            status = 'planned',
            created_at = NOW,
            updated_at = NOW
          )
          window_id = inserted window id
       
       b) Select wines for this window:
          - Tier distribution: 80% Tier 1-3, 20% Tier 4-5
          - Tier spacing: Limit appearances per tier per year
          - Region diversity: Prefer different regions
          - Producer diversity: Prefer different producers
          selected_wines = select_wines_for_window(
            candidates, monthly_quota, tier_rules, region_rules, producer_rules
          )
       
       c) Add wines to in-memory schedule:
          FOR each selected wine:
            deliverySchedule.push({
              window_index: window_index,
              window_id: window_id,
              wine_id: selected_wine.wine_id,
              quantity: selected_wine.quantity_in_storage,
              tier: selected_wine.tier,
              region: selected_wine.region,
              scheduled_date: window.scheduled_date,
              status: 'pending'
            })
       
       d) Remove selected wines from candidates
          (or decrement quantity if partial delivery)
       
       window_index += 1
       bottles_delivered_so_far += total_selected_quantity
  
  4. Load current window manually-edited wines (if locked):
     IF current_window.locked == TRUE:
       manually_edited_wines = SELECT * FROM delivery_window_wines
                              WHERE delivery_window_id = current_window.id
       
       FOR each manually edited wine:
         Update in-memory schedule to reflect manual edits
         (Override algorithm-generated entries for this window)
  
  5. Store schedule in-memory:
     deliverySchedule = populated schedule array
     flagged = FALSE (schedule is now current)
  
  6. Display delivery schedule
     Show current window highlighted
     Show lock icon (unlocked by default)
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Create window | delivery_window | WRITE (new window) |
| Load locked wines | delivery_window_wines | READ (if locked) |
| Read wines | wines | READ |
| Load windows | delivery_window | READ |

---

### **Validation Rules:**

- Wine must have quantity_in_storage > 0
- Drinking window: start ≤ current_year ≤ end
- Tier spacing: Enforce per-tier limits per calendar year
- Capacity: Can modify window distribution based on storage total

---

### **Flags Set:**

- `deliveryScheduleInvalidated = FALSE` (schedule is now current)

---

### **Notes:**

- Schedule is calculated on-the-fly; NOT persisted in database
- Manual edits for locked windows are loaded from delivery_window_wines
- Unlocked windows always regenerate fresh
- If app restarts, schedule is recalculated on next page load

---

---

## **Workflow 5: Lock Current Delivery Window**

**Purpose:** Lock the current delivery window to prevent algorithm from regenerating it.

**Triggers:**
- User clicks lock icon on current delivery window card

**Input:**
```json
{
  delivery_window_id: "uuid-xxx"
}
```

**Output:** Window marked as locked; lock icon updates in UI

---

### **Logic Flow:**

```
USER CLICKS LOCK ICON:
  1. Retrieve current window:
     window = SELECT * FROM delivery_window
             WHERE id = delivery_window_id
  
  2. Validate window is current:
     current_check = SELECT * FROM delivery_window
                    WHERE status != 'completed'
                    ORDER BY scheduled_date ASC
                    LIMIT 1
     
     IF window.id != current_check.id:
       REJECT with error: "Can only lock the current delivery window"
  
  3. IF validation passes:
     
     UPDATE delivery_window SET
       locked = TRUE,
       updated_at = NOW
     WHERE id = delivery_window_id
     
     Copy current in-memory window contents to database:
     FOR each wine in deliverySchedule (current window only):
       INSERT delivery_window_wines (
         id = UUID,
         delivery_window_id = delivery_window_id,
         wine_id = wine.wine_id,
         quantity = wine.quantity,
         status = 'pending',
         created_at = NOW,
         updated_at = NOW
       )
  
  4. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'lock_delivery_window',
       delivery_window_id = delivery_window_id,
       details = JSON {
         window_date: window.scheduled_date,
         wines_locked: [list of wine ids and quantities]
       },
       created_at = NOW
     )
  
  5. Update in-memory state:
     deliverySchedule.current_window.locked = TRUE
  
  6. Update UI:
     Change lock icon to show LOCKED state (filled, visual indicator)
  
  7. NO SUCCESS MESSAGE (just visual feedback via icon)
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update window | delivery_window | WRITE |
| Insert window wines | delivery_window_wines | WRITE |
| Log action | audit_log | WRITE |

---

### **Validation Rules:**

- Can only lock the current (first non-completed) delivery window
- Window must exist and have scheduled_date in future

---

### **Flags Set:**

- None (in-memory schedule already has this window)

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Not current window | "Can only lock the current delivery window" |
| Window not found | "Delivery window not found" |

---

---

## **Workflow 5B: Unlock Current Delivery Window**

**Purpose:** Revert a locked delivery window back to algorithm-generated state.

**Triggers:**
- User clicks lock icon on a locked current delivery window
- Confirmation dialog appears

**Input:**
```json
{
  delivery_window_id: "uuid-xxx"
}
```

**Output:** Window marked as unlocked; manually-edited wines deleted; lock icon updates

---

### **Logic Flow:**

```
USER CLICKS LOCK ICON (on locked window):
  1. Show confirmation dialog:
     "Unlock this delivery window? Manual edits will be lost and the schedule will regenerate."
     [Cancel] [Unlock]
  
  2. IF user clicks "Cancel":
     Close dialog, do nothing
  
  3. IF user clicks "Unlock":
     
     window = SELECT * FROM delivery_window WHERE id = delivery_window_id
     
     4. Delete manual edits from database:
        DELETE FROM delivery_window_wines
        WHERE delivery_window_id = delivery_window_id
     
     5. Mark window as unlocked:
        UPDATE delivery_window SET
          locked = FALSE,
          updated_at = NOW
        WHERE id = delivery_window_id
     
     6. Regenerate window from algorithm:
        regenerate_delivery_schedule()
        (Re-run schedule generation algorithm; new window wines override old)
     
     7. Log audit trail:
        INSERT audit_log (
          id = UUID,
          action = 'unlock_delivery_window',
          delivery_window_id = delivery_window_id,
          details = JSON {
            window_date: window.scheduled_date,
            manual_edits_deleted: TRUE,
            regenerated: TRUE
          },
          created_at = NOW
        )
     
     8. Update in-memory state:
        deliverySchedule.current_window.locked = FALSE
        deliverySchedule.current_window.wines = [regenerated wines]
     
     9. Update UI:
        Change lock icon to show UNLOCKED state
        Refresh delivery schedule display
     
     10. Display: "Window unlocked and regenerated"
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Delete window wines | delivery_window_wines | DELETE |
| Update window | delivery_window | WRITE |
| Log action | audit_log | WRITE |

---

### **Validation Rules:**

- Window must be currently locked
- Must be current (first non-completed) window

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE` (schedule regenerated)

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Already unlocked | "Window is already unlocked" |
| Not current window | "Can only unlock the current delivery window" |

---

---

## **Workflow 6: Promote Wine to Current Delivery Window**

**Purpose:** Manually add a wine to the current delivery window and lock it.

**Triggers:**
- User clicks "Add to Delivery" on a wine in wine listing or detail page
- Dialog opens with quantity selection

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity: 12
}
```

**Output:** Wine added to current delivery window; window locked

---

### **Logic Flow:**

```
USER CLICKS "ADD TO DELIVERY":
  1. Retrieve wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  2. Get current delivery window:
     current_window = SELECT * FROM delivery_window
                     WHERE status != 'completed'
                     ORDER BY scheduled_date ASC
                     LIMIT 1
     
     IF no current window exists:
       REJECT with error: "No active delivery window"
  
  3. Check wine is available in storage:
     IF wine.quantity_in_storage == 0:
       REJECT with error: "No bottles in storage"
  
  4. Open dialog with:
     - Quantity: [input, min=1, max=wine.quantity_in_storage]
  
  5. User enters quantity and clicks "Add":
     quantity = input.quantity
  
  6. Validate:
     
     IF quantity <= 0:
       REJECT with error: "Quantity must be > 0"
     
     IF quantity > wine.quantity_in_storage:
       REJECT with error: "Cannot add more than available in storage ({wine.quantity_in_storage})"
     
     Check home capacity:
       This wine will eventually move from storage to home
       If adding this wine's quantity would exceed max_home_capacity:
         REJECT with error: "Adding {quantity} bottles would exceed home capacity
                             when delivered. Current: {at_home}, Adding: {quantity}, Max: {max}"
  
  7. IF validation passes:
     
     a) Lock current window (if not already locked):
        IF current_window.locked == FALSE:
          UPDATE delivery_window SET locked = TRUE WHERE id = current_window.id
          
          Copy all current in-memory window contents to DB:
          FOR each wine in deliverySchedule[current]:
            INSERT delivery_window_wines (...)
     
     b) Add wine to current window:
        Check if wine already exists in this window:
        existing = SELECT * FROM delivery_window_wines
                  WHERE delivery_window_id = current_window.id
                  AND wine_id = wine_id
        
        IF existing:
          UPDATE delivery_window_wines SET
            quantity = quantity,
            updated_at = NOW
          WHERE delivery_window_id = current_window.id
          AND wine_id = wine_id
        ELSE:
          INSERT delivery_window_wines (
            id = UUID,
            delivery_window_id = current_window.id,
            wine_id = wine_id,
            quantity = quantity,
            status = 'pending',
            created_at = NOW,
            updated_at = NOW
          )
     
     c) Update in-memory schedule:
        deliverySchedule[current].wines.push({
          wine_id: wine_id,
          quantity: quantity,
          status: 'pending'
        })
        (Or update if already exists)
     
     d) Update in-memory lock state:
        deliverySchedule[current].locked = TRUE
  
  8. Log audit trail:
     INSERT audit_log (
       id = UUID,
       action = 'promote_wine_to_delivery',
       wine_id = wine_id,
       delivery_window_id = current_window.id,
       details = JSON {
         quantity_promoted: quantity,
         window_locked: TRUE or already_locked
       },
       created_at = NOW
     )
  
  9. Close dialog and refresh page
  10. Display: "Wine added to current delivery window. Window is now locked."
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update window | delivery_window | WRITE (lock) |
| Insert/Update window wines | delivery_window_wines | WRITE |
| Log action | audit_log | WRITE |
| Read config | cellar_config | READ (capacity check) |

---

### **Validation Rules:**

- **Quantity:** > 0, ≤ quantity_in_storage
- **Home Capacity:** Wine's quantity must not exceed available home capacity (when delivered)
- **Wine Available:** quantity_in_storage > 0

---

### **Flags Set:**

- None (in-memory schedule already updated)

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| No storage | "No bottles in storage" |
| Quantity ≤ 0 | "Quantity must be positive" |
| Quantity > storage | "Cannot add more than available ({available})" |
| No current window | "No active delivery window" |
| Home capacity | "Would exceed home capacity when delivered" |

---

### **UI Availability:**

- Main wine listing page: "Add to Delivery" button per wine
- Wine detail page: "Add to Delivery" button
- Button visible/enabled only if quantity_in_storage > 0

---

---

## **Workflow 7: Delay Wine from Current Delivery Window**

**Purpose:** Manually remove a wine from the current delivery window.

**Triggers:**
- User clicks "Remove from Delivery" on a wine in current window
- Confirmation dialog appears

**Input:**
```json
{
  delivery_window_id: "uuid-xxx",
  wine_id: "uuid-xxx"
}
```

**Output:** Wine removed from current delivery window

---

### **Logic Flow:**

```
USER CLICKS "REMOVE FROM DELIVERY":
  1. Show confirmation dialog:
     "Remove {wine_name} from this delivery window? This will regenerate the schedule for remaining windows."
     [Cancel] [Remove]
  
  2. IF user clicks "Cancel":
     Close dialog, do nothing
  
  3. IF user clicks "Remove":
     
     window = SELECT * FROM delivery_window WHERE id = delivery_window_id
     
     4. Check if window is locked:
        IF window.locked == TRUE:
          
          a) Delete from database:
             DELETE FROM delivery_window_wines
             WHERE delivery_window_id = delivery_window_id
             AND wine_id = wine_id
          
          b) Remove from in-memory schedule:
             deliverySchedule[current].wines = filter_out(wine_id)
        
        ELSE:
          
          c) Just remove from in-memory schedule:
             deliverySchedule[current].wines = filter_out(wine_id)
             (No DB operation since unlocked windows don't persist)
     
     5. Regenerate remaining windows:
        regenerate_delivery_schedule()
        (Re-run algorithm for windows after current)
     
     6. Log audit trail:
        INSERT audit_log (
          id = UUID,
          action = 'delay_wine_from_delivery',
          wine_id = wine_id,
          delivery_window_id = delivery_window_id,
          details = JSON {
            window_locked: window.locked,
            regenerated: TRUE
          },
          created_at = NOW
        )
     
     7. Update invalidation flag:
        deliveryScheduleInvalidated = TRUE
        (Remaining windows regenerated)
     
     8. Refresh delivery schedule display
     9. Display: "Wine removed from current delivery. Schedule regenerated."
```

---

### **Database Operations:**

| Operation | Table | Type | Condition |
|-----------|-------|------|-----------|
| Delete wine from window | delivery_window_wines | DELETE | If window is locked |
| Log action | audit_log | WRITE | Always |

---

### **Validation Rules:**

- Wine must be in current delivery window
- Window must be current (first non-completed)

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE` (remaining windows regenerated)

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Wine not in window | "Wine is not in current delivery window" |
| No current window | "No active delivery window" |

---

### **UI Availability:**

- Only displayed on current delivery window's wine list
- "Remove from Delivery" button/menu item for each wine in window

---

---

## **Workflow 8: Mark Delivery as Complete**

**Purpose:** Mark current delivery as complete; move wines from storage to home.

**Triggers:**
- User clicks "Complete Delivery" or "Deliver Now" button
- Confirmation dialog appears

**Input:**
```json
{
  delivery_window_id: "uuid-xxx"
}
```

**Output:** Wines moved to home; consumption schedule generated; window marked completed

---

### **Logic Flow:**

```
USER CLICKS "COMPLETE DELIVERY":
  1. Get current delivery window:
     window = SELECT * FROM delivery_window
             WHERE status != 'completed'
             ORDER BY scheduled_date ASC
             LIMIT 1
  
  2. Retrieve wines to deliver:
     IF window.locked == TRUE:
       wines_to_deliver = SELECT * FROM delivery_window_wines
                         WHERE delivery_window_id = window.id
     ELSE:
       wines_to_deliver = [in-memory current window wines from deliverySchedule]
  
  3. Show confirmation dialog:
     "Complete delivery of {wine_count} wines to home?
      Total bottles: {total_quantity}
      Delivery date: {window.scheduled_date}"
     [Cancel] [Complete Delivery]
  
  4. IF user clicks "Cancel":
     Close dialog, do nothing
  
  5. IF user clicks "Complete Delivery":
     
     a) FINAL CAPACITY CHECK:
        total_quantity_to_deliver = SUM(quantity) FROM wines_to_deliver
        current_home_total = SUM(quantity_at_home) FROM wines
        new_home_total = current_home_total + total_quantity_to_deliver
        
        IF new_home_total > cellar_config.max_home_capacity:
          available_space = max_home_capacity - current_home_total
          REJECT with error: "Delivery would exceed home capacity.
                             Current: {current_home_total},
                             To deliver: {total_quantity_to_deliver},
                             Max: {max_home_capacity},
                             Available: {available_space}"
          STOP HERE
     
     b) FOR each wine_to_deliver:
        
        wine = SELECT * FROM wines WHERE id = wine_to_deliver.wine_id
        quantity = wine_to_deliver.quantity
        
        i. Update wine inventory:
           UPDATE wines SET
             quantity_in_storage = quantity_in_storage - quantity,
             quantity_at_home = quantity_at_home + quantity,
             updated_at = NOW
           WHERE id = wine_to_deliver.wine_id
        
        ii. Log delivery completion:
           INSERT delivery_completion_log (
             id = UUID,
             wine_id = wine_to_deliver.wine_id,
             delivery_window_id = window.id,
             quantity_delivered = quantity,
             delivered_date = TODAY,
             status = 'completed',
             created_at = NOW
           )
        
        iii. Update window wine status:
            IF window.locked == TRUE:
              UPDATE delivery_window_wines SET
                status = 'delivered',
                updated_at = NOW
              WHERE delivery_window_id = window.id
              AND wine_id = wine_to_deliver.wine_id
     
     c) Mark delivery window as completed:
        UPDATE delivery_window SET
          status = 'completed',
          updated_at = NOW
        WHERE id = window.id
     
     d) Update wineStore:
        FOR each delivered wine:
          wineStore.wines[wine_id].quantity_in_storage -= quantity
          wineStore.wines[wine_id].quantity_at_home += quantity
     
     e) Generate consumption schedule:
        regenerate_consumption_schedule()
        (New wines are now at home; eligible for consumption planning)
     
     f) Log audit trail:
        INSERT audit_log (
          id = UUID,
          action = 'mark_delivery_complete',
          delivery_window_id = window.id,
          details = JSON {
            wines_delivered: [list of wine ids and quantities],
            total_quantity: sum,
            delivered_date: TODAY
          },
          created_at = NOW
        )
     
     g) Set invalidation flags:
        deliveryScheduleInvalidated = TRUE
          (Current window is now complete; next window becomes current)
        consumptionScheduleInvalidated = TRUE
          (New wines available at home for consumption)
     
     h) Close dialog and refresh page
     i. Display: "Delivery complete! {count} wines moved to home."
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wines | wines | WRITE (multiple rows) |
| Insert log | delivery_completion_log | WRITE |
| Update window | delivery_window | WRITE |
| Update window wines | delivery_window_wines | WRITE (status) |
| Log action | audit_log | WRITE |
| Read config | cellar_config | READ (capacity check) |

---

### **Validation Rules:**

- **Capacity Check:** new_home_total ≤ max_home_capacity (FINAL CHECK)
- **Window Status:** Must be current (status != 'completed')
- **Wines Exist:** Window must have wines to deliver

---

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE`
- `consumptionScheduleInvalidated = TRUE`

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Capacity exceeded | "Delivery would exceed home capacity. Current: {X}, Adding: {Y}, Max: {Z}, Available: {A}" |
| No current window | "No active delivery window" |
| No wines in window | "No wines in current delivery window" |

---

---

## **Workflow 9: Generate Consumption Schedule**

**Purpose:** Algorithm determines which wines (from home) should be consumed across the entire inventory, respecting drinking windows and delivery dates.

**Triggers:**
- App startup (if flag is not set)
- User navigates to Drinking Schedule page (if `consumptionScheduleInvalidated = TRUE`)
- Wine loaded/updated/delivered (schedule regeneration needed)

**Input:** None (reads from database and current config)

**Output:** Array of consumption schedule entries in-memory (consumptionSchedule)

---

### **Logic Flow:**

```
LOAD PRECONDITIONS:
  1. Get cellar_config: annual_consumption_target (e.g., 30 wines/year)
  2. Get all wines from wines table
  3. Get all home wines: WHERE quantity_at_home > 0
  4. Get delivery_completion_log: to determine earliest available date for each wine
  5. Get consumption_log: to exclude already-consumed wines

INITIALIZE:
  current_date = TODAY
  annual_target = cellar_config.annual_consumption_target
  monthly_target = annual_target / 12
  consumption_plan = [] (in-memory array)
  month_index = 0

WHILE wines remain to be scheduled:
  
  month_name = current_date + (month_index months)
  target_for_month = monthly_target
  selected_wines = []
  
  1. IDENTIFY CANDIDATE WINES:
     
     FOR each wine in wines WHERE quantity_at_home > 0:
       
       Drinking window check:
         IF drinking_window_start > YEAR(month_name):
           SKIP (wine not yet mature enough)
         
         IF drinking_window_end < YEAR(month_name):
           SKIP (wine is past optimal drinking)
       
       Availability check:
         earliest_available = MIN(delivered_date) FROM delivery_completion_log
                            WHERE wine_id = wine.id
         
         IF earliest_available > month_name:
           SKIP (wine not yet delivered by this month)
       
       Already consumed check:
         consumed_count = COUNT(*) FROM consumption_log
                        WHERE wine_id = wine.id
         
         IF consumed_count >= wine.quantity_at_home:
           SKIP (all bottles already logged as consumed)
       
       Add to candidates: wine_id, tier, region, drinking_window
  
  2. RUN SELECTION ALGORITHM:
     
     a) TIER DISTRIBUTION (80/20 rule):
        - Tier 1-3 should comprise ~80% of monthly consumption
        - Tier 4-5 should comprise ~20% of monthly consumption
        - Select wines from Tier 1-3 first until quota reached
        - Backfill with Tier 4-5 if needed
     
     b) TIER-SPECIFIC SPACING:
        - Tier 1-2: Can appear up to 2x per calendar year
        - Tier 3: Can appear up to 1.5x per calendar year
        - Tier 4: Can appear at most 1x per calendar year
        - Tier 5: Can appear at most 0.5x per calendar year (every 2 years)
        
        Check each candidate:
          appearances_this_year = COUNT(wine_id in consumption_plan)
                                WHERE YEAR = YEAR(month_name)
          
          max_allowed = [2, 2, 1.5, 1, 0.5][tier - 1]
          
          IF appearances_this_year >= max_allowed:
            SKIP (tier quota reached for this year)
     
     c) REGION DIVERSITY:
        - Prefer wines from different regions
        - Weight: First wine from a region scores +1, subsequent wines from same region score -0.5
        - Select highest-scoring wines
     
     d) PRODUCER DIVERSITY:
        - Similar to region: prefer different producers
     
     e) RANDOM TIE-BREAKER:
        - If multiple wines have same score, randomly select one
     
     selected_wines = select_wines(candidates, target_for_month, tier_rules, region_rules, producer_rules)
  
  3. POPULATE CONSUMPTION PLAN:
     
     FOR each selected wine:
       INSERT consumption_plan entry:
         - wine_id = selected_wine.id
         - planned_consumption_month = month_name (format: YYYY-MM)
         - quantity = 1 (one bottle per entry)
         - status = 'planned'
  
  4. VARIANCE TRACKING:
     
     IF |selected_wines.count - target_for_month| > variance_threshold (e.g., ±1 bottle):
       Log variance for this month (informational)
  
  month_index += 1

FINALIZE:
  consumptionSchedule = consumption_plan (in-memory)
  flagged = FALSE (schedule is now current)

RETURN: consumptionSchedule array, ready to display on Drinking Schedule page
```

---

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Get wines | wines | READ |
| Get delivery log | delivery_completion_log | READ |
| Get consumption log | consumption_log | READ |
| Get config | cellar_config | READ |

---

### **Validation Rules:**

- Wine must have quantity_at_home > 0
- Drinking window: start ≤ current_year ≤ end
- Availability: Wine must be delivered by planned month
- Tier spacing: Enforce per-tier limits per calendar year
- Region diversity: Encourage different regions month-to-month
- Producer diversity: Encourage different producers month-to-month

---

### **Flags Set:**

- `consumptionScheduleInvalidated = FALSE` (schedule is now current)

---

### **Invalidation Triggers:**

This workflow is triggered when:
- User loads wine collection and `consumptionScheduleInvalidated = TRUE`
- User navigates to Drinking Schedule page and flag is set
- A wine is marked as consumed (consumption_log entry added)
- A delivery is completed (wine becomes available for consumption)
- Wine properties are updated (drinking window changed)
- Cellar config is updated (annual_consumption_target changed)

---

### **Notes:**

- Schedule is calculated on-the-fly; NOT persisted in database
- If app restarts, schedule is recalculated fresh on next page load
- Tier spacing rules are enforced per calendar year (resets Jan 1)
- Region and producer diversity are soft constraints (lower weight than tier spacing)
- If too few candidates remain to meet monthly target, algorithm selects best available (no error)
- Wines already in consumption_log are excluded automatically
- Loop continues until all wine inventory is scheduled (no fixed 3-year cutoff)

---

---

## **Workflow 10: Record Wine Consumption**

**Purpose:** User marks a wine as consumed, logging the date and optional notes. Update wine inventory accordingly.

**Triggers:**
- User clicks "Mark as Consumed" on a wine (from collection page or detail view)
- User clicks "Record Consumption" on Drinking Schedule page entry
- User manually enters consumption date in consumption modal

**Input:**
```json
{
  wine_id: "uuid-xxx",
  consumed_date: "2026-04-04",           // ISO date (DEFAULTS TO TODAY)
  notes: "string (optional)"             // Tasting notes or occasion
}
```

**Output:** Updated wine object and consumption log entry

---

### **Logic Flow:**

```
USER CLICKS "RECORD CONSUMPTION":
  1. Retrieve wine from wineStore:
     wine = wineStore.wines.find(w => w.id === wine_id)
  
  2. Open modal with:
     - Consumption date: [date picker, DEFAULT=TODAY]
     - Notes: [optional text field]
     - Quantity: [number, default 1, max=quantity_at_home]
  
  3. Validate consumption is possible:
     
     IF wine.quantity_at_home < 1:
       REJECT with error: "Cannot consume. No bottles at home."
       Stop here.
     
     IF wine is not yet available:
       (This should not happen; wines can only be at home if delivered)
       REJECT with error: "Wine not yet available at home."
  
  4. Validate consumption date:
     
     earliest_available = MIN(delivered_date) FROM delivery_completion_log
                        WHERE wine_id = wine.id
     
     IF consumed_date < earliest_available:
       REJECT with error: "Cannot consume wine before delivery date ({earliest_available})."
     
     IF consumed_date > TODAY:
       REJECT with error: "Cannot consume wine in the future."
  
  5. IF all validation passes:
     
     INSERT consumption_log:
       - id = UUID
       - wine_id = wine_id
       - consumed_date = consumed_date (defaults to TODAY)
       - notes = notes (if provided)
       - created_at = NOW
     
     UPDATE wines table:
       UPDATE wines SET
         quantity_at_home = quantity_at_home - 1,
         updated_at = NOW
       WHERE id = wine_id
     
     Log audit trail:
       INSERT audit_log (
         id = UUID,
         action = 'consume_wine',
         wine_id = wine_id,
         details = JSON {
           consumed_date: consumed_date,
           notes: notes,
           old_quantity_at_home: wine.quantity_at_home,
           new_quantity_at_home: wine.quantity_at_home - 1
         },
         user_id = current_user (if available),
         created_at = NOW
       )
     
     Update wineStore:
       wineStore.wines[wine_id].quantity_at_home -= 1
     
     Set invalidation flag:
       consumptionScheduleInvalidated = TRUE
       (Wine inventory changed, schedule needs regeneration on next access)
     
     Display success message: "Wine consumed ({consumed_date})"
     Close modal
```

---

### **Database Operations:**

| Operation | Table | Type | Condition |
|-----------|-------|------|-----------|
| Insert log entry | consumption_log | WRITE | If validation passes |
| Update wine | wines | WRITE | If validation passes |
| Log action | audit_log | WRITE | Always |
| Read delivery log | delivery_completion_log | READ (for availability date) |

---

### **Validation Rules:**

- **Consumed date:** Must be ≤ TODAY and ≥ wine's delivery date
- **Wine location:** Must be at home (quantity_at_home > 0)
- **Default date:** TODAY (user can edit)
- **Already consumed:** Allow re-recording same wine multiple times

---

### **Flags Set:**

- `consumptionScheduleInvalidated = TRUE`

---

### **Error Handling:**

| Error | Message |
|-------|---------|
| Not at home | "Cannot consume. No bottles at home." |
| Date in future | "Consumption date cannot be in the future." |
| Date before delivery | "Cannot consume before wine was delivered ({date})." |
| Wine not available | "This wine is not yet at home." |

---

### **Notes:**

- Consumption is tracked per bottle, with one log entry per consumed bottle
- Consumption date defaults to TODAY but can be edited (e.g., retroactive logging)
- Optional notes allow capturing tasting impressions, occasion, etc.
- Audit log tracks consumption for history/export

---

---

# PART 3: WORKFLOW INTERACTION SUMMARY

## **Which Workflows Affect Which Tables:**

| Workflow | wines | cellar_config | consumption_log | delivery_window | delivery_window_wines | delivery_completion_log | audit_log |
|----------|-------|---------------|-----------------|-----------------|----------------------|------------------------|-----------|
| 1. Load Collection | ✓ INSERT | | | | | | ✓ |
| 2A. Edit Details | ✓ UPDATE | | | | | | ✓ |
| 2B. Add Bottles | ✓ UPDATE | ✓ READ | | | | | ✓ |
| 2C. Consume | ✓ UPDATE | | ✓ INSERT | | | ✓ READ | ✓ |
| 2D. Move to Home | ✓ UPDATE | ✓ READ | | | | | ✓ |
| 3. Update Config | | ✓ UPDATE | | | | | ✓ |
| 4. Generate Delivery | ✓ READ | ✓ READ | | ✓ INSERT/READ | ✓ READ | | |
| 5. Lock Window | | | | ✓ UPDATE | ✓ INSERT | | ✓ |
| 5B. Unlock Window | | | | ✓ UPDATE | ✓ DELETE | | ✓ |
| 6. Promote Wine | ✓ READ | ✓ READ | | ✓ UPDATE | ✓ INSERT/UPDATE | | ✓ |
| 7. Delay Wine | | | | ✓ READ | ✓ DELETE (if locked) | | ✓ |
| 8. Mark Complete | ✓ UPDATE | ✓ READ | | ✓ UPDATE | ✓ UPDATE | ✓ INSERT | ✓ |
| 9. Generate Consumption | ✓ READ | ✓ READ | ✓ READ | | | ✓ READ | |
| 10. Record Consumption | ✓ UPDATE | | ✓ INSERT | | | ✓ READ | ✓ |

---

## **Which Workflows Set Invalidation Flags:**

| Workflow | deliveryScheduleInvalidated | consumptionScheduleInvalidated |
|----------|-----|-----|
| 1. Load Collection | ✓ | ✓ |
| 2A. Edit Details | ✓ (if drinking_window changed) | ✓ (if drinking_window changed) |
| 2B. Add Bottles | ✓ | ✓ |
| 2C. Consume | | ✓ |
| 2D. Move to Home | ✓ | ✓ |
| 3. Update Config | | ✓ (if annual_consumption_target changed) |
| 4. Generate Delivery | | |
| 5. Lock Window | | |
| 5B. Unlock Window | ✓ | |
| 6. Promote Wine | | |
| 7. Delay Wine | ✓ | |
| 8. Mark Complete | ✓ | ✓ |
| 9. Generate Consumption | | |
| 10. Record Consumption | | ✓ |

---

## **UI Element Availability:**

### **Main Wine Listing Page:**
- Edit (all wines)
- Add Bottles (all wines)
- Consume (only if quantity_at_home > 0)
- Move to Home (only if quantity_in_storage > 0)
- Add to Delivery (only if quantity_in_storage > 0)

### **Wine Detail Page:**
- Edit (all fields)
- Add Bottles
- Consume (only if quantity_at_home > 0)
- Move to Home (only if quantity_in_storage > 0)
- Add to Delivery (only if quantity_in_storage > 0)

### **Delivery Schedule Page:**
- Lock/Unlock icon on current window
- Remove from Delivery button for each wine in current window
- Complete Delivery button
- Add to Delivery for wines not yet in window

### **Drinking Schedule Page:**
- View consumption schedule (read-only display)
- Record Consumption button for each wine at home

### **Settings Page:**
- Update max_home_capacity
- Update annual_consumption_target
