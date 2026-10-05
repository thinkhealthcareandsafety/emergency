// Team → ERT role keys. This is the only place to change which roles belong to which tab.
// When HONO or the team lists supply real membership, this mapping gets replaced by that data.
export const TEAMS = {
  ert: { label: 'ERT Team', roles: ['fire_warden', 'evacuation_marshal', 'security', 'engineering'] },
  crisis: { label: 'Crisis Management', roles: ['incident_controller'] },
  firstaid: { label: 'First Aid Team', roles: ['first_aider'] },
};

export const TEAM_KEYS = Object.keys(TEAMS);
