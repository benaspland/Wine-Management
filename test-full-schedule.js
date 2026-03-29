#!/usr/bin/env node

// Your full CSV data
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
2015,Italy,Tuscany,Poggio di Sotto Brunello di Montalcino,6,750ml,2025-2050,DOCG,5,AG 97 : JS 96 : RP 96 : WS 95,"Ethereal Brunello with layers of red cherry, crushed flowers, spice and mineral. Translucent purity and remarkable depth with polished tannins and vibrant acidity.",Sangiovese,14%,Red cherry : Crushed flowers : Spice : Mineral : Blood orange : Earth,16-18°C
2015,Italy,Tuscany,Sesti (Castello di Argiano) Brunello di Montalcino,12,750ml,2025-2045,DOCG,3,JS 94 : AG 93 : RP 93,"Traditional Brunello with wild cherry, dried herbs, leather and a distinctive earthy character. Medium-to-full-bodied with firm tannins and a long, savoury finish.",Sangiovese,14%,Wild cherry : Dried herbs : Leather : Earth : Iron : Tobacco,16-18°C
2015,Italy,Tuscany,Siro Pacenti Brunello di Montalcino 'Vecchie Vigne',6,750ml,2025-2048,DOCG,4,JS 97 : RP 96 : AG 96,"Stunning old-vine Brunello with incredible concentration and depth. Dark cherry, plum, leather, spice and balsamic notes converge with polished tannins and a seemingly endless finish.",Sangiovese,15%,Dark cherry : Plum : Leather : Spice : Balsamic : Tobacco,16-18°C
2016,France,Bordeaux,Chateau Capbern,6,75cl,2026-2040,Cru Bourgeois Superieur,2,JS 92 : RP 90 : JA 90,"Charming Saint-Estephe with ripe dark fruit, cedar and graphite notes. Medium-bodied with firm tannins and good freshness. Excellent value.",Cabernet Sauvignon : Merlot : Petit Verdot,13%,Dark fruit : Cedar : Graphite : Blackcurrant : Spice : Earth,16-18°C
2016,France,Bordeaux,Chateau Clos du Marquis,2,75cl,2028-2050,-,3,JS 95 : RP 93 : NM 93 : JA 93,"Elegant and precise with cassis, graphite, cedar and violets. Firm and finely structured with polished tannins and impressive length. A standout Saint-Julien.",Cabernet Sauvignon : Merlot : Cabernet Franc,13%,Cassis : Graphite : Cedar : Violet : Blackcurrant : Spice,16-18°C
2016,France,Bordeaux,Chateau Gloria,12,75cl,2026-2042,-,2,JS 93 : RP 91 : JA 91,"Classic Saint-Julien with ripe blackcurrant, plum, cedar and tobacco. Medium-to-full-bodied with supple tannins and a generous, fleshy palate.",Cabernet Sauvignon : Merlot : Cabernet Franc : Petit Verdot,13%,Blackcurrant : Plum : Cedar : Tobacco : Vanilla : Earth,16-18°C
2016,France,Bordeaux,Chateau Grand-Puy-Lacoste,6,75cl,2028-2055,5eme Grand Cru Classe,4,JS 96 : NM 95 : RP 94+ : JA 94,"A brilliant, neoclassical Pauillac with cedar, graphite and a fresh array of ripe blackberries, dark cherries and cassis. Seamless palate with fine, firm, ascending layers of tannins. Classic Pauillac to its core.",Cabernet Sauvignon : Merlot,13.3%,Blackberry : Cedar : Graphite : Cassis : Tobacco : Truffle,16-18°C
2016,France,Bordeaux,Chateau Les Ormes de Pez,12,75cl,2026-2042,-,2,JS 92 : RP 90 : JA 90,"Well-made Saint-Estephe with dark fruit, spice and earthy notes. Medium-bodied with firm tannins, good acidity and a clean finish.",Cabernet Sauvignon : Merlot : Cabernet Franc : Petit Verdot,13.5%,Dark fruit : Spice : Earth : Cedar : Blackcurrant : Graphite,16-18°C
2016,France,Bordeaux,Chateau Meyney,12,75cl,2026-2042,Cru Bourgeois Exceptionnel,2,JS 94 : RP 92 : JA 91,"Powerful Saint-Estephe with concentrated dark fruit, graphite and spice. Full-bodied with robust tannins and impressive depth. Outstanding value.",Cabernet Sauvignon : Merlot : Petit Verdot : Cabernet Franc,14%,Dark fruit : Graphite : Spice : Blackcurrant : Cedar : Leather,16-18°C
2016,Italy,Piedmont,"Barbaresco: Produttori del Barbaresco, Riserva Ovello",1,Magnum,2028-2055,DOCG Riserva,4,AG 95 : JS 95 : RP 94,"The Ovello Riserva delivers a powerful expression of Barbaresco with dark cherry, iron, tar and dried herbs. Firm, structured tannins and outstanding concentration.",Nebbiolo,14.5%,Dark cherry : Iron : Tar : Dried herbs : Rose : Mineral,18-20°C
2016,Italy,Piedmont,"Barolo: Chiara Boschis (E. Pira), Cannubi",1,Magnum,2028-2056,DOCG,5,AG 96 : JS 96 : RP 95,"Exquisite Cannubi with extraordinary perfume of rose, cherry, tar and spice. Silky tannins and remarkable elegance define this quintessential expression of the legendary cru.",Nebbiolo,14.5%,Rose : Cherry : Tar : Spice : Violet : Mineral,18-20°C
2016,Italy,Piedmont,"Barolo: Chiara Boschis (E. Pira), Mosconi",6,750ml,2028-2052,DOCG,4,AG 95 : JS 95 : RP 94,"Rich and structured Barolo from Mosconi with dark cherry, plum, leather and balsamic notes. Dense but refined tannins and excellent concentration.",Nebbiolo,14.5%,Dark cherry : Plum : Leather : Balsamic : Tar : Spice,18-20°C
2016,Italy,Piedmont,"Barolo: Michele Chiarlo, Cannubi",6,750ml,2028-2050,DOCG,4,JS 95 : AG 94 : RP 93,"Elegant Cannubi with bright red cherry, rose petal, cinnamon and a minerally core. Fine-grained tannins and excellent balance make this an approachable yet age-worthy Barolo.",Nebbiolo,14.5%,Red cherry : Rose petal : Cinnamon : Mineral : Tar : Violet,18-20°C
2016,Italy,Tuscany,Canalicchio di Sopra Brunello di Montalcino,6,750ml,2026-2048,DOCG,3,JS 96 : AG 95 : RP 94,"Vibrant and intense Brunello with red cherry, wild herbs, iron and spice. Medium-to-full-bodied with firm tannins and a long, mineral-driven finish.",Sangiovese,14.5%,Red cherry : Wild herbs : Iron : Spice : Leather : Earth,16-18°C
2016,Italy,Tuscany,Canalicchio di Sopra Brunello di Montalcino 'La Casaccia',1,1.5L (Magnum),2028-2055,DOCG,4,JS 97 : AG 96 : RP 95,"Single-vineyard Brunello of outstanding depth with dark cherry, plum, leather and exotic spice. Concentrated and powerful with velvety tannins and extraordinary persistence.",Sangiovese,14.5%,Dark cherry : Plum : Leather : Exotic spice : Mineral : Earth,16-18°C
2016,Italy,Tuscany,Castello Romitorio Brunello di Montalcino,7,750ml,2026-2046,DOCG,3,JS 94 : RP 93 : AG 92,"Modern-styled Brunello with ripe dark cherry, plum, vanilla and spice. Full-bodied with smooth tannins and a generous, open palate.",Sangiovese,14%,Dark cherry : Plum : Vanilla : Spice : Leather : Tobacco,16-18°C
2016,Italy,Tuscany,Poggio di Sotto Brunello di Montalcino,6,750ml,2026-2052,DOCG,5,AG 97 : JS 97 : RP 96,"Magnificent Brunello of crystalline purity with red cherry, blood orange, rose, crushed stone and spice. Ethereal yet powerful with polished tannins and extraordinary length.",Sangiovese,14%,Red cherry : Blood orange : Rose : Crushed stone : Spice : Herbs,16-18°C
2017,France,Burgundy,Domaine Jean Tardy et Fils Nuits-St-Georges 1er Cru 'Aux Argillas',1,75cl,2025-2040,1er Cru,3,BH 91 : JR 17,"Perfumed Nuits-Saint-Georges with red and dark berry fruit, earth and subtle spice. Medium-bodied with fine tannins and a savoury, lingering finish.",Pinot Noir,13%,Red berry : Dark berry : Earth : Spice : Violet : Leather,15-17°C
2017,France,Burgundy,Louis Jadot Beaune 1er Cru 'Clos des Ursules',4,75cl,2025-2038,1er Cru,3,BH 92 : JS 93 : WS 92,"A flagship monopole bottling from Jadot showing ripe cherry, raspberry, spice and a touch of new oak. Medium-bodied with silky tannins and good length.",Pinot Noir,13%,Cherry : Raspberry : Spice : Vanilla : Earth : Floral,15-17°C
2017,Italy,Piedmont,"Barbaresco: Boffa Carlo, Paje",2,750ml,2027-2047,DOCG,3,JS 93 : AG 92,"Traditionally crafted Barbaresco from the Paje cru with dried cherry, rose, tar and herbal notes. Firm tannins and excellent acidity provide classical structure.",Nebbiolo,14%,Dried cherry : Rose : Tar : Herbs : Leather : Spice,18-20°C
2017,Italy,Piedmont,"Barbaresco: Vietti, Masseria",6,750ml,2027-2050,DOCG,4,AG 95 : JS 95 : RP 94,"Elegant and intensely perfumed with red cherry, wild strawberry, crushed flowers and spice. Refined tannins and outstanding length from this prestigious single vineyard.",Nebbiolo,14.5%,Red cherry : Wild strawberry : Crushed flowers : Spice : Mineral : Tar,18-20°C
2017,Italy,Piedmont,"Barolo: Chiara Boschis (E. Pira), Via Nuova",8,750ml,2027-2050,DOCG,4,AG 94 : JS 94 : RP 93,"A blend from multiple crus delivering complexity and accessibility. Dark cherry, dried flowers, leather and spice with supple, integrated tannins.",Nebbiolo,14.5%,Dark cherry : Dried flowers : Leather : Spice : Tar : Tobacco,18-20°C
2017,Italy,Piedmont,"Barolo: Massolino, Parafada",2,750ml,2027-2050,DOCG,4,AG 94 : JS 94 : RP 93 : WE 94,"Structured Barolo from the Parafada cru in Serralunga. Dark fruit, tar, tobacco and mineral notes with dense, firm tannins and impressive depth.",Nebbiolo,14.5%,Dark fruit : Tar : Tobacco : Mineral : Spice : Liquorice,18-20°C
2017,Italy,Piedmont,"Barolo: Oddero, Villero",2,750ml,2027-2050,DOCG,4,JS 95 : AG 94 : RP 93,"Powerful Villero cru with dark cherry, tar, liquorice, iron and dried herbs. Firm, structured tannins and wonderful depth. A Barolo built for ageing.",Nebbiolo,14.5%,Dark cherry : Tar : Liquorice : Iron : Dried herbs : Earth,18-20°C
2017,Spain,Ribera del Duero,Vega Sicilia Alion,4,750ml,2024-2038,-,4,JS 94 : RP 94 : WS 93,"A classical Alion with developed aromas, juicy and round but not heavy, with a tad of earthy rusticity. Balsamic notes and hints of liquorice develop with time.",Tempranillo,15%,Dark berry : Chocolate : Coffee : Liquorice : Balsamic : Spice,16-18°C
2017,Italy,Tuscany,San Filippo Brunello di Montalcino 'Le Lucere',6,750ml,2027-2050,DOCG,4,JS 97 : AG 95 : RP 95,"Superb single-vineyard Brunello with layers of dark cherry, plum, dried herbs, leather and mineral. Full-bodied with velvety tannins and outstanding persistence.",Sangiovese,14.5%,Dark cherry : Plum : Dried herbs : Leather : Mineral : Tobacco,16-18°C`;

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

    const [windowStart, windowEnd] = cells[6].split('-').map(w => parseInt(w));
    const tier = parseInt(cells[8]) || 3;

    wines.push({
      id: `w${wineId++}`,
      tier,
      location: 'storage',
      quantity: parseInt(cells[4]),
      format: cells[5],
      drinking_window_start: windowStart,
      drinking_window_end: windowEnd,
      producer: cells[3],
    });
  }

  return wines;
}

const wines = parseCSV(CSV_DATA);
const totalBottles = wines.reduce((s, w) => s + w.quantity, 0);
const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
wines.forEach(w => tierCounts[w.tier]++);

console.log(`\nINVENTORY:`);
console.log(`  Total wines: ${wines.length}`);
console.log(`  Total bottles: ${totalBottles}`);
console.log(`  By tier: T1=${tierCounts[1]}, T2=${tierCounts[2]}, T3=${tierCounts[3]}, T4=${tierCounts[4]}, T5=${tierCounts[5]}`);

// Simulate algorithm
const minBottles = 24;
const deliveriesPerYear = {};
const scheduledWineIds = new Set();
let projectedInventory = 0;
let year = 2026;
let monthIndex = 0;
let loopIterations = 0;
const maxLoopIterations = 1000;
const deliveries = [];

while (scheduledWineIds.size < wines.length && loopIterations < maxLoopIterations) {
  loopIterations++;
  const month = [3, 9][monthIndex];

  if (year === 2026 && month < 3) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0;
  if (deliveriesPerYear[year] >= 2) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  const availableCapacity = Math.max(0, 80 - projectedInventory);
  if (availableCapacity < minBottles) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  const unscheduled = wines.filter(w => !scheduledWineIds.has(w.id));
  const eligible = unscheduled.filter(w => !(w.tier >= 4 && year < 2029));

  if (eligible.length === 0) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  const batch = eligible.slice(0, 20).map(w => ({ wine: w, qty: Math.min(w.quantity, 6) }));
  const bottleCount = batch.reduce((s, b) => s + b.qty, 0);

  if (bottleCount >= minBottles) {
    batch.forEach(b => scheduledWineIds.add(b.wine.id));
    deliveriesPerYear[year]++;
    projectedInventory += bottleCount;
    deliveries.push({ year, month, bottleCount, wines: batch.length });
  }

  projectedInventory = Math.max(0, projectedInventory - 15); // Consume 15 per slot

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\nSCHEDULING RESULT:`);
console.log(`  Wines scheduled: ${scheduledWineIds.size} / ${wines.length}`);
const scheduledBottles = deliveries.reduce((s, d) => s + d.bottleCount, 0);
console.log(`  Bottles scheduled: ${scheduledBottles} / ${totalBottles}`);
console.log(`  Loop iterations: ${loopIterations}`);
console.log(`  Total deliveries: ${deliveries.length}`);
console.log(`  Years spanned: ${Math.min(...Object.keys(deliveriesPerYear).map(Number))} - ${Math.max(...Object.keys(deliveriesPerYear).map(Number))}`);

console.log(`\nDELIVERIES BY YEAR:`);
Object.entries(deliveriesPerYear).sort().forEach(([y, count]) => {
  const yearDeliveries = deliveries.filter(d => d.year === parseInt(y));
  const totalBottles = yearDeliveries.reduce((s, d) => s + d.bottleCount, 0);
  console.log(`  ${y}: ${count} deliveries, ${totalBottles} bottles`);
});

console.log(`\nUNSCHEDULED WINES: ${wines.length - scheduledWineIds.size}`);
if (wines.length !== scheduledWineIds.size) {
  const unscheduled = wines.filter(w => !scheduledWineIds.has(w.id));
  console.log(`  By tier: T1=${unscheduled.filter(w => w.tier === 1).length}, T2=${unscheduled.filter(w => w.tier === 2).length}, T3=${unscheduled.filter(w => w.tier === 3).length}, T4=${unscheduled.filter(w => w.tier === 4).length}, T5=${unscheduled.filter(w => w.tier === 5).length}`);
}
