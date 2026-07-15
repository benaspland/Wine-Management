#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse CSV
const csvPath = path.join(__dirname, '../wine-data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');
const headers = lines[0].split(',').map(h => h.trim());
const rows = lines.slice(1).map(line => {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim().replace(/^"|"$/g, ''));
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim().replace(/^"|"$/g, ''));
  return values;
});

// Map CSV to Wine objects
const wines = rows.map((row, idx) => {
  const obj = {};
  headers.forEach((header, i) => {
    obj[header.trim()] = row[i];
  });

  // Parse fields
  const vintage = parseInt(obj.Vintage);
  const quantity = parseInt(obj.Quantity);
  const format = obj.Size || '750ml';

  // Parse drinking window
  let dwStart = 2020, dwEnd = 2050;
  if (obj['Peak Drinking Window']) {
    const [start, end] = obj['Peak Drinking Window'].split('-').map(x => parseInt(x.trim()));
    if (!isNaN(start)) dwStart = start;
    if (!isNaN(end)) dwEnd = end;
  }

  // Parse tier from "Wine Rating"
  let tier = 3;
  const rating = parseInt(obj['Wine Rating']);
  if (!isNaN(rating)) {
    tier = Math.max(1, Math.min(5, rating));
  }

  // Parse critic ratings
  let criticRatings = {};
  if (obj['Professional Critic Ratings']) {
    const ratings = obj['Professional Critic Ratings'].split(':');
    ratings.forEach(r => {
      const [name, score] = r.trim().split(/\s+/);
      if (name && score) {
        criticRatings[name.toLowerCase()] = parseInt(score);
      }
    });
  }

  // Parse alcohol
  let alcohol = 0;
  if (obj['Alcohol Level']) {
    alcohol = parseFloat(obj['Alcohol Level'].replace('%', ''));
  }

  // Parse serving temps
  let servingTempMin = 16, servingTempMax = 18;
  if (obj['Recommended Service Temp']) {
    const [min, max] = obj['Recommended Service Temp'].split('-').map(x => parseInt(x.replace('°C', '').trim()));
    if (!isNaN(min)) servingTempMin = min;
    if (!isNaN(max)) servingTempMax = max;
  }

  return {
    id: `wine-${idx + 1}`,
    producer: obj.Wine?.split(' ').slice(0, 3).join(' ') || 'Unknown',
    name: obj.Wine || 'Unknown',
    vintage,
    country: obj.Country || '',
    region: obj.Region || '',
    classification: obj.Classification || '',
    wine_type: 'Red',
    varietal: obj.Varietal || '',
    tier,
    location: 'storage',
    quantity,
    format,
    drinking_window_start: dwStart,
    drinking_window_end: dwEnd,
    alcohol_percent: alcohol,
    serving_temp_min: servingTempMin,
    serving_temp_max: servingTempMax,
    notes: obj['Wine Notes'] || '',
    critic_ratings: criticRatings,
    flavor_profile: obj['Flavour Profile'] || ''
  };
});

console.log(`\n📊 DELIVERY SCHEDULE TEST REPORT\n${'='.repeat(60)}\n`);
console.log(`Total wines in CSV: ${wines.length}`);
const totalBottles = wines.reduce((sum, w) => sum + w.quantity, 0);
console.log(`Total bottles in storage: ${totalBottles}\n`);

// Load the compiled service
const serviceCode = fs.readFileSync(path.join(__dirname, 'dist/assets/index-DVqoRkc2.js'), 'utf-8');

// Since the service is bundled, we'll create a mock version that matches the algorithm
// This extracts the key logic from the TypeScript service

function generateDeliverySchedule(allWines, cellarCapacity = 80, currentBottlesAtHome = 0, deliveryMonths = [3, 9]) {
  const storageWines = allWines.filter(w => w.location === 'storage');

  if (storageWines.length === 0) {
    return [];
  }

  const DELIVERY_CONFIG = {
    minDeliveryBottles: 24,
    maxDeliveriesPerYear: 2,
    leadTimeMonths: { cat1: 24, cat2: 24, cat3: 12, cat4: 12, cat5: 12 },
    minimumDeliveryThresholds: { 1: 6, 2: 3, 3: 12, 4: 12, 5: 12 },
    tier4Plus5MinYear: 2029
  };

  const currentYear = new Date().getFullYear();
  const deliveries = [];
  const remaining = {};
  const home = {};
  const consumed = {};
  const lastDrunk = {};
  let drunkThisYear = {};

  // Initialize remaining & home
  storageWines.forEach(wine => {
    remaining[wine.id] = wine.quantity;
    home[wine.id] = 0;
    consumed[wine.id] = 0;
  });

  // Add existing home wines
  allWines
    .filter(w => w.location === 'home')
    .forEach(wine => {
      home[wine.id] = wine.quantity;
    });

  const wineMap = new Map(storageWines.map(w => [w.id, w]));

  // Helper: Get case size
  const getCaseSize = (format) => {
    if (!format) return 1;
    const lower = format.toLowerCase();
    if (lower.includes('magnum')) return 3;
    if (lower.includes('half')) return 12;
    return 6; // regular 750ml
  };

  // Helper: Get wines that can be drunk in a given year
  const getDrinkable = (year) => {
    return storageWines
      .filter(w => w.drinking_window_start <= year && w.drinking_window_end >= year)
      .sort((a, b) => {
        const aPriority = a.tier * 1000 + (a.drinking_window_end - year);
        const bPriority = b.tier * 1000 + (b.drinking_window_end - year);
        return aPriority - bPriority;
      });
  };

  // Simulate 3-pass drinking for each year from currentYear to 2060
  for (let year = currentYear; year <= 2060; year++) {
    drunkThisYear = {}; // Reset for this year
    const drinkable = getDrinkable(year);

    let drinkCount = 0;
    const targetDrinks = 30;

    // Pass 0: One of each (variety)
    for (const wine of drinkable) {
      if (drinkCount >= targetDrinks) break;
      const drunk = drunkThisYear[wine.id] || 0;
      if (drunk >= 1 || home[wine.id] <= 0) continue;

      home[wine.id]--;
      drunkThisYear[wine.id] = 1;
      lastDrunk[wine.id] = year;
      drinkCount++;
    }

    // Pass 1: Second bottles for Cat 1-3
    if (drinkCount < targetDrinks) {
      for (const wine of drinkable) {
        if (drinkCount >= targetDrinks) break;
        if (wine.format?.toLowerCase().includes('magnum')) continue;
        const drunk = drunkThisYear[wine.id] || 0;
        if (drunk !== 1 || wine.tier > 3 || home[wine.id] <= 0) continue;

        home[wine.id]--;
        drunkThisYear[wine.id] = 2;
        lastDrunk[wine.id] = year;
        drinkCount++;
      }
    }

    // Pass 2: Second bottles for Cat 4-5
    if (drinkCount < targetDrinks) {
      for (const wine of drinkable) {
        if (drinkCount >= targetDrinks) break;
        if (wine.format?.toLowerCase().includes('magnum')) continue;
        const drunk = drunkThisYear[wine.id] || 0;
        if (drunk !== 1 || home[wine.id] <= 0) continue;

        home[wine.id]--;
        drunkThisYear[wine.id] = 2;
        lastDrunk[wine.id] = year;
        drinkCount++;
      }
    }

    // Delivery scheduling for this year
    let deliveryCount = 0;
    for (const deliverySlot of [0, 1]) {
      if (deliveryCount >= DELIVERY_CONFIG.maxDeliveriesPerYear) break;

      const month = deliveryMonths[deliverySlot];
      const targetAvailableCapacity = cellarCapacity - Object.values(home).reduce((s, v) => s + (v || 0), 0);

      if (targetAvailableCapacity < 3) break;

      const candidates = [];
      for (const wine of storageWines) {
        if (remaining[wine.id] <= 0) continue;

        // Tier 4-5 constraints
        if (wine.tier >= 4 && year < DELIVERY_CONFIG.tier4Plus5MinYear) continue;

        // Lead time constraint
        const leadMonths = wine.tier <= 2 ? 24 : 12;
        if (wine.drinking_window_start - year > leadMonths / 12) continue;

        // Priority scoring
        let priority = 0;
        const timeLeft = wine.drinking_window_end - year;
        const timeToOpen = Math.max(0, wine.drinking_window_start - year);

        // Urgency
        if (timeLeft <= 3) priority = 3000 - timeLeft;
        else if (timeLeft <= 6) priority = 2000 - timeLeft;
        else if (timeLeft <= 10) priority = 1000 - timeLeft;

        // Drinkability
        if (wine.drinking_window_start <= year) {
          priority += 1500;
        } else {
          priority -= timeToOpen * 300;
        }

        // Category preference
        if (wine.tier === 1) {
          priority += 600;
          if (year <= currentYear + 3) priority += 500;
        } else if (wine.tier === 2) {
          priority += 300;
          if (year <= currentYear + 2) priority += 200;
        } else if (wine.tier === 3) {
          if (year <= currentYear + 2 && timeLeft > 8) priority -= 400;
        } else if (wine.tier >= 4) {
          priority -= 100 * (wine.tier - 3);
        }

        // Cat 4/5 spacing
        if (wine.tier >= 4) {
          const bottlesLeft = home[wine.id] + (remaining[wine.id] || 0);
          const yearsLeft = Math.max(1, wine.drinking_window_end - year);
          const idealGap = Math.max(1, Math.floor(yearsLeft / Math.max(1, bottlesLeft)));
          if (lastDrunk[wine.id] && year - lastDrunk[wine.id] < idealGap && bottlesLeft > 2) {
            continue;
          }
        }

        // HOME STOCK: Deprioritize wines already at home
        const cs = getCaseSize(wine.format);
        if (home[wine.id] >= cs) {
          priority -= 800;
        } else if (home[wine.id] === 0) {
          priority += 100;
        }

        candidates.push({ wine, priority });
      }

      // Sort by priority and build delivery
      candidates.sort((a, b) => b.priority - a.priority);

      const cases = [];
      let totalDelivered = 0;

      for (const { wine } of candidates) {
        if (totalDelivered >= targetAvailableCapacity) break;
        if (remaining[wine.id] <= 0) continue;

        const caseSize = getCaseSize(wine.format);
        const available = remaining[wine.id];

        let deliveryQty = 0;
        if (available >= caseSize) {
          deliveryQty = Math.floor(available / caseSize) * caseSize;
          if (deliveryQty > targetAvailableCapacity - totalDelivered) {
            deliveryQty = caseSize;
          }
        } else if (available >= 3) {
          deliveryQty = available;
        }

        if (deliveryQty > 0) {
          cases.push({ wine, bottles: deliveryQty });
          remaining[wine.id] -= deliveryQty;
          home[wine.id] += deliveryQty;
          totalDelivered += deliveryQty;
        }
      }

      const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0);
      const minDeliveryBottles = DELIVERY_CONFIG.minDeliveryBottles;
      const shouldDeliver = totalDelivered >= minDeliveryBottles || (totalRemaining === 0 && totalDelivered > 0);

      if (shouldDeliver && cases.length > 0) {
        cases.forEach(({ wine, bottles }) => {
          deliveries.push({
            id: `delivery-${wine.id}-${year}-${month}`,
            wine_id: wine.id,
            quantity: bottles,
            scheduled_date: `${year}-${String(month).padStart(2, '0')}-01`,
            from_location: 'storage',
            to_location: 'home'
          });
        });
        deliveryCount++;
      }
    }
  }

  return deliveries;
}

// Run schedule generation
console.log('🔄 Generating delivery schedule...\n');
const schedule = generateDeliverySchedule(wines, 80, 0, [3, 9]);

// Analyze results
const scheduledBottles = schedule.reduce((sum, d) => sum + d.quantity, 0);
const bottlesByYear = {};
const bottlesByCategory = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const bottlesInStorage = {};

schedule.forEach(delivery => {
  const year = parseInt(delivery.scheduled_date.split('-')[0]);
  bottlesByYear[year] = (bottlesByYear[year] || 0) + delivery.quantity;

  const wine = wines.find(w => w.id === delivery.wine_id);
  if (wine) {
    bottlesByCategory[wine.tier] = (bottlesByCategory[wine.tier] || 0) + delivery.quantity;
  }
});

// Find unscheduled bottles
const scheduledWineIds = new Set(schedule.map(d => d.wine_id));
const unscheduledBottles = wines
  .filter(w => !scheduledWineIds.has(w.id))
  .reduce((sum, w) => sum + w.quantity, 0);

// Results
console.log(`✅ DELIVERY SCHEDULE RESULTS:`);
console.log(`${'─'.repeat(60)}`);
console.log(`Total bottles scheduled: ${scheduledBottles}/${totalBottles}`);
console.log(`Coverage: ${((scheduledBottles / totalBottles) * 100).toFixed(1)}%`);
console.log(`Unscheduled bottles: ${unscheduledBottles}\n`);

console.log(`📅 DELIVERIES BY YEAR:`);
console.log(`${'─'.repeat(60)}`);
const yearsSorted = Object.keys(bottlesByYear).sort((a, b) => parseInt(a) - parseInt(b));
yearsSorted.forEach(year => {
  const count = bottlesByYear[year];
  const bars = '█'.repeat(Math.ceil(count / 10));
  console.log(`${year}: ${bars} ${count} bottles`);
});

console.log(`\n🏆 DELIVERIES BY CATEGORY (TIER):`);
console.log(`${'─'.repeat(60)}`);
const tiers = ['EVERYDAY', 'QUALITY', 'FINE', 'PREMIUM', 'ICON'];
Object.entries(bottlesByCategory).forEach(([tier, count]) => {
  const tierName = tiers[parseInt(tier) - 1];
  const bars = '█'.repeat(Math.ceil(count / 10));
  console.log(`Tier ${tier} (${tierName}): ${bars} ${count} bottles`);
});

console.log(`\n📊 DELIVERY STATISTICS:`);
console.log(`${'─'.repeat(60)}`);
console.log(`Total deliveries: ${schedule.length}`);
console.log(`Average bottles per delivery: ${(scheduledBottles / schedule.length).toFixed(1)}`);
console.log(`Years covered: ${yearsSorted.length}`);

if (unscheduledBottles > 0) {
  console.log(`\n⚠️  UNSCHEDULED WINES:`);
  console.log(`${'─'.repeat(60)}`);
  wines
    .filter(w => !scheduledWineIds.has(w.id))
    .slice(0, 10)
    .forEach(w => {
      console.log(`- ${w.name} (${w.vintage}): ${w.quantity} bottles, Tier ${w.tier}, Location: ${w.location}`);
    });
  if (wines.filter(w => !scheduledWineIds.has(w.id)).length > 10) {
    console.log(`... and ${wines.filter(w => !scheduledWineIds.has(w.id)).length - 10} more`);
  }
}

console.log(`\n✨ Test complete.\n`);

if (scheduledBottles === totalBottles) {
  console.log(`🎉 SUCCESS: All ${totalBottles} bottles are scheduled!`);
} else {
  console.log(`❌ FAILURE: Only ${scheduledBottles}/${totalBottles} bottles scheduled`);
}

console.log(`\n${'='.repeat(60)}\n`);
