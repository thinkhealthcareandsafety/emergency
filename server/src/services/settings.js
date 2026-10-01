import { Settings } from '../models/index.js';
import { config } from '../config.js';

export const DEFAULT_ROLES = [
  { key: 'incident_controller', label: 'Incident Controller', color: '#c084fc', minOnDuty: 1, order: 1 },
  { key: 'fire_warden', label: 'Fire Warden', color: '#f87171', minOnDuty: 2, order: 2 },
  { key: 'first_aider', label: 'First Aider', color: '#60a5fa', minOnDuty: 2, order: 3 },
  { key: 'evacuation_marshal', label: 'Evacuation Marshal', color: '#fbbf24', minOnDuty: 2, order: 4 },
  { key: 'security', label: 'Security Response', color: '#94a3b8', minOnDuty: 1, order: 5 },
  { key: 'engineering', label: 'Engineering / Utilities', color: '#2dd4bf', minOnDuty: 1, order: 6 },
];

export async function getSettings() {
  let s = await Settings.findOne({ key: 'global' });
  if (!s) {
    s = await Settings.create({ key: 'global', roles: DEFAULT_ROLES, staleAfterHours: config.staleAfterHours });
  }
  return s;
}
