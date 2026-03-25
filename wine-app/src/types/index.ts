export type WineType = 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Fortified';
export type WineLocation = 'home' | 'storage';
export type Tier = 1 | 2 | 3 | 4 | 5; // 1=EVERYDAY, 2=QUALITY, 3=FINE, 4=PREMIUM, 5=ICON

export const TIER_LABELS: Record<Tier, string> = {
  1: 'EVERYDAY',
  2: 'QUALITY',
  3: 'FINE',
  4: 'PREMIUM',
  5: 'ICON',
};

export interface Wine {
  id: string;
  producer: string;
  name: string;
  vintage: number;
  country: string;
  region: string;
  classification: string; // e.g., "Reserva", "DOCG", "Grand Cru"
  wine_type: WineType;
  varietal: string;
  tier: Tier;
  location: WineLocation;
  quantity: number;
  format: string; // e.g., "750ml", "1.5L", "375ml"
  drinking_window_start: number;
  drinking_window_end: number;
  alcohol_percent: number;
  serving_temp_min: number;
  serving_temp_max: number;
  notes: string;
  critic_ratings: Record<string, number>; // e.g., { js: 97, rp: 96, we: 96, ta: 94 }
  flavor_profile: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CellarConfig {
  max_slots: number;
  current_slots: number;
}

export interface ConsumptionLogEntry {
  id: string;
  wine_id: string;
  quantity: number;
  consumed_at: string;
  notes?: string;
}

export interface DeliveryScheduleEntry {
  id: string;
  wine_id: string;
  quantity: number;
  scheduled_date: string;
  from_location: WineLocation;
  to_location: WineLocation;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
}
