// Shared demo subaccount data for the admin subaccount-switcher mockups.
// Not wired to real data. Numbers are illustrative.
window.SUBACCOUNTS = [
  { id: 'willis',    name: 'Willis Exteriors',     niche: 'Roofing & Exteriors', initials: 'WE', color: '#6366f1', health: 'good',   spend: 4200, leads: 38, appts: 12, revenue: 86400,  unread: 3, alerts: 0, plan: 'Growth',  trend: [12,18,15,22,26,24,31,38], updated: '4m ago' },
  { id: 'coastal',   name: 'Coastal Dental',       niche: 'Dental',              initials: 'CD', color: '#06b6d4', health: 'good',   spend: 5400, leads: 44, appts: 21, revenue: 132000, unread: 0, alerts: 0, plan: 'Scale',   trend: [20,24,28,26,33,38,41,44], updated: '11m ago' },
  { id: 'summit',    name: 'Summit HVAC',          niche: 'Heating & Cooling',   initials: 'SH', color: '#14b8a6', health: 'good',   spend: 3100, leads: 27, appts: 9,  revenue: 61200,  unread: 1, alerts: 0, plan: 'Growth',  trend: [10,14,12,18,20,19,24,27], updated: '2m ago' },
  { id: 'bluepeak',  name: 'BluePeak Plumbing',    niche: 'Plumbing',            initials: 'BP', color: '#3b82f6', health: 'warn',   spend: 2650, leads: 14, appts: 4,  revenue: 29800,  unread: 6, alerts: 2, plan: 'Starter', trend: [22,19,17,15,13,14,12,14], updated: '31m ago' },
  { id: 'greenleaf', name: 'GreenLeaf Landscaping',niche: 'Landscaping',         initials: 'GL', color: '#22c55e', health: 'good',   spend: 2200, leads: 19, appts: 7,  revenue: 41000,  unread: 1, alerts: 0, plan: 'Growth',  trend: [8,11,13,12,16,15,18,19],  updated: '1h ago' },
  { id: 'ironclad',  name: 'Ironclad Fitness',     niche: 'Gym & Fitness',       initials: 'IF', color: '#f97316', health: 'warn',   spend: 1800, leads: 9,  appts: 3,  revenue: 18400,  unread: 2, alerts: 1, plan: 'Starter', trend: [16,14,12,10,11,9,10,9],   updated: '48m ago' },
  { id: 'apex',      name: 'Apex Auto Detailing',  niche: 'Auto Detailing',      initials: 'AA', color: '#ef4444', health: 'good',   spend: 1500, leads: 22, appts: 11, revenue: 23500,  unread: 4, alerts: 0, plan: 'Starter', trend: [6,9,12,14,17,19,20,22],   updated: '15m ago' },
  { id: 'nova',      name: 'Nova Med Spa',         niche: 'Med Spa',             initials: 'NM', color: '#ec4899', health: 'paused', spend: 0,    leads: 0,  appts: 0,  revenue: 0,      unread: 0, alerts: 0, plan: 'Paused',  trend: [4,3,2,1,0,0,0,0],         updated: '3d ago' },
];
window.money = (n) => '$' + n.toLocaleString('en-US');
