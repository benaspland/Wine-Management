# Wine Management App - Implementation Plan

## Current Project Phase
Implementing user control over delivery schedules via delay/modification mechanics

---

## Feature: Wine Delay from Current Delivery

### User Story
As a user, I want to remove wines from the recommended next delivery and have them automatically rescheduled to a suitable future delivery slot.

### Mechanics
1. **Delay button** on each wine in the next scheduled delivery
2. Clicking removes wine from current delivery (no auto-replacement)
3. Wine marked as "delayed" (excluded from next delivery only)
4. **Future deliveries regenerated** (current delivery unchanged) to reschedule delayed wine
5. Delayed wine allocated via standard algorithm (respects drinking windows, diversity, capacity)
6. Delay marks **cleared when current delivery marked as "Delivered"**

### Implementation Approach

#### Data Model
- New table `delivery_delays`:
  - `id` (PK)
  - `wine_id` (FK to wines)
  - `delivery_date` (which delivery is "current" - e.g., "2026-03-15")
  - `created_at` (timestamp)

#### Key Functions
1. `handleDelayWine(wineId, currentDeliveryDate)`
   - Mark wine as delayed
   - Remove from current delivery group
   - Trigger future delivery regeneration

2. `regenerateFutureDeliveries(allWines, delayedWineIds, currentDeliveryDate)`
   - Regenerate only deliveries AFTER current one
   - Use standard algorithm for delayed wines
   - Exclude delayed wines from current delivery

3. `clearDelayMarks(currentDeliveryDate)`
   - Called when current delivery marked as "Delivered"
   - Clears all delay records for that delivery

#### UI Changes
- Add "Delay" button next to wine entries in next delivery
- Clicking removes wine from group and shows notification

#### Algorithm Integration
- Delayed wines excluded from current delivery only
- Standard algorithm handles future placement (no forcing)
- Respects drinking windows, diversity, and capacity

---

## 🚨 PENDING CHANGES - Must Address Before Completion

### 1. **Handle Delayed Delivery Windows**
**Status**: NOT YET IMPLEMENTED

When the upcoming delivery window is delayed/doesn't happen on schedule:
- Example: March delivery postponed to April, September becomes "next"
- Cannot skip September - need logic to reassign postponed delivery
- Prevent orphaned wines and scheduling gaps

**Questions to Resolve**:
- How to track that March delivery is now "in April"?
- Should we keep March slot reserved or release it?
- How to handle user interactions during transition?

---

## Recently Completed Features

### ✅ Phase 4 - Consumption-Aware Delivery Algorithm
- Calculates deliveries based on anticipated consumption

### ✅ Event-Based Schedule Regeneration
- Auto-regenerate on: CSV import, wine added, wine consumed

### ✅ Delivery Completion at Group Level
- "Mark Delivered" button moves entire delivery group to home

### ✅ Consumption Constraints
- "Mark as Consumed" only for wines at home

---

## Design Principles

1. **User agency**: Recommendations, not mandates
2. **Algorithm respects constraints**: Excluded from current, algorithm handles future
3. **State tracking**: Clear when actions complete
4. **Event-driven**: Changes trigger intelligent regenerations


---

## Feature: Promote Wine from Future Delivery to Current

### User Story
As a user, I want to move wines from future deliveries into the current delivery if I want them sooner, with safeguards against exceeding cellar capacity.

### Mechanics
1. **Promote button** visible on wines in FUTURE deliveries only (not current)
2. **Capacity check** before promotion:
   - Calculate: current_bottles_at_home + current_delivery_bottles + wine_quantity
   - If exceeds max_slots → show error dialog, don't promote
   - If OK → proceed with promotion
3. **After promotion**:
   - Wine moved to current delivery
   - Wine removed from original future delivery slot
   - All future deliveries (excluding current) regenerated to reschedule removed wine

### Implementation Approach

#### Capacity Check Function
```
canPromoteWineToCurrent(wineQuantity, currentBottlesAtHome, currentDeliveryBottles, maxCapacity)
  → boolean, or error message if exceeds
```

#### Key Functions
1. `handlePromoteWine(wineId, fromDeliveryDate, currentDeliveryDate)`
   - Verify capacity
   - Add to current delivery
   - Remove from future delivery
   - Trigger future delivery regeneration

2. `checkDeliveryCapacity(wineQuantity, currentBottles, deliveryBottles, capacity)`
   - Validates if wine can fit in current delivery
   - Returns: { canPromote: boolean, message: string, projectedTotal: number }

#### UI Changes
- Add "Promote" button on wines in future deliveries
- Shows only on deliveries AFTER current (earliest undelivered)
- Clicking shows confirmation dialog if near capacity
- Dialog displays: current home bottles, current delivery bottles, wine quantity, new total, max capacity

#### Algorithm Integration
- Promoted wines removed from original future slot
- Remaining wines in that slot stay (no auto-fill)
- Future deliveries regenerated to reschedule the removed wine

---

## 🚨 PENDING CHANGES - Must Address Before Completion

### 1. **Handle Delayed Delivery Windows**
**Status**: NOT YET IMPLEMENTED

When the upcoming delivery window is delayed/doesn't happen on schedule:
- Example: March delivery postponed to April, September becomes "next"
- Cannot skip September - need logic to reassign postponed delivery
- Prevent orphaned wines and scheduling gaps

### 2. **Track Delivery Fulfillment State**
When current delivery is delayed/not marked as complete, need to track:
- Which delivery is "current" (next upcoming)
- Which are pending vs. completed
- Handle transitions gracefully

---

## Recently Completed Features

### ✅ Wine Delay from Current Delivery
- Users can delay wines from next scheduled delivery
- Delayed wines excluded from current delivery only
- Rescheduled by algorithm to future deliveries
- Delay marks cleared when delivery completed

### ✅ Phase 4 - Consumption-Aware Delivery Algorithm
- Calculates deliveries based on anticipated consumption

### ✅ Event-Based Schedule Regeneration
- Auto-regenerate on: CSV import, wine added, wine consumed

### ✅ Delivery Completion at Group Level
- "Mark Delivered" button moves entire delivery group to home

### ✅ Consumption Constraints
- "Mark as Consumed" only for wines at home

---

## Design Principles

1. **User agency**: Recommendations, not mandates (can delay/promote)
2. **Capacity safety**: Never exceed cellar limits
3. **Algorithm respects constraints**: Excluded from current, algorithm handles future
4. **State tracking**: Clear when actions complete
5. **Event-driven**: Changes trigger intelligent regenerations
