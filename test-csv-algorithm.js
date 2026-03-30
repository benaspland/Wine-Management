#!/usr/bin/env node

// Extract and test the delivery algorithm with the actual wine CSV data

const CSV_DATA = `Vintage,Country,Region,Wine,Quantity,Size,Peak Drinking Window,Classification,Wine Rating,Professional Critic Ratings,Wine Notes,Varietal,Alcohol Level,Flavour Profile,Recommended Service Temp
2010,Spain,Rioja,R. Lopez de Heredia Vina Tondonia Reserva,3,750ml,2022-2045,Reserva,4,JS 97 : RP 96 : WE 96 : TA 94,"Complex and savoury with depth of black plum and blue fruit over orange rind, iron, tobacco and earthy spices. Cedar and truffle expected to develop. Juicy, zesty and tight with dusty tannins and bright berry fruit on the medium-to-full-bodied palate.",Tempranillo : Garnacha : Graciano : Mazuelo,13%,Forest floor : Wild berries : Tobacco : Cedar : Orange rind : Iron,16-18°C
2011,Italy,Piedmont,"Barolo: Massolino, Margheria",1,Magnum,2025-2045,DOCG,4,AG 93 : WS 93 : WE 93 : JS 92,"A racy Barolo with dark red and black cherries, smoke, tobacco, licorice, new leather and cloves. The rich, boisterous personality of the year comes through in a relatively fleshy, opulent Serralunga Barolo.",Nebbiolo,14.5%,Dark cherry : Smoke : Tobacco : Licorice : Leather : Clove,18-20°C
2012,Italy,Piedmont,"Barolo: Luciano Sandrone, Le Vigne",1,Magnum,2025-2050,DOCG,5,JS 97 : AG 96 : RP 95 : WS 95,"Silky and refined with layers of dark cherry, tar, rose petal and spice. Wonderfully integrated tannins and exceptional length. A towering example of the vintage.",Nebbiolo,14.5%,Dark cherry : Tar : Rose petal : Spice : Liquorice : Mineral,18-20°C
2013,Italy,Piedmont,"Barbaresco: Fiorenzo Nada, Montaribaldi",2,750ml,2025-2040,DOCG,3,JS 93 : AG 92 : RP 91,"Elegant Barbaresco with red cherry, dried herbs, rose petal and subtle earthy tones. Fine-grained tannins and good acidity give this wine excellent structure and balance.",Nebbiolo,14%,Red cherry : Dried herbs : Rose petal : Earth : Violet : Spice,18-20°C
2013,Italy,Piedmont,"Barolo: Giacomo Fenocchio, Bussia",3,750ml,2025-2045,DOCG Riserva,4,JS 95 : AG 94 : RP 93,"Powerful and structured Riserva from the Bussia cru with dark fruit, tar, leather and balsamic notes. Dense tannins and remarkable concentration suggest considerable ageing potential.",Nebbiolo,14.5%,Dark fruit : Tar : Leather : Balsamic : Tobacco : Mineral,18-20°C
2013,Italy,Piedmont,"Barolo: Luigi Pira, Vigna Rionda",1,750ml,2025-2048,DOCG,5,JS 96 : AG 95 : RP 94,"Profound Barolo from the legendary Vigna Rionda vineyard with intense dark fruit, crushed rock, liquorice and floral aromas. Monumental structure and tannins with exceptional length.",Nebbiolo,14.5%,Dark fruit : Crushed rock : Liquorice : Violet : Tar : Iron,18-20°C
2014,Italy,Piedmont,"Barolo: GD Vajra, Ravera",6,750ml,2026-2046,DOCG,4,JS 95 : AG 94 : RP 93 : WS 93,"Refined and elegant from the Ravera cru in Novello. Red cherry, wild strawberry, rose and mint with chalky, persistent tannins. A transparent expression of site.",Nebbiolo,14%,Red cherry : Wild strawberry : Rose : Mint : Chalk : Herbs,18-20°C
2015,Italy,Piedmont,"Barbaresco: Produttori del Barbaresco, Riserva Asili",4,750ml,2027-2050,DOCG Riserva,4,AG 96 : JS 95 : RP 95 : WS 94,"Asili delivers a Barbaresco of outstanding purity with red cherry, rose, spice and a mineral core. Silky tannins frame the wine beautifully with exceptional finesse and length.",Nebbiolo,14.5%,Red cherry : Rose : Spice : Mineral : Tar : Dried herb,18-20°C
2015,Italy,Piedmont,"Barolo: Oddero, Rocche di Castiglione",2,750ml,2027-2050,DOCG,4,JS 95 : AG 94 : RP 93,"Classically proportioned Barolo with dark cherry, dried flowers, tobacco and earthy spice. Firm, fine-grained tannins provide excellent backbone with a long, savoury finish.",Nebbiolo,14.5%,Dark cherry : Dried flowers : Tobacco : Earth : Spice : Liquorice,18-20°C
2015,Italy,Tuscany,Poggio di Sotto Brunello di Montalcino,6,750ml,2025-2050,DOCG,5,AG 97 : JS 96 : RP 96 : WS 95,"Ethereal Brunello with layers of red cherry, crushed flowers, spice and mineral. Translucent purity and remarkable depth with polished tannins and vibrant acidity.",Sangiovese,14%,Red cherry : Crushed flowers : Spice : Mineral : Blood orange : Earth,16-18°C`;

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
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
      const [windowStart, windowEnd] = cells[6].split('-').map(w => parseInt(w));
      const tier = parseInt(cells[8]) || 3;
      const quantity = parseInt(cells[4]) || 0;

      // Parse format properly
      let format = cells[5].toLowerCase();
      if (format.includes('magnum') || format.includes('1.5l')) {
        format = '1.5L';
      } else if (format.includes('75')) {
        format = '750ml';
      }

      if (quantity > 0) {
        wines.push({
          id: `w${wineId++}`,
          producer: cells[3],
          name: cells[3],
          tier,
          location: 'storage',
          quantity,
          format,
          drinking_window_start: windowStart,
          drinking_window_end: windowEnd,
          size: format,
          is_magnum: format.includes('1.5'),
        });
      }
    } catch (e) {
      console.error(`Error parsing line ${i}:`, e.message);
    }
  }

  return wines;
}

const wines = parseCSV(CSV_DATA);
const totalBottles = wines.reduce((s, w) => s + w.quantity, 0);
const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
wines.forEach(w => tierCounts[w.tier]++);

console.log(`\n=== CSV DATA ANALYSIS ===`);
console.log(`Total wines: ${wines.length}`);
console.log(`Total bottles: ${totalBottles}`);
console.log(`By tier: T1=${tierCounts[1]}, T2=${tierCounts[2]}, T3=${tierCounts[3]}, T4=${tierCounts[4]}, T5=${tierCounts[5]}`);
console.log(`\nWines in test data:`);
wines.forEach(w => {
  console.log(`  ${w.producer}: ${w.quantity} × ${w.format} (T${w.tier}, window: ${w.drinking_window_start}-${w.drinking_window_end})`);
});

// Helper functions
const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

console.log(`\n=== CASE SIZE VALIDATION ===`);
wines.forEach(w => {
  const cs = caseSize(w);
  console.log(`  ${w.producer}: cs=${cs}, qty=${w.quantity}`);
});

// Simulate delivery schedule
console.log(`\n=== DELIVERY SCHEDULE SIMULATION ===`);
const remaining = {};
wines.forEach(w => {
  remaining[w.id] = w.quantity;
});

let year = 2026;
let monthIndex = 0;
let totalDelivered = 0;
let deliveryCount = 0;
let loopCount = 0;
const maxLoops = 500;

const cellarCapacity = 80;
const minDeliveryBottles = 24;
let projectedInventory = 0;

while (Object.values(remaining).some(q => q > 0) && loopCount < maxLoops) {
  loopCount++;
  const month = [3, 9][monthIndex];

  // Skip past months in 2026
  if (year === 2026 && month < 3) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Get available capacity
  const availableCapacity = Math.max(0, cellarCapacity - projectedInventory);
  if (availableCapacity < minDeliveryBottles) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Get unscheduled wines
  const unscheduled = wines.filter(w => remaining[w.id] > 0);
  const eligible = unscheduled.filter(w => !(w.tier >= 4 && year < 2029) && w.drinking_window_end >= year);

  if (eligible.length === 0) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

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
    console.log(`[${year}-${String(month).padStart(2, '0')}] Delivered ${batchTotal} bottles (${batch.length} wines)`);
    projectedInventory += batchTotal;
  }

  // Consumption
  projectedInventory = Math.max(0, projectedInventory - 15);

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\n=== RESULTS ===`);
console.log(`Total delivered: ${totalDelivered} bottles`);
console.log(`Total deliveries: ${deliveryCount}`);
console.log(`Wines fully scheduled: ${wines.filter(w => remaining[w.id] === 0).length}/${wines.length}`);

const notScheduled = wines.filter(w => remaining[w.id] > 0);
if (notScheduled.length > 0) {
  console.log(`\n⚠️  ${notScheduled.length} wines NOT fully scheduled:`);
  notScheduled.forEach(w => {
    console.log(`  ${w.producer}: ${remaining[w.id]}/${w.quantity} remaining (T${w.tier}, window: ${w.drinking_window_start}-${w.drinking_window_end})`);
  });
} else {
  console.log(`✓ All wines scheduled!`);
}
