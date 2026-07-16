export type WineType = 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Fortified';
export type Tier = 1 | 2 | 3 | 4 | 5; // 1=EVERYDAY, 2=QUALITY, 3=FINE, 4=PREMIUM, 5=ICON
export type DeliveryWindowStatus = 'planned' | 'in_transit' | 'completed';
export type DeliveryWineStatus = 'pending' | 'delivered' | 'failed';
export type ConsumptionLogStatus = 'planned' | 'consumed';

export const TIER_LABELS: Record<Tier, string> = {
  1: 'EVERYDAY',
  2: 'QUALITY',
  3: 'FINE',
  4: 'PREMIUM',
  5: 'ICON',
};

/**
 * Master wine inventory table.
 * Split quantities: quantity_in_storage (at cellar) and quantity_at_home (at home).
 */
export interface Wine {
  id: string;
  name: string;
  vintage: number;
  tier: Tier;
  region: string;
  producer?: string;
  classification?: string;
  wine_type?: WineType;
  varietal?: string;
  country?: string;
  alcohol_percent?: number;
  serving_temp_min?: number;
  serving_temp_max?: number;
  flavor_profile?: string;
  critic_ratings?: string | Record<string, number>; // "JS 97 : RP 96" or {js: 97, rp: 96}
  drinking_window_start: number;
  drinking_window_end: number;
  image_url?: string;
  format?: string; // e.g., "750ml", "1.5L", "375ml", "3L"
  purchase_price?: number; // per bottle, in the user's currency
  quantity_in_storage: number; // Bottles at cellar/storage
  quantity_at_home: number; // Bottles at home, ready to drink
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Singleton configuration table (id=1 enforced).
 */
export interface CellarConfig {
  id: 1;
  max_home_capacity: number; // Maximum bottles allowed at home
  annual_consumption_target: number; // Target bottles/year for scheduling algorithm
  min_delivery_bottles: number; // Minimum bottles required for a delivery window to be created
  created_at?: string;
  updated_at?: string;
}

/**
 * Historical record of wine consumption.
 * One entry per consumed bottle, per date.
 */
export interface ConsumptionLogEntry {
  id: string;
  wine_id: string;
  consumed_date: string; // Date wine was consumed (YYYY-MM-DD)
  notes?: string;
  created_at: string;
}

/**
 * Delivery window: a scheduled occasion to move wines from storage to home.
 */
export interface DeliveryWindow {
  id: string;
  scheduled_date: string; // Planned delivery date (YYYY-MM-DD)
  locked: boolean; // Is window manually locked (no regeneration)?
  status: DeliveryWindowStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Persists manually-edited wines for locked delivery windows.
 * Allows locked windows to survive app restarts.
 */
export interface DeliveryWindowWine {
  id: string;
  delivery_window_id: string;
  wine_id: string;
  quantity: number;
  status: DeliveryWineStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Historical record of completed deliveries.
 */
export interface DeliveryCompletionLog {
  id: string;
  wine_id: string;
  delivery_window_id: string;
  quantity_delivered: number;
  delivered_date: string; // Actual delivery date (YYYY-MM-DD)
  status: DeliveryWineStatus;
  created_at: string;
}

/**
 * Action history for traceability and debugging.
 */
export interface AuditLogEntry {
  id: string;
  action: string; // e.g., 'edit_wine_details', 'add_bottles', 'lock_delivery_window'
  wine_id?: string;
  delivery_window_id?: string;
  details: Record<string, unknown>;
  user_id?: string;
  created_at: string;
}

/**
 * In-memory consumption schedule entry (not persisted).
 * Calculated dynamically and regenerated when invalidation flag is set.
 */
export interface ConsumptionScheduleEntry {
  wine_id: string;
  planned_consumption_month: string; // YYYY-MM format
  quantity: number;
  status: 'planned' | 'consumed';
}

/**
 * In-memory delivery schedule entry (not persisted).
 * Calculated dynamically and regenerated when invalidation flag is set.
 */
export interface DeliveryScheduleEntry {
  wine_id: string;
  quantity: number;
  scheduled_date: string;
  tier: Tier;
  region: string;
  status: 'pending' | 'delivered';
}
