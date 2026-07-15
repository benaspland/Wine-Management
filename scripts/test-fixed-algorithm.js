#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse CSV
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
        region: cells[2],
        tier,
        quantity,
        format,
        drinking_window_start: windowStart,
        drinking_window_end: windowEnd,
      });
    }
  } catch (e) {}
}

console.log(`Parsed ${wines.length} wines (${wines.reduce((s,w)=>s+w.quantity,0)} bottles)\n`);

const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

// Simulate with improved priority scoring
const remaining = {};
const home = {};
const wineMap = {};
wines.forEach(w => { remaining[w.id] = w.quantity; home[w.id] = 0; wineMap[w.id] = w; });

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
const schedule = [];

console.log(`Testing IMPROVED priority scoring:\n`);

while (Object.values(remaining).some(q => q > 0) && loopCount < 200) {
  loopCount++;
  const month = [3, 9][monthIndex];
  
  if (year === currentYear && month < currentMonth) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Capacity
  const pendingBottles = schedule.filter(d => {
    const dYear = parseInt(d.year);
    const dMonth = parseInt(d.month);
    if (dYear < year) return true;
    if (dYear === year) return dMonth < month;
    return false;
  }).reduce((sum, d) => sum + d.quantity, 0);

  const monthsFromStart = (year - currentYear) * 12 + (monthIndex * 6 - (currentMonth === 3 ? 0 : 3));
  const consumption = Math.round((annualConsumption / 12) * monthsFromStart);
  const bottlesAtHome = 0 + pendingBottles - consumption;
  const availableCapacity = Math.max(0, cellarCapacity - bottlesAtHome);

  // Get candidates with IMPROVED priority scoring
  const unscheduled = wines.filter(w => remaining[w.id] > 0);
  const candidates = [];

  unscheduled.forEach(wine => {
    const timeLeft = wine.drinking_window_end - year;
    if (timeLeft <= 0) return;
    const timeToOpen = Math.max(0, wine.drinking_window_start - year);

    // IMPROVED: More lenient lead-time
    const maxLead = wine.tier <= 2 ? 3 : 2;
    if (timeToOpen > maxLead) return;

    if (wine.tier >= 4 && year < tier45StartYear) return;

    let priority = 500;

    // IMPROVED: Much higher priority for wines in last year
    if (timeLeft <= 1) priority = 5000;
    else if (timeLeft <= 2) priority = 3500;
    else if (timeLeft <= 3) priority = 3000;
    else if (timeLeft <= 6) priority = 2000;
    else if (timeLeft <= 10) priority = 1000;

    if (wine.drinking_window_start <= year) {
      priority += 1500;
    } else {
      priority -= Math.min(300, timeToOpen * 100);
    }

    // IMPROVED: More balanced tier scoring
    if (wine.tier === 1) priority += 600;
    else if (wine.tier === 2) priority += 300;
    else if (wine.tier === 3) priority += 150;
    else if (wine.tier === 4) priority += 50;
    else if (wine.tier === 5) priority += 25;

    // IMPROVED: Gentler home stock penalty
    if (home[wine.id] >= caseSize(wine) * 2) {
      priority -= 500;
    } else if (home[wine.id] === 0) {
      priority += 150;
    }

    // Diversity bonus
    const winesAtHome = Object.entries(home).filter(([id, qty]) => qty > 0).map(([id]) => wineMap[id]);
    const producersAtHome = new Set(winesAtHome.map(w => w.producer));
    if (!producersAtHome.has(wine.producer)) priority += 75;

    candidates.push({ wine, priority });
  });

  candidates.sort((a,b) => b.priority - a.priority);

  if (availableCapacity < minDeliveryBottles) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  if (candidates.length === 0) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Build batch
  let batchTotal = 0;
  const batch = [];
  for (const { wine } of candidates) {
    if (batchTotal >= availableCapacity) break;
    const cs = caseSize(wine);
    const amount = remaining[wine.id] >= cs ? cs : remaining[wine.id];
    if (amount > 0 && amount <= availableCapacity - batchTotal) {
      batch.push({wine, amount});
      remaining[wine.id] -= amount;
      home[wine.id] += amount;
      batchTotal += amount;
      totalScheduled += amount;
    }
  }

  if (batchTotal >= minDeliveryBottles) {
    deliveryCount++;
    schedule.push({year, month, quantity: batchTotal});
    if (deliveryCount <= 5 || deliveryCount % 5 === 0) {
      console.log(`[${year}-${String(month).padStart(2, '0')}] Delivered ${batchTotal} bottles (${batch.length} wines, cap=${availableCapacity})`);
    }
  }

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\n=== RESULTS WITH IMPROVED SCORING ===`);
console.log(`Total scheduled: ${totalScheduled} / 617 bottles (${((totalScheduled/617)*100).toFixed(1)}%)`);
console.log(`Total deliveries: ${deliveryCount}`);
console.log(`Loop iterations: ${loopCount}`);

const unscheduled = wines.filter(w => remaining[w.id] > 0).length;
const unscheduledBottles = wines.reduce((s, w) => s + remaining[w.id], 0);
console.log(`Unscheduled: ${unscheduledBottles} bottles in ${unscheduled} wines`);

// Compare
console.log(`\nComparison:`);
console.log(`  Before fix: 448 bottles (73%)`);
console.log(`  After fix:  ${totalScheduled} bottles (${((totalScheduled/617)*100).toFixed(1)}%)`);
console.log(`  Improvement: +${totalScheduled - 448} bottles`);
