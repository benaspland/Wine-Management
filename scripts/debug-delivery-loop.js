#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse CSV
const csvPath = path.join(__dirname, 'wine-data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.trim().split('\n');

// Parse wines (simplified)
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

const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

// Simulate with detailed logging
const remaining = {};
wines.forEach(w => { remaining[w.id] = w.quantity; });

const cellarCapacity = 80;
const minDeliveryBottles = 24;
const tier45StartYear = 2029;
const currentYear = 2026;
const currentMonth = 3;

let year = currentYear;
let monthIndex = 0;
let loopCount = 0;
const maxLoops = 50; // Lower limit to see where it fails

console.log(`\nStarting delivery loop from ${currentYear}-${currentMonth}...\n`);

while (Object.values(remaining).some(q => q > 0) && loopCount < maxLoops) {
  loopCount++;
  const month = [3, 9][monthIndex];
  
  console.log(`\n--- Iteration ${loopCount}: ${year}-${String(month).padStart(2, '0')} ---`);

  // Skip past months
  if (year === currentYear && month < currentMonth) {
    console.log(`  SKIP: past month`);
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Check unscheduled wines
  const unscheduled = wines.filter(w => remaining[w.id] > 0);
  const eligible = unscheduled.filter(w => {
    if (w.tier >= 4 && year < tier45StartYear) return false;
    if (w.drinking_window_end <= year) return false;
    return true;
  });

  console.log(`  Unscheduled: ${unscheduled.length}, Eligible: ${eligible.length}`);

  if (eligible.length === 0) {
    console.log(`  SKIP: no eligible wines`);
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Capacity calculation
  const projectedInventory = 0; // Simplified
  const availableCapacity = Math.max(0, cellarCapacity - projectedInventory);
  console.log(`  Available capacity: ${availableCapacity}`);

  if (availableCapacity < minDeliveryBottles) {
    console.log(`  SKIP: capacity ${availableCapacity} < minimum ${minDeliveryBottles}`);
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Try to build batch
  const batch = [];
  for (const wine of eligible.slice(0, 10)) {
    const cs = caseSize(wine);
    const amount = remaining[wine.id] >= cs ? cs : remaining[wine.id];
    if (amount > 0) {
      batch.push({ wine: wine.producer, amount });
      break; // Just take first for simplicity
    }
  }

  if (batch.length > 0) {
    console.log(`  DELIVER: ${batch.length} wines, ${batch.map(b => b.amount).reduce((a,b)=>a+b,0)} bottles`);
  } else {
    console.log(`  SKIP: couldn't build valid batch`);
  }

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\nStopped at iteration ${loopCount} (max ${maxLoops})`);
