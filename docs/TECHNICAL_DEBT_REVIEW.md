# Technical Debt Review - Wine Management Application

**Date:** March 29, 2026
**Scope:** Comprehensive code review for technical debt and maintenance risks
**Priority:** Address HIGH risk items before adding features

---

## Executive Summary

The application has accumulated significant technical debt from incremental updates, particularly in:
- **State management** - scattered across store and components with duplication
- **Data access** - N+1 query problem, schema mismatches between modes
- **Business logic** - hardcoded values scattered throughout, derivation bugs risk

**Risk Level:** HIGH - Current issues could cause data loss or silent logical failures
**Effort to resolve:** 8-9.5 hours for critical items, 25 minutes for quick wins

---

## CRITICAL ISSUES (Must Fix Before Production)

### 1. Database Schema Mismatch & Missing Migration System
**Location:** `electron-main.ts` (lines 121-134), `database.ts` (lines 87-170)

**Problem:**
- Schema defined in TWO places with inconsistent fields
- `delivery_delays` and `delivery_pins` not initialized in memory database
- Electron version missing `min_delivery_bottles` field
- No migration system for schema changes

**Impact:** Data loss when switching modes, silent failures on schema updates

**Fix Approach:**
1. Single schema source (database.ts as canonical)
2. Initialize all tables in memory mode
3. Implement schema versioning
4. Add startup validation

**Effort:** 1.5 hours
**Risk if not done:** Critical data integrity issues

---

### 2. N+1 Query Problem in DrinkingSchedulePage
**Location:** `DrinkingSchedulePage.tsx` (lines 120-124)

**Problem:**
```javascript
for (const entry of drinkingSchedule) {
  const consumptionInfo = await db.isWineConsumedInPeriod(...)  // 1 query per wine!
}
```
- One database query per wine in schedule (100+ wines = 100+ queries)
- Blocks UI rendering
- Performance degrades linearly with wine count

**Impact:** UI freezes, poor user experience at scale

**Fix Approach:**
1. Create batch query: `getConsumptionStatusBatch(wineIds, year, month)`
2. Cache consumption log in memory
3. Add indexes on consumption_log(wine_id, consumed_date)

**Effort:** 1 hour
**Risk if not done:** Unusable UI with large collections

---

### 3. Inconsistent Filter Implementation
**Location:** `wineStore.ts` (lines 192-230), `wine.service.ts` (lines 6-42)

**Problem:**
- Filtering logic duplicated in store AND service
- Each filter change = 2 full data fetches + 2 filter passes
- Filters could diverge causing inconsistency
- `loadWines()` called unnecessarily on every filter change

**Impact:** Wasted bandwidth, inconsistent behavior, hard to maintain

**Fix Approach:**
1. Single filter implementation in store
2. Remove filters from WineService
3. Cache wines in store, only reload on mutations
4. `setLocationFilter()` calls `applyFilters()` only, no reload

**Effort:** 1-2 hours
**Risk if not done:** Filters diverge, mysterious UI bugs

---

### 4. Scattered Business Logic - Delivery Month Calculation
**Location:** `DeliverySchedulePage.tsx` (lines 135-160), `schedule.service.ts` (line 262), `DrinkingSchedulePage.tsx` (lines 335-348)

**Problem:**
- "Next delivery date" logic hardcoded in 3 separate places
- `[3, 9]` delivery months duplicated everywhere
- If one location updated, others silently break
- Delivery month config should be changeable

**Impact:** Silent logical bugs, inconsistent schedules, impossible to maintain

**Fix Approach:**
1. Create `DeliveryScheduleUtils.getNextDeliveryDate(currentDate, config)`
2. Create config constant for months: `[3, 9]`
3. Use throughout app
4. All references point to single source

**Effort:** 30 minutes
**Risk if not done:** Divergent schedules between pages

---

## MAJOR ISSUES (Should Fix Soon)

### 5. State Fragmentation - Delivery Schedule
**Location:** `DeliverySchedulePage.tsx` (lines 29-40)

**Problem:**
- `deliveriesByYear` only in component state
- `delayedWines` loaded 3 times (lines 104, 252, 343)
- No persistence across navigation
- Can't notify other components of changes
- Page re-generates entire schedule on every trigger

**Impact:** Hard to test, can't share state, unnecessary computation

**Fix Approach:**
Move to store:
```typescript
interface WineStore {
  deliveriesByYear: Record<number, DeliveryDate[]>
  delayedWines: Set<string>
  pinnedWines: Map<string, string> // wineId -> deliveryDate

  regenerateDeliverySchedule(): Promise<void>
  invalidateScheduleCache(): void
}
```

**Effort:** 2-3 hours
**Risk if not done:** Can't implement cross-page features

---

### 6. Incomplete Memory Database Implementation
**Location:** `database.ts` (lines 200-308)

**Problem:**
- Fake SQL parser only handles simple WHERE clauses
- Complex queries fail silently: `WHERE location = ? AND tier > ?` breaks
- `strftime()` and `getConsumptionLog()` with year param would fail
- No JOIN support
- UPDATE parsing is trivial

**Impact:** Complex queries work in SQLite but fail in memory mode

**Fix Approach:**
Option A (Best):
- Use actual SQL parser library
- Make memory mode a proper in-memory SQLite

Option B:
- Restrict API to documented queryable patterns
- Throw explicit errors for unsupported queries
- Document constraints

**Effort:** 1-2 hours (Option B) or 3-4 hours (Option A)
**Risk if not done:** Silent query failures, local dev/test bugs

---

### 7. Redundant Database Functions
**Location:** `database.ts` (lines 475-525)

**Problem:**
1. `updateCellarCapacity()` duplicates `updateCellarConfig()` - dead code
2. `delayWineFromDelivery()` and `pinWineToCurrentDelivery()` are copy-paste identical
3. `getDelayedWines()` and `getPinnedWines()` also identical pattern
4. Config ID inconsistency: uses both `'default'` and `1`

**Impact:** Maintenance burden, hidden duplication, bug propagation

**Fix Approach:**
1. Delete `updateCellarCapacity()`
2. Extract generic: `insertDeliveryMarker(table, wineId, deliveryDate)`
3. Extract generic: `getDeliveryMarkers(table, deliveryDate)`
4. Standardize config ID to `'default'`

**Effort:** 30 minutes
**Risk if not done:** Bugs fixed twice, duplicated

---

### 8. Over-Engineered Scheduling Algorithm
**Location:** `schedule.service.ts` (lines 258-452, 258 lines!)

**Problem:**
- Single function does 7 different things:
  - Filters candidates
  - Calculates planning horizon
  - Computes consumption projections
  - Rotates producers for diversity
  - Applies tier constraints
  - Validates minimums
  - Updates projected inventory
- Producer rotation logic (lines 388-414) is especially complex
- Impossible to test individual rules

**Impact:** Hard to debug, can't test logic independently, changes are risky

**Fix Approach:**
Break into:
```typescript
filterCandidateWines()
calculateCapacityAtDelivery()
selectWinesForDelivery()
validateDeliveryBatch()
class ProducerSelector { rotate(), select() }
```

**Effort:** 2-3 hours
**Risk if not done:** Bugs in scheduling rules are risky to fix

---

### 9. Implicit Consumption Status Through String Parsing
**Location:** `database.ts` (lines 411-431), `DrinkingSchedulePage.tsx` (lines 43-77)

**Problem:**
- Schedule period embedded in notes as string: `"Schedule: 2026-03"`
- Status retrieved by substring search (lines 425-427)
- If format changes, silently breaks
- Not queryable

**Impact:** Data loss if format changes, fragile state tracking

**Fix Approach:**
Add columns to `consumption_log`:
```sql
ALTER TABLE consumption_log ADD COLUMN schedule_year INTEGER
ALTER TABLE consumption_log ADD COLUMN schedule_month INTEGER
```
Query explicitly, keep notes separate.

**Effort:** 1 hour
**Risk if not done:** Format change breaks all historical data

---

## MEDIUM ISSUES (Nice to Have)

### 10. Magic Values Scattered Throughout
- `[3, 9]` (March, September) - 3 places
- `30` wines/year target - 4 places
- `24` bottle minimum - 2 places
- `80` default capacity - multiple places
- `2029` tier 4-5 cutoff - 1 place
- `0.75` delivery fill ratio - 1 place

**Fix:**
```typescript
const DELIVERY_CONFIG = {
  months: [3, 9],
  minBottles: 24,
  annualTarget: 30,
  capacityDefault: 80,
  tier45StartYear: 2029,
  tier45MinSpacingYears: 3,
  deliveryFillRatio: 0.75,
} as const
```

**Effort:** 20 minutes

---

### 11. Message Dialog Implemented 3 Times
- `DeliverySchedulePage.tsx` (lines 359-386)
- `DrinkingSchedulePage.tsx` (lines 182-210)
- `SettingsPage.tsx` (lines 174-202)

**Fix:** Extract `<MessageModal type={} text={} />` component

**Effort:** 15 minutes

---

### 12. Debug Logging in Production
- 15+ console.log() calls in schedule.service.ts
- Verbose output, potential data exposure
- Makes logs hard to read

**Fix:**
```typescript
if (isDev) console.log(...)
```

**Effort:** 10 minutes

---

## QUICK WINS (High Impact, Low Effort)

| Task | File | Effort | Impact |
|------|------|--------|--------|
| Remove debug logging | schedule.service.ts | 5 min | Cleaner logs |
| Extract message modal | DeliverySchedulePage, etc | 10 min | DRY, consistency |
| Fix import success bug | SettingsPage line 77 | 2 min | Fixes bug |
| Create DELIVERY_CONFIG | all | 5 min | Maintainability |
| Delete dead function | database.ts | 2 min | Clarity |
| **TOTAL** | | **24 min** | **5 wins** |

---

## REFACTORING ROADMAP

### Phase 1: Quick Wins (1 session, 30 min)
- [ ] Remove debug logging
- [ ] Extract message modal
- [ ] Fix import bug
- [ ] Create config constant
- [ ] Delete dead code

### Phase 2: Data Access (1-2 sessions, 2.5 hours)
- [ ] Fix schema mismatch (single source)
- [ ] Fix N+1 queries (batch loading)
- [ ] Standardize config ID
- [ ] Extract reusable functions

### Phase 3: State Management (1-2 sessions, 2-3 hours)
- [ ] Move delivery schedule to store
- [ ] Consolidate filter logic
- [ ] Add consumption schema columns

### Phase 4: Business Logic (1-2 sessions, 2.5 hours)
- [ ] Extract scheduling functions
- [ ] Create delivery schedule utils
- [ ] Fix logic duplication

**Total:** ~8-9.5 hours for critical items

---

## Risk Assessment

**If we don't address HIGH priority items:**
- Schema mismatch could cause data loss (mode switching)
- N+1 queries make app unusable with 100+ wines
- Logic duplication causes divergent schedules
- Filter bugs could lose wine data during export/import

**If we address HIGH priority items first:**
- Reliable data integrity
- Performance acceptable to 500+ wines
- Consistent behavior across app
- Foundation solid for Phase 5+ features

---

## Recommendations

1. **Before next feature:** Do Phase 1 (quick wins) - 30 min investment
2. **Before user testing:** Do Phase 2 & 3 - fixes critical issues
3. **Before scaling:** Do Phase 4 - prepares for complex features
4. **Consider:** Automated tests on scheduling logic (most critical code)

**Next immediate steps:**
1. Do quick wins (30 min)
2. Fix schema/N+1 queries (this week)
3. Move delivery schedule to store (next session)

---

## Files to Prioritize for Review

| Priority | File | Debt Level |
|----------|------|-----------|
| 1 | electron-main.ts | High |
| 2 | database.ts | High |
| 2 | schedule.service.ts | High |
| 3 | wineStore.ts | High |
| 3 | DeliverySchedulePage.tsx | Medium |
| 4 | DrinkingSchedulePage.tsx | Medium |
| 5 | wine.service.ts | Medium |

