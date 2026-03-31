const fs = require('fs');
const path = require('path');

function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
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
      const tier = Math.max(1, Math.min(5, parseInt(cells[8]) || 3));

      if (quantity > 0 && windowStart && windowEnd) {
        let format = cells[5].toLowerCase();
        if (format.includes('magnum') || format.includes('1.5l')) format = '1.5L';
        else if (format.includes('half') || format === '375ml') format = '375ml';
        else if (format.includes('75')) format = '750ml';
        wines.push({
          id: `w${wineId++}`,
          producer: cells[3],
          vintage: parseInt(cells[0]),
          tier,
          quantity,
          format,
          drinking_window_start: windowStart,
          drinking_window_end: windowEnd,
        });
      }
    } catch (e) {}
  }
  return wines;
}

const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

const csvPath = path.join(__dirname, 'wine-data.csv');
const wines = parseCSV(csvPath);

const remaining = {};
wines.forEach(w => {
  remaining[w.id] = w.quantity;
});

const cellarCapacity = 80;
const minDeliveryBottles = 24;
const tier45StartYear = 2029;
const currentYear = 2026;
const annualConsumption = 30;
const deliveryMonths = [3, 9];

const schedule = [];
let loopIterations = 0;
const maxLoopIterations = 5000;
const deliveriesPerYear = {};

for (let year = currentYear; year < currentYear + 100 && loopIterations < maxLoopIterations; year++) {
  if (Object.values(remaining).reduce((a, b) => a + b, 0) === 0) break;

  for (let deliverySlot = 0; deliverySlot < 2; deliverySlot++) {
    loopIterations++;
    if (loopIterations > maxLoopIterations) break;

    const month = deliveryMonths[deliverySlot];
    if (year === currentYear && month < 3) continue;

    if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0;
    if (deliveriesPerYear[year] >= 2) continue;

    const unscheduledWines = wines.filter(w => remaining[w.id] > 0);
    
    // DEBUG: Check why we're exiting
    if (unscheduledWines.length === 0) {
      console.log(`\n⚠️ Loop stopped at ${year}-${month}: No unscheduled wines with remaining bottles`);
      console.log(`\nRemaining bottles by wine:`);
      wines.filter(w => remaining[w.id] > 0).forEach(w => {
        console.log(`  ${w.producer}: ${remaining[w.id]} bottles, window ${w.drinking_window_start}-${w.drinking_window_end}, tier ${w.tier}`);
      });
      break;
    }

    if (unscheduledWines.length === 0) break;

    const candidates = [];
    const filtered = {};
    unscheduledWines.forEach(wine => {
      const timeLeft = wine.drinking_window_end - year;
      if (timeLeft <= 0) {
        filtered[wine.id] = 'window_closed';
        return;
      }
      const timeToOpen = Math.max(0, wine.drinking_window_start - year);
      const maxLead = wine.tier <= 2 ? 3 : 2;
      if (timeToOpen > maxLead) {
        filtered[wine.id] = 'too_early';
        return;
      }
      if (wine.tier >= 4 && year < tier45StartYear) {
        filtered[wine.id] = 'tier_45_before_2029';
        return;
      }

      let priority = 500;
      if (timeLeft <= 1) priority = 5000;
      else if (timeLeft <= 2) priority = 3500;
      else if (timeLeft <= 3) priority = 3000;
      else if (timeLeft <= 6) priority = 2000;
      else if (timeLeft <= 10) priority = 1000;
      if (wine.drinking_window_start <= year) priority += 1500;
      candidates.push({ wine, priority });
    });

    if (candidates.length === 0) continue;

    // Continue with delivery logic...
    candidates.sort((a, b) => b.priority - a.priority);

    const pendingDeliveriesBeforeThisSlot = schedule.filter(d => {
      const dYear = parseInt(d.year);
      const dMonth = parseInt(d.month);
      if (dYear < year) return true;
      if (dYear === year) return dMonth < month;
      return false;
    });
    const pendingBottles = pendingDeliveriesBeforeThisSlot.reduce((sum, d) => sum + d.quantity, 0);

    const monthsFromStart = (year - currentYear) * 12 + (deliverySlot * 6);
    const consumption = Math.round((annualConsumption / 12) * monthsFromStart);

    const bottlesAtHomeWhenDeliveryArrives = 0 + pendingBottles - consumption;
    const targetAvailableCapacity = Math.max(0, cellarCapacity - bottlesAtHomeWhenDeliveryArrives);

    const cases = [];
    let totalDelivered = 0;

    for (const { wine } of candidates) {
      if (totalDelivered >= targetAvailableCapacity) break;
      const cs = caseSize(wine);
      if (remaining[wine.id] === 0) continue;
      const deliverAmount = remaining[wine.id] >= cs ? cs : remaining[wine.id];
      if (deliverAmount <= 0 || deliverAmount > targetAvailableCapacity - totalDelivered) continue;
      cases.push({ wine, bottles: deliverAmount });
      remaining[wine.id] -= deliverAmount;
      totalDelivered += deliverAmount;
    }

    const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0);
    const shouldDeliver = totalDelivered >= minDeliveryBottles || 
                          (totalRemaining === 0 && totalDelivered > 0) || 
                          (candidates.length === cases.length && cases.length > 0);

    if (shouldDeliver && cases.length > 0) {
      cases.forEach(({ wine, bottles }) => {
        schedule.push({ year, month, wine: wine.producer, quantity: bottles });
      });
      deliveriesPerYear[year]++;
    }
  }
}

const totalScheduled = schedule.reduce((s, d) => s + d.quantity, 0);
const totalBottles = wines.reduce((s, w) => s + w.quantity, 0);

console.log(`\n=== FINAL RESULTS ===`);
console.log(`Total scheduled: ${totalScheduled} / ${totalBottles}`);
console.log(`Loop iterations: ${loopIterations}`);
