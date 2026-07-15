# Wine Management - Detailed Workflows
## Wine Management Operations (Final)

---

## **2A. EDIT WINE DETAILS**

**Purpose:** Modify wine metadata (name, vintage, notes, ratings, drinking window) without affecting inventory.

**Triggers:**
- User clicks "Edit" on wine in main listing page
- User opens wine detail page and edits fields
- User updates notes/ratings from detail view

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
         (Wine eligibility for future delivery windows changed)
       consumptionScheduleInvalidated = TRUE
         (Wine eligibility for consumption months changed)
     ELSE:
       No flags set (metadata change doesn't affect schedules)
  
  7. Refresh wine listing page or detail page
  8. Display success message: "Wine details updated"
```

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |

### **Validation Rules:**

- **Vintage:** 4-digit year, >= 1800
- **Tier:** 1-5
- **Drinking Window:** start ≤ end
- **Alcohol Percent:** 0-20
- **Text fields:** Optional, but if provided must be non-empty

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE` (if drinking_window changed)
- `consumptionScheduleInvalidated = TRUE` (if drinking_window changed)
- No flags if only editing metadata (name, notes, ratings, etc.)

### **UI Availability:**

- Main wine listing page: "Edit" button/menu item per wine
- Wine detail page: Editable fields that trigger save on blur or explicit save button

---

---

## **2B. ADD BOTTLES**

**Purpose:** Increase wine quantity by adding more bottles to either storage or home inventory (subject to capacity).

**Triggers:**
- User clicks "Add Bottles" on wine in main listing page
- User clicks "Add Bottles" on wine detail page
- Dialog opens for quantity and destination selection

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity_to_add: 12,
  destination: "storage" or "home"
}
```

**Output:** Updated wine with new quantity; wine listing/detail page refreshes

### **Logic Flow:**

```
USER CLICKS "ADD BOTTLES":
  1. Open dialog/form with fields:
     - Quantity to add: [input number, min=1]
     - Destination: [radio buttons: Storage / Home]
     - Note: [optional text field]
  
  2. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  3. User fills form and clicks "Add":
     quantity = input.quantity_to_add
     destination = input.destination
     note = input.note (optional)
  
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
         new_quantity: (old + quantity),
         notes: note
       },
       created_at = NOW
     )
  
  7. Update wineStore:
     wineStore.wines[wine_id] = updated wine object
  
  8. Set invalidation flags:
     deliveryScheduleInvalidated = TRUE
       (Storage quantity increased → more wines available for scheduling)
     consumptionScheduleInvalidated = TRUE
       (Home quantity increased → more wines available for consumption)
  
  9. Close dialog
  10. Refresh wine listing/detail page
  11. Display success message: "Added {quantity} bottles to {destination}"
```

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |
| Read config | cellar_config | READ (for capacity check) |

### **Validation Rules:**

- **Quantity:** Must be > 0, integer
- **Destination:** Must be 'storage' or 'home'
- **Capacity Check (if home):** total_at_home + quantity ≤ max_home_capacity

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE` (inventory changed)
- `consumptionScheduleInvalidated = TRUE` (inventory changed)

### **Error Handling:**

| Error | Message |
|-------|---------|
| Quantity ≤ 0 | "Quantity must be a positive number" |
| Home capacity exceeded | "Adding {X} bottles exceeds capacity. Current: {Y}, Max: {Z}, Available: {A}" |

### **UI Availability:**

- Main wine listing page: "Add Bottles" button/menu item per wine
- Wine detail page: "Add Bottles" button/section

---

---

## **2C. CONSUME WINE**

**Purpose:** Mark bottles of wine as consumed, recording consumption date and optional notes.

**Triggers:**
- User clicks "Consume" on wine in main listing page
- User clicks "Log Consumption" on wine detail page
- Dialog opens for quantity, date, and notes

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity_consumed: 1,
  consumed_date: "2026-04-04",
  notes: "Dinner with friends"
}
```

**Output:** Wine quantity updated; consumption logged; wine listing/detail page refreshes

### **Logic Flow:**

```
USER CLICKS "CONSUME":
  1. Open dialog/form with fields:
     - Quantity to consume: [input number, min=1, max=wine.quantity_at_home]
     - Consumed date: [date picker, default TODAY]
     - Notes: [optional text field]
  
  2. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  3. User fills form and clicks "Log Consumption":
     quantity = input.quantity_consumed
     consumed_date = input.consumed_date (default: TODAY)
     notes = input.notes (optional)
  
  4. Validate:
     
     IF quantity <= 0:
       REJECT with error: "Quantity must be > 0"
     
     IF quantity > wine.quantity_at_home:
       REJECT with error: "Cannot consume more bottles than available at home.
                           Available: {wine.quantity_at_home}, Requested: {quantity}"
     
     IF consumed_date > TODAY:
       REJECT with error: "Cannot log consumption for future date"
  
  5. IF validation passes:
     
     FOR i in 1..quantity:
       INSERT INTO consumption_log (
         id = UUID,
         wine_id = wine_id,
         quantity = 1,
         consumed_date = consumed_date,
         notes = notes,
         created_at = NOW
       )
     
     UPDATE wines SET
       quantity_at_home = quantity_at_home - quantity,
       updated_at = NOW
     WHERE id = wine_id
  
  6. Log audit trail:
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
  
  7. Update wineStore:
     wineStore.wines[wine_id] = updated wine object
  
  8. Set invalidation flags:
     consumptionScheduleInvalidated = TRUE
       (Wine consumed → no longer available for consumption planning)
  
  9. Close dialog
  10. Refresh wine listing/detail page
  11. Display success message: "Logged {quantity} bottle(s) consumed on {consumed_date}"
```

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Insert consumption log | consumption_log | WRITE (1 row per bottle) |
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |

### **Validation Rules:**

- **Quantity:** > 0, integer, ≤ quantity_at_home
- **Consumed Date:** Must be ≤ TODAY (past or today, not future)
- **Notes:** Optional

### **Flags Set:**

- `consumptionScheduleInvalidated = TRUE` (wine no longer available for consumption)

### **Error Handling:**

| Error | Message |
|-------|---------|
| Quantity ≤ 0 | "Quantity must be positive" |
| Quantity > at home | "Cannot consume more than available ({available} at home)" |
| Future date | "Cannot log consumption for a future date" |

### **UI Availability:**

- Main wine listing page: "Consume" button/menu item (only if quantity_at_home > 0)
- Wine detail page: "Log Consumption" button/section (only if quantity_at_home > 0)

---

---

## **2D. MOVE TO HOME**

**Purpose:** Transfer bottles from storage to home inventory (subject to home capacity).

**Triggers:**
- User clicks "Move to Home" on wine in main listing page
- User clicks "Move to Home" on wine detail page
- Dialog opens for quantity selection

**Input:**
```json
{
  wine_id: "uuid-xxx",
  quantity_to_move: 6
}
```

**Output:** Wine quantities updated (storage decreased, home increased); wine listing/detail page refreshes

### **Logic Flow:**

```
USER CLICKS "MOVE TO HOME":
  1. Retrieve current wine:
     wine = SELECT * FROM wines WHERE id = wine_id
  
  2. Check if wine is in storage:
     IF wine.quantity_in_storage == 0:
       REJECT with error: "No bottles in storage to move"
  
  3. Open dialog/form with fields:
     - Quantity to move: [input number, min=1, max=wine.quantity_in_storage]
     - Note: [optional]
     - Default action: Move ALL available (show as suggestion)
  
  4. User selects quantity and clicks "Move":
     quantity = input.quantity_to_move (or default to quantity_in_storage)
     note = input.note (optional)
  
  5. Validate:
     
     IF quantity <= 0:
       REJECT with error: "Quantity must be > 0"
     
     IF quantity > wine.quantity_in_storage:
       REJECT with error: "Cannot move more than available in storage.
                           Available: {wine.quantity_in_storage}, Requested: {quantity}"
     
     Check home capacity:
       total_at_home = SUM(quantity_at_home) FROM wines WHERE id != wine_id
       other_at_home_for_wine = wine.quantity_at_home
       total_including_this = total_at_home + other_at_home_for_wine + quantity
       
       IF total_including_this > cellar_config.max_home_capacity:
         available_space = cellar_config.max_home_capacity - (total_at_home + other_at_home_for_wine)
         REJECT with error: "Insufficient home capacity.
                             Current home total: {total_at_home + other_at_home_for_wine},
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
       (Wine removed from storage → no longer available for delivery scheduling)
     consumptionScheduleInvalidated = TRUE
       (Wine now at home → available for consumption planning)
  
  10. Close dialog
  11. Refresh wine listing/detail page
  12. Display success message: "Moved {quantity} bottles to home"
```

### **Database Operations:**

| Operation | Table | Type |
|-----------|-------|------|
| Update wine | wines | WRITE |
| Log action | audit_log | WRITE |
| Read config | cellar_config | READ (for capacity check) |

### **Validation Rules:**

- **Quantity:** > 0, integer, ≤ quantity_in_storage
- **Home Capacity:** total_at_home + quantity ≤ max_home_capacity

### **Flags Set:**

- `deliveryScheduleInvalidated = TRUE` (storage inventory decreased)
- `consumptionScheduleInvalidated = TRUE` (home inventory increased)

### **Error Handling:**

| Error | Message |
|-------|---------|
| No storage bottles | "No bottles in storage to move" |
| Quantity ≤ 0 | "Quantity must be positive" |
| Quantity > in storage | "Cannot move more than available in storage ({available})" |
| Home capacity exceeded | "Moving {X} bottles exceeds home capacity. Current: {Y}, Max: {Z}, Available: {A}" |

### **UI Availability:**

- Main wine listing page: "Move to Home" button/menu item (only if quantity_in_storage > 0)
- Wine detail page: "Move to Home" button/section (only if quantity_in_storage > 0)

---

---

## **SUMMARY: WINE MANAGEMENT OPERATIONS**

These four workflows cover all wine inventory management:

| Workflow | Purpose | Affects Inventory | Delivery Schedule | Consumption Schedule |
|----------|---------|-------------------|-------------------|----------------------|
| **2A. Edit Details** | Change metadata | No | If drinking window changed | If drinking window changed |
| **2B. Add Bottles** | Increase quantity | Yes | Invalidated | Invalidated |
| **2C. Consume Wine** | Log consumption | Yes (decreases home) | No change | Invalidated |
| **2D. Move to Home** | Transfer to home | Yes | Invalidated | Invalidated |

All four operations:
- Are available on main wine listing page AND wine detail page
- Log audit trail for full traceability
- Set appropriate invalidation flags for schedule regeneration
- Include comprehensive validation to prevent invalid operations
- Display clear success/error messages to user
