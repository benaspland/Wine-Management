# Wine Collection Reference

## Collection Overview
- **Total Wines**: ~230 individual bottles
- **Vintage Range**: 2010-2024
- **Regions**: Predominantly France (Bordeaux, Burgundy), Italy (Piedmont, Tuscany), Spain, Germany
- **Stored**: Mix of home and storage locations
- **Format**: Primarily 750ml, with some Magnums and larger formats

## Critical Drinking Windows for Schedule Planning
- **Earliest Peak**: 2022-2045 (Rioja Reserva, 2010)
- **Latest Peak**: 2030-2060 (various grands crus including Bordeaux 2019, Barolo 2019)
- **Maximum End Year**: 2060 (extends 34+ years from current date 2026)

## Geographic Breakdown
### France
- **Bordeaux**: ~35 wines (Grand Cru Classé, Cru Bourgeois)
  - Appellations: Saint-Julien, Pauillac, Saint-Estephe, Margaux, Saint-Emilion, Graves, Lalande-de-Pomerol
  - Peaks: 2026-2060
- **Burgundy**: ~35 wines (Grand Cru, 1er Cru, Village level)
  - Red: Pinot Noir from Gevrey-Chambertin, Nuits-St-Georges, Pommard, Volnay, etc.
  - White: Chardonnay from Meursault, Chassagne, Chablis
  - Peaks: 2025-2050
- **Rhone/Other**: Priorat (Spain but included in French analysis)

### Italy
- **Piedmont**: ~55 wines (Barolo, Barbaresco DOCG level)
  - Primarily Nebbiolo
  - Multiple cru selections (Cannubi, Ravera, Ovello, Rabaja, etc.)
  - Peaks: 2025-2058
- **Tuscany**: ~45 wines (Brunello di Montalcino, Super Tuscan)
  - Sangiovese-based
  - Producers: Poggio di Sotto, Sesti, Canalicchio di Sopra, Il Poggione, Conti Costanti
  - Peaks: 2025-2052

### Germany
- **Riesling Dry (GG - Grosse Lage)**: ~35 wines from Rheingau, Mosel, Saar, Nahe, Rheinhessen
  - Peaks: 2025-2050

### Spain
- **Rioja**: ~5 wines
- **Ribera del Duero**: Vega Sicilia Alion
- **Priorat**: Clos Mogador
- **Sierra de Gredos**: Garnacha
- **Basque Country**: Txakolina (short-term)

## Tier Distribution
- **Tier 5 (Grand/Premier)**: ~20 wines (JS 96+, major grand crus)
- **Tier 4 (Excellent)**: ~40 wines (JS 93-95, Grand Cru Classé, serious age-worthy)
- **Tier 3 (Very Good)**: ~100 wines (JS 91-93, solid mid-range)
- **Tier 2 (Good)**: ~60 wines (JS 89-91, everyday/earlier consumption)
- **Tier 1 (Everyday)**: ~10 wines (JS <89, shorter-term)

## Consumption Patterns Observed
- **Italian reds (Barolo/Barbaresco)**: Most concentrated block, avg 2-6 bottles per wine
- **Burgundy**: Mix of single bottles and small quantities (1-8 bottles)
- **Bordeaux**: Larger holdings, up to 12 bottles per wine
- **German Rieslings**: Consistently 3-6 bottles per wine

## Storage Implications
- **High proportion in storage**: Majority are storage wines with future delivery windows
- **Magnum/Large formats**: Several magnums and 1.5L bottles for long-term age statements
- **Cellar capacity constraint**: With 230+ bottles and delivery minimums of 24 bottles/delivery, delivery schedule needs planning over 5-7+ years

## Critical Issue: Current Schedule Cutoff
The current code only generates delivery schedules 4 years ahead (2026-2029), but wines need to be delivered through **2060**. This is a 34-year gap that needs to be addressed.

### Why This Matters
1. **Tier 4-5 wines** with drinking windows starting in 2030+ must be delivered by 2030-2033
2. **Magnum formats** (slower drinking pace) require longer consumption windows
3. **30 wines/year target** means ~30+ years of consumption planning needed
4. Many wines have peaks of 20-30 years (e.g., 2025-2050, 2028-2055)

## Next Steps
1. ✅ Store this reference (done)
2. Extend delivery schedule generation to look 30+ years ahead or to max drinking window start
3. Adjust cellar capacity calculations to spread deliveries across longer timeframe
4. Verify 24-bottle minimum doesn't create gaps where wines can't be delivered in time
