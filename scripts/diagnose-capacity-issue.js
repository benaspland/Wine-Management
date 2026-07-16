#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse CSV with proper handling
const csvPath = path.join(__dirname, 'wine-data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.trim().split('\n');

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
    const quantity = parseInt(cells[4]);
    const [windowStart, windowEnd] = cells[6].split('-').map(w => parseInt(w));
    const tier = parseInt(cells[8]) || 3;
    if (quantity > 0 && windowStart && windowEnd) {
      let format = cells[5].toLowerCase();
      if (format.includes('magnum') || format.includes('1.5l')) format = '1.5L';
      else if (format.includes('half') || format === '375ml') format = '375ml';
      else if (format.includes('75')) format = '750ml';
      wines.push({
        id: `w${wineId++}`,
        producer: cells[3],
        tier,
        quantity,
        format,
        drinking_window_start: windowStart,
        drinking_window_end: windowEnd,
      });
    }
  } catch (e) {}
}

console.log(`Parsed ${wines.length} wines (${wines.reduce((s,w)=>s+w.quantity,0)} bottles)`);

const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

// Simulate WITH proper capacity tracking
const remaining = {};
wines.forEach(w => { remaining[w.id] = w.quantity; });

const cellarCapacity = 80;
const minDeliveryBottles = 24;
const tier45StartYear = 2029;
const currentYear = 2026;
const currentMonth = 3;
const annualConsumption = 30;

let year = currentYear;
let monthIndex = 0;
let loopCount = 0;
let totalScheduled = 0;
let deliveryCount = 0;
const schedule = []; // Track all deliveries

console.log(`\nStarting simulation...\n`);

while (Object.values(remaining).some(q => q > 0) && loopCount < 200) {
  loopCount++;
  const month = [3, 9][monthIndex];
  
  // Skip past months
  if (year === currentYear && month < currentMonth) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Calculate projected inventory (THIS IS THE KEY!)
  const pendingBottles = schedule.filter(d => {
    const dYear = parseInt(d.year);
    const dMonth = parseInt(d.month);
    if (dYear < year) return true;
    if (dYear === year) return dMonth < month;
    return false;
  }).reduce((sum, d) => sum + d.quantity, 0);

  // Consumption calculation (from initial date to this delivery)
  const monthsFromStart = (year - currentYear) * 12 + (monthIndex * 6 - (currentMonth === 3 ? 0 : 3));
  const consumption = Math.round((annualConsumption / 12) * monthsFromStart);

  const bottlesAtHome = 0 + pendingBottles - consumption;
  const availableCapacity = Math.max(0, cellarCapacity - bottlesAtHome);

  // Get eligible wines
  const unscheduled = wines.filter(w => remaining[w.id] > 0);
  const eligible = unscheduled.filter(w => {
    if (w.tier >= 4 && year < tier45StartYear) return false;
    if (w.drinking_window_end <= year) return false;
    return true;
  });

  if (deliveryCount < 10 || deliveryCount % 10 === 0) {
    console.log(`[${year}-${String(month).padStart(2, '0')}] Cap=${availableCapacity}, Elig=${eligible.length}, Pending=${pendingBottles}, Consump=${consumption}`);
  }

  if (availableCapacity < minDeliveryBottles) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  if (eligible.length === 0) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Build batch - fill capacity with wines
  let batchTotal = 0;
  const batch = [];
  for (const wine of eligible.slice(0, 20)) {
    if (batchTotal >= availableCapacity) break;
    const cs = caseSize(wine);
    const amount = remaining[wine.id] >= cs ? cs : remaining[wine.id];
    if (amount > 0 && amount <= availableCapacity - batchTotal) {
      batch.push({wine, amount});
      remaining[wine.id] -= amount;
      batchTotal += amount;
      totalScheduled += amount;
    }
  }

  if (batchTotal >= minDeliveryBottles) {
    deliveryCount++;
    schedule.push({year, month, quantity: batchTotal});
    if (deliveryCount <= 10 || deliveryCount % 10 === 0) {
      console.log(`  → DELIVERY: ${batchTotal} bottles (${batch.length} wines)`);
    }
  }

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\n=== FINAL RESULTS ===`);
console.log(`Total scheduled: ${totalScheduled} bottles`);
console.log(`Total deliveries: ${deliveryCount}`);
console.log(`Loop iterations: ${loopCount}`);

const unscheduled = wines.filter(w => remaining[w.id] > 0).length;
const unscheduledBottles = wines.reduce((s, w) => s + remaining[w.id], 0);
console.log(`Unscheduled: ${unscheduledBottles} bottles in ${unscheduled} wines`);

// Analyze unscheduled wines
console.log(`\n=== UNSCHEDULED WINES ANALYSIS ===\n`);

const unscheduledWines = wines.filter(w => remaining[w.id] > 0)
  .sort((a,b) => (remaining[b.id] - remaining[a.id]));

for (const wine of unscheduledWines) {
  const reason = wine.tier >= 4 && 2036 < 2029 ? "Tier 4-5 (can't deliver < 2029)" :
                  wine.drinking_window_end <= 2036 ? `Window closed (ends ${wine.drinking_window_end})` :
                  "Capacity/prioritization";
  console.log(`${wine.producer} (T${wine.tier}): ${remaining[wine.id]} bottles - ${reason}`);
}
