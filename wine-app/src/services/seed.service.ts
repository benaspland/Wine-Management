import type { Wine } from '../types/index'
import * as db from './database'

export async function seedDatabase() {
  // Get current DB type to see which backend is in use
  const dbType = (window as any).__dbType

  // Only seed Electron SQLite database, not memory/web databases
  // (Memory databases seed themselves, Electron SQLite needs explicit seeding)
  if (dbType !== 'electron') {
    console.log('[Seed] Skipping seed for non-Electron database')
    return
  }

  // Check if data already exists
  const wines = await db.getWines()
  if (wines.length > 0) {
    console.log('[Seed] Database already seeded, skipping')
    return
  }

  // Safety check: prevent accidental re-seeding by checking for specific wine
  const hasMargeaux = wines.some(w => w.producer === 'Château Margaux')
  if (hasMargeaux) {
    console.log('[Seed] Found existing Château Margaux, skipping seed')
    return
  }

  console.log('Seeding database with sample wines...')

  const sampleWines: Omit<Wine, 'id' | 'created_at' | 'updated_at'>[] = [
    {
      producer: 'Château Margaux',
      name: 'Margaux',
      vintage: 2015,
      country: 'France',
      region: 'Bordeaux',
      classification: 'Premier Grand Cru Classé',
      wine_type: 'Red',
      varietal: 'Cabernet Sauvignon Blend',
      tier: 5,
      location: 'home',
      quantity: 3,
      format: '750ml',
      drinking_window_start: 2025,
      drinking_window_end: 2060,
      alcohol_percent: 13,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'Complex and savoury with depth of black plum and blue fruit over orange rind, iron, tobacco and earthy spices.',
      critic_ratings: { rp: 98, js: 97 },
      flavor_profile: 'Black plum, Cassis, Graphite, Dried Tobacco, Cedar',
    },
    {
      producer: 'Screaming Eagle',
      name: 'Cabernet Sauvignon',
      vintage: 2019,
      country: 'USA',
      region: 'Napa Valley',
      classification: 'Proprietary Red',
      wine_type: 'Red',
      varietal: 'Cabernet Sauvignon',
      tier: 5,
      location: 'storage',
      quantity: 1,
      format: '750ml',
      drinking_window_start: 2025,
      drinking_window_end: 2045,
      alcohol_percent: 14.1,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'Elegant and refined with powerful aromatics.',
      critic_ratings: { rp: 96, js: 95 },
      flavor_profile: 'Dark cherry, Cassis, Toasted oak',
    },
    {
      producer: 'R. Lopez de Heredia',
      name: 'Vina Tondonia Reserva',
      vintage: 2010,
      country: 'Spain',
      region: 'Rioja',
      classification: 'Reserva',
      wine_type: 'Red',
      varietal: 'Tempranillo : Garnacha : Graciano : Mazuelo',
      tier: 4,
      location: 'storage',
      quantity: 3,
      format: '750ml',
      drinking_window_start: 2022,
      drinking_window_end: 2045,
      alcohol_percent: 13,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'Complex and savoury with depth.',
      critic_ratings: { rp: 96, js: 97, we: 96, ta: 94 },
      flavor_profile: 'Forest floor, Wild berries, Tobacco, Cedar, Orange rind, Iron',
    },
    {
      producer: 'Domaine Leflaive',
      name: 'Puligny-Montrachet',
      vintage: 2018,
      country: 'France',
      region: 'Burgundy',
      classification: 'Grand Cru',
      wine_type: 'White',
      varietal: 'Chardonnay',
      tier: 4,
      location: 'storage',
      quantity: 3,
      format: '750ml',
      drinking_window_start: 2024,
      drinking_window_end: 2035,
      alcohol_percent: 13,
      serving_temp_min: 10,
      serving_temp_max: 12,
      notes: 'Pure and elegant white Burgundy.',
      critic_ratings: { rp: 94, js: 95 },
      flavor_profile: 'Citrus, Green apple, Minerality, Butter',
    },
    {
      producer: 'Tenuta San Guido',
      name: 'Sassicaia Bolgheri',
      vintage: 2016,
      country: 'Italy',
      region: 'Tuscany',
      classification: 'IGT',
      wine_type: 'Red',
      varietal: 'Cabernet Sauvignon : Cabernet Franc',
      tier: 4,
      location: 'home',
      quantity: 6,
      format: '750ml',
      drinking_window_start: 2023,
      drinking_window_end: 2040,
      alcohol_percent: 13.5,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'One of the greatest Super Tuscans.',
      critic_ratings: { rp: 94, js: 94 },
      flavor_profile: 'Dark cherry, Plum, Tobacco, Cedar, Mint',
    },
    {
      producer: 'Opus One',
      name: 'Napa Valley Proprietary Red',
      vintage: 2019,
      country: 'USA',
      region: 'Napa Valley',
      classification: 'Proprietary Red',
      wine_type: 'Red',
      varietal: 'Cabernet Sauvignon : Merlot : Cabernet Franc',
      tier: 4,
      location: 'storage',
      quantity: 1,
      format: '1.5L',
      drinking_window_start: 2025,
      drinking_window_end: 2050,
      alcohol_percent: 14.5,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'Powerful and structured.',
      critic_ratings: { rp: 93, js: 93 },
      flavor_profile: 'Black cherry, Plum, Chocolate, Spice',
    },
    {
      producer: 'Gaja',
      name: 'Barbaresco',
      vintage: 2016,
      country: 'Italy',
      region: 'Piedmont',
      classification: 'DOCG',
      wine_type: 'Red',
      varietal: 'Nebbiolo',
      tier: 3,
      location: 'home',
      quantity: 2,
      format: '750ml',
      drinking_window_start: 2023,
      drinking_window_end: 2045,
      alcohol_percent: 14,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'Elegant Piedmont classic.',
      critic_ratings: { rp: 94, js: 94 },
      flavor_profile: 'Rose petals, Red cherry, Tar, Licorice',
    },
    {
      producer: 'Penfolds',
      name: 'Grange Bin 95 Shiraz',
      vintage: 2010,
      country: 'Australia',
      region: 'South Australia',
      classification: 'Shiraz',
      wine_type: 'Red',
      varietal: 'Shiraz',
      tier: 3,
      location: 'storage',
      quantity: 2,
      format: '750ml',
      drinking_window_start: 2020,
      drinking_window_end: 2050,
      alcohol_percent: 14.5,
      serving_temp_min: 16,
      serving_temp_max: 18,
      notes: 'Iconic Australian wine.',
      critic_ratings: { rp: 96, js: 95 },
      flavor_profile: 'Dark plum, Black pepper, Licorice, Leather',
    },
    {
      producer: 'Krug',
      name: 'Grande Cuvée',
      vintage: 2012,
      country: 'France',
      region: 'Champagne',
      classification: 'NV Blend',
      wine_type: 'Sparkling',
      varietal: 'Chardonnay : Pinot Noir : Pinot Meunier',
      tier: 2,
      location: 'home',
      quantity: 4,
      format: '750ml',
      drinking_window_start: 2020,
      drinking_window_end: 2035,
      alcohol_percent: 12,
      serving_temp_min: 6,
      serving_temp_max: 8,
      notes: 'Prestige Champagne.',
      critic_ratings: { rp: 93, js: 93 },
      flavor_profile: 'Brioche, Hazelnut, Citrus, Toasted bread',
    },
    {
      producer: 'Cloudy Bay',
      name: 'Sauvignon Blanc',
      vintage: 2021,
      country: 'New Zealand',
      region: 'Marlborough',
      classification: 'Dry White',
      wine_type: 'White',
      varietal: 'Sauvignon Blanc',
      tier: 1,
      location: 'home',
      quantity: 8,
      format: '750ml',
      drinking_window_start: 2021,
      drinking_window_end: 2025,
      alcohol_percent: 13,
      serving_temp_min: 8,
      serving_temp_max: 10,
      notes: 'Vibrant everyday wine.',
      critic_ratings: { we: 90 },
      flavor_profile: 'Passion fruit, Herbaceous, Citrus',
    },
  ]

  let createdCount = 0
  for (const wine of sampleWines) {
    console.log(`[Seed] Creating wine ${createdCount + 1}/${sampleWines.length}: ${wine.producer} ${wine.name}`)
    await db.createWine(wine)
    createdCount++
  }

  console.log(`[Seed] Completed. Created ${createdCount} wines`)

  // Verify actual count in database
  const finalWines = await db.getWines()
  console.log(`[Seed] Verified: ${finalWines.length} wines now in database`)
}
