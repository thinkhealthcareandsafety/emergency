// Team → ERT role keys and colour. This is the only place to change which roles belong to which tab.
// When HONO or the team lists supply real membership, this mapping gets replaced by that data.
export const TEAMS = {
  ert: { label: 'ERT Team', color: '#2fa84f', roles: ['fire_warden', 'evacuation_marshal', 'security', 'engineering'] },
  crisis: { label: 'Crisis Management', color: '#ff8a1f', roles: ['incident_controller'] },
  firstaid: { label: 'First Aid Team', color: '#ff7a7a', roles: ['first_aider'] },
};

export const TEAM_KEYS = Object.keys(TEAMS);
