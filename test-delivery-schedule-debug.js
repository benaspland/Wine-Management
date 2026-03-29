#!/usr/bin/env node
const wines = [
  { id: 'w1', tier: 4, drinking_window_start: 2022, quantity: 3 },
  { id: 'w2', tier: 4, drinking_window_start: 2025, quantity: 1 },
  { id: 'w3', tier: 5, drinking_window_start: 2025, quantity: 1 },
  { id: 'w4', tier: 3, drinking_window_start: 2025, quantity: 2 },
  { id: 'w5', tier: 4, drinking_window_start: 2025, quantity: 3 },
  { id: 'w6', tier: 5, drinking_window_start: 2025, quantity: 1 },
];

console.log('Wines:', wines);
console.log('Total bottles:', wines.reduce((s, w) => s + w.quantity, 0));

const currentYear = 2026;
const minBottles = 24;

for (let year = 2026; year <= 2030; year++) {
  const unscheduled = wines;
  const eligible = unscheduled.filter(w => {
    // Tier 4-5 cannot be delivered before 2029
    if (w.tier >= 4 && year < 2029) {
      return false;
    }
    return true;
  });

  const availableCapacity = 80;
  const batch = eligible.slice(0, eligible.length); // Take all eligible
  const bottleCount = batch.reduce((s, w) => s + w.quantity, 0);

  console.log(`${year}: eligible=${eligible.length}, batch=${bottleCount} bottles - ${bottleCount >= minBottles ? 'DELIVER' : 'TOO SMALL'}`);
}
