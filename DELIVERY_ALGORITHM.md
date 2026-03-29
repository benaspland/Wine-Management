# Delivery Schedule Generation Algorithm

## Overview
Generate delivery schedule to move all wines from storage to home cellar, ensuring:
- All 617 wines eventually get scheduled
- Wines are consumed within their drinking windows
- Cellar capacity (80 bottles) is never exceeded
- Maximum 2 deliveries per calendar year (March and September)
- Variety and tier distribution maintained

## Key Constraints
- **Cellar capacity:** 80 bottles maximum at home
- **Annual consumption target:** 30 bottles/year
- **Minimum delivery size:** 24 bottles
- **Delivery months:** March (month 3) and September (month 9) only
- **Tier 4-5 constraint:** Cannot deliver before 2029
- **Max delivery frequency:** 2 per calendar year

## Algorithm Flow

### Step 1-2: Setup and Month Offset
- Identify first valid delivery slot (skip past months in current year)
- If current month is April, first delivery is September, not March
- Initialize projectedInventory to currentBottlesAtHome (usually 0)

### Step 3: Identify Unscheduled Wines
Create list of all wines in storage that have not yet been scheduled for delivery

### Step 4: Termination Check
If no unscheduled wines remain, algorithm is complete

### Step 5: Calculate Available Capacity
Current state:
- `projectedInventory` = bottles currently at home (includes all past deliveries minus consumption)
- Available capacity = cellarCapacity - projectedInventory
- If available capacity < 24 bottles, skip this slot (STEP 10)

Note: Do NOT double-subtract consumption. Consumption from previous period is already reflected in projectedInventory.

### Step 6: Capacity Validation
If available capacity < 24 bottles (minimum delivery):
- Skip this delivery slot (insufficient capacity)
- Go to STEP 10 (advance to next slot)

### Step 7: Build Delivery Batch with Wine Selection

#### Constraint Filtering
Remove wines that don't qualify:
1. Already scheduled
2. Tier 4-5 AND current year < 2029
3. Drinking window hasn't started (drinking_window_start > current year)

#### Priority Scoring (for remaining wines)
For each eligible wine, calculate total score:

**Window Urgency Score (PRIMARY FACTOR)**
```
urgency_score = 1000 / (drinking_window_end - current_year + 1)
```
- Wine ending in 1 year = ~1000 points
- Wine ending in 10 years = ~100 points

**Tier Distribution Score (SECONDARY FACTOR)**
```
percentage_remaining = unscheduled_wines_of_this_tier / total_wines_of_this_tier

tier_weight:
  Tier 1 = 200
  Tier 2 = 170
  Tier 3 = 140
  Tier 4 = 110
  Tier 5 = 80

tier_score = tier_weight × percentage_remaining
```

**Diversity Bonus (TERTIARY FACTOR)**
```
diversity_bonus = 0
if (wine.producer not in current_home_inventory):
  diversity_bonus += 50
if (wine.region not in current_home_inventory):
  diversity_bonus += 25
```

**Total Score**
```
total_score = (urgency_score × 100) + tier_score + diversity_bonus
```

#### Batch Selection
1. Sort eligible wines by total_score (highest first)
2. Add wines to batch in order until available capacity is reached
3. Deliver wines with their full quantity (or minimum threshold based on format)

### Step 8: Record Delivery
If batch meets minimum (24 bottles):
- For each wine in batch:
  - Create delivery schedule entry (wine_id, quantity, scheduled_date, status='pending')
  - Mark wine as scheduled
- Update: `projectedInventory += total_bottles_in_batch`

If batch < 24 bottles:
- Do NOT create delivery
- Wines remain unscheduled for next slot

### Step 9: Account for Consumption
Wines consume between this slot and next slot:
```
months_between_slots = 6 (March to September, or September to March)
consumption = (annual_consumption_target / 12) × months_between_slots
           = (30 / 12) × 6
           = 15 bottles

projectedInventory = projectedInventory - consumption
if projectedInventory < 0:
  projectedInventory = 0
```

### Step 10: Advance to Next Delivery Slot
- If current slot is March: next is September (same year)
- If current slot is September: next is March (next year)
- Return to STEP 3 for next iteration

### Loop Termination
Loop continues UNTIL:
- All wines are scheduled (unscheduledWineIds.size == total_wines), OR
- Safety limit exceeded (year > currentYear + 30 with no progress)

**DO NOT use arbitrary year limits like 2050.** Loop until all wines are scheduled.

## Example Trace

**Initial state:**
- Current date: March 2026
- Inventory at home: 0 bottles
- Wines to schedule: 617 bottles
- Capacity available: 80 bottles

**March 2026 - First Delivery:**
- Available capacity: 80 bottles
- Select wines using scoring system
- Deliver 80 bottles (full capacity)
- projectedInventory = 80
- Consumption March→September: 15 bottles
- projectedInventory = 65

**September 2026:**
- Projected at home: 65 bottles
- Available capacity: 80 - 65 = 15 bottles
- 15 < 24 minimum → SKIP

**March 2027:**
- Projected at home: 65 - 15 (Sept→March consumption) = 50 bottles
- Available capacity: 80 - 50 = 30 bottles
- Select and deliver wines up to 30 bottles
- projectedInventory = 80 (after delivery)
- Consumption March→September: 15 bottles
- projectedInventory = 65

**Pattern continues until all 617 bottles scheduled**

## Tier Distribution in Inventory
Based on your CSV data:
- Tier 1: ~4 wines (3%)
- Tier 2: ~10 wines (8%)
- Tier 3: ~50 wines (40%)
- Tier 4: ~50 wines (40%)
- Tier 5: ~6 wines (5%)

The scoring system ensures these proportions are respected across deliveries.

## Key Changes from Previous Algorithm
1. ✅ Removed arbitrary 75% delivery fill ratio - deliver at full capacity
2. ✅ Removed pre-calculated `yearsToSchedule` - loop until all wines scheduled
3. ✅ Removed separate continuation loop - single unified loop
4. ✅ Added sophisticated wine selection scoring with three priority levels
5. ✅ Tier distribution ensures all tiers get scheduled proportionally
6. ✅ Window closure urgency is PRIMARY factor (multiplied by 100)
7. ✅ No double-subtraction of consumption
