#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse CSV
const csvPath = path.join(__dirname, 'wine-data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.trim().split('\n');

console.log(`\n=== PARSING CSV ===\n`);
console.log(`Total lines: ${lines.length}`);

// Parse header
const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
console.log(`Headers: ${headers.join(', ')}`);

// Parse wines
const wines = [];
let wineId = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());

  try {
    const vintage = parseInt(cells[0]);
    const quantity = parseInt(cells[4]);
    const [windowStart, windowEnd] = cells[6].split('-').map(w => parseInt(w));
    const tier = parseInt(cells[8]) || 3;

    if (quantity > 0 && windowStart && windowEnd) {
      let format = cells[5].toLowerCase();
      if (format.includes('magnum') || format.includes('1.5l')) {
        format = '1.5L';
      } else if (format.includes('half') || format === '375ml') {
        format = '375ml';
      } else if (format.includes('75')) {
        format = '750ml';
      }

      wines.push({
        id: `w${wineId++}`,
        producer: cells[3],
        vintage,
        tier,
        location: 'storage',
        quantity,
        format,
        drinking_window_start: windowStart,
        drinking_window_end: windowEnd,
      });
    }
  } catch (e) {
    // Skip invalid rows
  }
}

const totalBottles = wines.reduce((s, w) => s + w.quantity, 0);
const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
wines.forEach(w => tierCounts[w.tier]++);

console.log(`\n=== INVENTORY SUMMARY ===\n`);
console.log(`Total wines: ${wines.length}`);
console.log(`Total bottles: ${totalBottles}`);
console.log(`Tier distribution: T1=${tierCounts[1]}, T2=${tierCounts[2]}, T3=${tierCounts[3]}, T4=${tierCounts[4]}, T5=${tierCounts[5]}`);

// Helper functions (matching schedule.service.ts)
const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

const isMagnum = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  return size.includes('magnum') || size.includes('1.5l');
};

// Simulate delivery algorithm (matching schedule.service.ts logic)
console.log(`\n=== RUNNING DELIVERY ALGORITHM ===\n`);

const remaining = {};
wines.forEach(w => {
  remaining[w.id] = w.quantity;
});

const cellarCapacity = 80;
const minDeliveryBottles = 24;
const tier45StartYear = 2029;
const currentYear = 2026;
const currentMonth = 3;

let year = currentYear;
let monthIndex = 0;
let projectedInventory = 0;
let loopCount = 0;
const maxLoops = 500;
let totalDelivered = 0;
let deliveryCount = 0;
const deliveriesPerYear = {};

while (Object.values(remaining).some(q => q > 0) && loopCount < maxLoops) {
  loopCount++;
  const month = [3, 9][monthIndex];

  // Skip past months in 2026
  if (year === currentYear && month < currentMonth) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Max 2 deliveries per year
  if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0;
  if (deliveriesPerYear[year] >= 2) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Available capacity
  const availableCapacity = Math.max(0, cellarCapacity - projectedInventory);
  if (availableCapacity < minDeliveryBottles) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Get eligible wines
  const unscheduled = wines.filter(w => remaining[w.id] > 0);
  const eligible = unscheduled.filter(w => {
    // Check tier 4-5 constraint (can't deliver before 2029)
    if (w.tier >= 4 && year < tier45StartYear) return false;
    // Check drinking window (must have time left to drink)
    if (w.drinking_window_end <= year) return false;
    return true;
  });

  if (eligible.length === 0) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Sort by priority (simplified: urgency + tier)
  eligible.sort((a, b) => {
    const aUrgency = 1000 / (a.drinking_window_end - year + 1);
    const bUrgency = 1000 / (b.drinking_window_end - year + 1);
    const tierScore = { 1: 200, 2: 170, 3: 140, 4: 110, 5: 80 };
    const aScore = aUrgency * 100 + (tierScore[a.tier] || 100);
    const bScore = bUrgency * 100 + (tierScore[b.tier] || 100);
    return bScore - aScore;
  });

  // Build batch
  const batch = [];
  let batchTotal = 0;
  for (const wine of eligible) {
    if (batchTotal >= availableCapacity) break;
    const cs = caseSize(wine);
    const deliverAmount = remaining[wine.id] >= cs ? cs : remaining[wine.id];

    if (deliverAmount > 0 && deliverAmount <= availableCapacity - batchTotal) {
      batch.push({ wine, amount: deliverAmount });
      remaining[wine.id] -= deliverAmount;
      batchTotal += deliverAmount;
      totalDelivered += deliverAmount;
    }
  }

  if (batchTotal >= minDeliveryBottles) {
    deliveryCount++;
    deliveriesPerYear[year]++;
    projectedInventory += batchTotal;
    if (loopCount % 5 === 0 || deliveryCount <= 5) {
      console.log(`[${year}-${String(month).padStart(2, '0')}] Delivered ${batchTotal} bottles (${batch.length} wines)`);
    }
  }

  // Consumption
  projectedInventory = Math.max(0, projectedInventory - 15);

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\n=== RESULTS ===\n`);
console.log(`Total bottles delivered: ${totalDelivered}/${totalBottles} (${((totalDelivered/totalBottles)*100).toFixed(1)}%)`);
console.log(`Total deliveries: ${deliveryCount}`);
console.log(`Loop iterations: ${loopCount}`);

// Analyze unscheduled wines
const unscheduled = wines.filter(w => remaining[w.id] > 0);
const unscheduledBottles = unscheduled.reduce((s, w) => s + remaining[w.id], 0);

console.log(`\n⚠️  UNSCHEDULED: ${unscheduledBottles} bottles in ${unscheduled.length} wines`);
console.log(`\nTop unscheduled wines by tier:\n`);

for (let tier = 5; tier >= 1; tier--) {
  const tierUnscheduled = unscheduled.filter(w => w.tier === tier);
  if (tierUnscheduled.length > 0) {
    console.log(`Tier ${tier}: ${tierUnscheduled.length} wines, ${tierUnscheduled.reduce((s, w) => s + remaining[w.id], 0)} bottles`);
    tierUnscheduled.slice(0, 5).forEach(w => {
      console.log(`  - ${w.producer} (${w.vintage}): ${remaining[w.id]}/${w.quantity} remaining (window: ${w.drinking_window_start}-${w.drinking_window_end})`);
    });
  }
}

// Analyze why wines aren't being scheduled
console.log(`\n=== CONSTRAINT ANALYSIS ===\n`);

const tier45Late = unscheduled.filter(w => w.tier >= 4 && w.drinking_window_start <= 2029);
const windowClosed = unscheduled.filter(w => w.drinking_window_end <= 2026);
const tier45TooEarly = unscheduled.filter(w => w.tier >= 4 && w.drinking_window_start > 2029);

console.log(`Tier 4-5 wines blocked by 2029 constraint: ${tier45TooEarly.length} wines, ${tier45TooEarly.reduce((s, w) => s + remaining[w.id], 0)} bottles`);
console.log(`Drinking windows already closed (end ≤ 2026): ${windowClosed.length} wines, ${windowClosed.reduce((s, w) => s + remaining[w.id], 0)} bottles`);
console.log(`Other constraints: ${unscheduled.length - tier45TooEarly.length - windowClosed.length} wines`);
