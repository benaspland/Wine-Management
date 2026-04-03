# Development Standards - Wine Management App

## Testing Requirements

**Every code change must include test coverage in BOTH unit and integration test suites.**

### Unit Tests (`src/services/*.test.ts`)
- Fast execution (~600ms for all unit tests)
- Mock data for isolated testing
- Focus on individual function behavior
- Database operations with memory storage

### Integration Tests (`src/services/*.integration.test.ts`)
- Real-world scenarios using full CSV dataset
- Test complex workflows and interactions
- Database state persistence
- Multi-step operations

### Coverage Checklist

When implementing a feature or fix:

- [ ] **Unit Test Added**
  - Mock the specific scenario being tested
  - Include both success and failure cases
  - Test edge cases
  - Keep execution fast

- [ ] **Integration Test Added**
  - Test with real (CSV) data
  - Test complete workflows
  - Verify database persistence
  - Test interaction with other components

- [ ] **All Tests Pass**
  - Run `npm run test` (unit tests only)
  - Run `npm run test:integration` (integration tests only)
  - Run `npm run test:all` (both suites) before committing

- [ ] **Commit Message Includes Test Coverage**
  - Reference test files created/modified
  - Mention what scenarios are tested
  - Note test counts before/after

## Recent Examples

### Pinned + Delayed Wine Conflict Fix
✅ **Changes Made**:
- Modified `delayWineFromDelivery()` to clear pins
- Added `clearWinePinMark()` function

✅ **Tests Added**:
- Unit: `delay-behavior.test.ts` (6 test cases)
- Unit: `pinned-delay-conflict.test.ts` (3 test cases)
- Tests cover: individual delays, multiple delays, UI filtering, pin conflicts

✅ **Result**: 42 total tests passing (24 unit + 18 integration)

### Delivery Schedule Generation & Persistence
✅ **Changes Made**:
- Added `saveDeliverySchedule()` function
- Fixed `cellar_config` initialization
- Fixed `consumption_log` column names

✅ **Tests Added**:
- Unit: 8 new database tests
- Integration: 6 new tests with CSV data
- All database operations validated

✅ **Result**: 34 total tests passing

## Testing Best Practices

### 1. Test Organization
```
src/services/
  ├── database.ts                      # Main implementation
  ├── database.test.ts                 # Unit tests (mocked data)
  ├── database.integration.test.ts     # Integration tests (CSV data)
  ├── schedule.service.ts              # Main implementation
  ├── schedule.service.test.ts         # Unit tests
  └── schedule.service.integration.test.ts # Integration tests
```

### 2. Test Data
- **Unit Tests**: Use small, controlled mock data
- **Integration Tests**: Use full `wine-data.csv` (126 wines)
- Both suites test the same scenarios with different data

### 3. Mock Strategy
```typescript
// Unit test - mock specific behavior
const mockDb = {
  getWineScheduledDeliveryDate: async (wineId) => '2026-03-01'
}

// Integration test - use real CSV data
const wines = lines.slice(0, 126).map(parseCsvLine)
```

### 4. Test Naming
- Describe what is being tested: `should filter delayed wines from current delivery`
- Include the scenario: `with pinned wine that was promoted then delayed`
- Indicate expected outcome: `should remove from pinned list`

## Before Committing

```bash
# 1. Run all tests
npm run test:all

# 2. Verify test counts increased (if feature added)
# Expected output: Test Files 4 passed, Tests 42+ passed

# 3. Check coverage in commit message
# - List new test files created
# - Mention number of test cases added
# - Explain what scenarios are covered

# 4. Commit with reference
git commit -m "Feature/Fix: Description

- Added unit tests in src/services/feature.test.ts (X cases)
- Added integration tests in src/services/feature.integration.test.ts (Y cases)
- Tests cover: scenario 1, scenario 2, edge case
- All tests passing

https://claude.ai/code/session_..."
```

## Quality Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Unit Tests | 20+ | 24 ✅ |
| Integration Tests | 15+ | 18 ✅ |
| Test Files | 3+ | 4 ✅ |
| Test Execution Time | <2s | ~1.3s ✅ |
| Coverage | 80%+ | Increasing ✅ |

## Recent Improvements

1. **Test Infrastructure** (Phase 1)
   - Set up Vitest with happy-dom
   - Created separate unit/integration test files
   - Database abstraction tested across both suites

2. **Database Persistence** (Phase 2)
   - Added 8 unit tests for cellar_config, consumption_log, delivery_schedule
   - Added 6 integration tests with CSV data
   - Verified localStorage serialization works

3. **Delay Behavior** (Phase 3)
   - Added 6 unit tests for delay filtering
   - Added 3 unit tests for pinned+delayed conflict
   - Comprehensive edge case coverage

## Continuous Improvement

✅ **Quality Trend**: Tests are catching bugs before they reach the user
✅ **Regression Prevention**: Every feature has safety net of tests
✅ **Confidence**: Can refactor with assurance tests will catch issues
✅ **Documentation**: Tests serve as examples of how features work

**Goal**: Maintain 100% test coverage for all new features and bug fixes.
