const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pct = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const points = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
let races = [];
function render() {
  const query = $('search').value.trim().toLowerCase();
  const office = $('office').value;
  const segment = $('segment').value;
  const threshold = Number($('movement').value) || 0;
  const sort = $('sort').value;
  const visible = races.filter(race =>
    (!query || `${race.title} ${race.candidates.map(candidate => candidate.name).join(' ')}`.toLowerCase().includes(query)) &&
    (office === 'all' || race.category === office) &&
    (segment === 'all' || race.segment === segment) &&
    Math.abs(race.movement.biggest_move_pp) >= threshold
  );
  visible.sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'night' ? b.movement.night_before_favorite_probability - a.movement.night_before_favorite_probability : Math.abs(b.movement.biggest_move_pp) - Math.abs(a.movement.biggest_move_pp));
  $('visible-count').textContent = visible.length.toLocaleString();
  $('inventory-note').textContent = `of ${races.length.toLocaleString()} races with fresh prices at both cutoffs`;
  $('race-table').innerHTML = visible.map(race => {
    const movement = race.movement;
    const beforeIndex = movement.night_before_leader_index;
    const afterIndex = movement.preclose_leader_index;
    const before = race.forecasts.night_before.probabilities[beforeIndex];
    const after = race.forecasts.preclose.probabilities[afterIndex];
    const result = race.outcome_status === 'pending' ? 'Pending' : `${race.winner ?? '—'}${race.outcome_status === 'provisional' ? ' · called' : ' · settled'}`;
    return `<tr><td><a href="${safe(race.url)}" target="_blank" rel="noopener">${safe(race.title)} ↗</a></td><td>${safe(race.category)}</td><td><span class="table-candidate">${safe(race.candidates[beforeIndex].name)}</span><strong>${pct(before)}</strong></td><td><span class="table-candidate">${safe(race.candidates[afterIndex].name)}</span><strong>${pct(after)}</strong></td><td>${movement.leader_flipped ? '<span class="flip-label">Flipped</span>' : '—'}</td><td class="${movement.biggest_move_pp >= 0 ? 'positive' : 'negative'}">${points(movement.biggest_move_pp)}</td><td>${safe(result)}</td></tr>`;
  }).join('') || '<tr><td colspan="7">No races match these filters.</td></tr>';
}
async function init() {
  try {
    const response = await fetch('data/2026.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    races = data.races.filter(race => race.movement);
    ['search','office','segment','movement','sort'].forEach(id => $(id).addEventListener(id === 'search' ? 'input' : 'change', render));
    render();
  } catch(error) { $('inventory-note').textContent = `Could not load race data: ${error.message}`; }
}
init();
