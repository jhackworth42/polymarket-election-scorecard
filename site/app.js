const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const percent = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const points = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
const mean = values => values.reduce((sum,value) => sum + value, 0) / values.length;
let data;
const verified = () => data.races.filter(race => race.outcome_status === 'settled');
const scored = (race, key) => race.forecasts[key]?.status === 'scored';
const monday = () => verified().filter(race => scored(race, 'night_before'));
function renderStats() {
  const races = data.races;
  const results = verified();
  const sample = monday();
  const hits = sample.filter(race => race.forecasts.night_before.hit).length;
  $('kpi-races').textContent = races.length.toLocaleString();
  $('kpi-settled').textContent = String(results.length);
  $('kpi-settled-note').textContent = `of ${races.length} tracked races`;
  $('kpi-hit').textContent = sample.length ? percent(hits / sample.length) : 'Pending';
  $('kpi-hit-note').textContent = sample.length ? `${hits} of ${sample.length} verified races` : 'Awaiting verified results';
  $('kpi-brier').textContent = sample.length ? mean(sample.map(race => race.forecasts.night_before.brier)).toFixed(4) : 'Pending';
  const clear = sample.filter(race => race.segment === 'clear').length;
  $('sample-note').textContent = !sample.length ? 'Results have not been verified yet; accuracy and calibration will appear as races settle.' : sample.length < races.length ? `Early sample: ${sample.length} of ${races.length} races have verified results. ${clear} of those ${sample.length} were rated clearer a week out. The overall win rate will change as closer races settle.` : 'All tracked races with usable Monday prices have verified results.';
  const updated = new Date(data.generated_at).toLocaleString('en-US', {timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  $('updated-note').textContent = `Results refreshed ${updated} ET · ${data.fetch_failures} price fetch failures · Monday snapshot Nov. 2, 11:59 p.m. ET`;
}
function renderMisses() {
  const sample = monday();
  const misses = sample.filter(race => !race.forecasts.night_before.hit).sort((a,b) => b.forecasts.night_before.probabilities[b.forecasts.night_before.leader_index] - a.forecasts.night_before.probabilities[a.forecasts.night_before.leader_index]).slice(0,8);
  $('miss-list').innerHTML = misses.length ? misses.map(race => {
    const forecast = race.forecasts.night_before;
    const favorite = race.candidates[forecast.leader_index].name;
    const price = forecast.probabilities[forecast.leader_index];
    return `<a class="miss-row" href="${safe(race.url)}" target="_blank" rel="noopener"><strong>${safe(race.title)}</strong><span>${safe(favorite)} <b>${percent(price)}</b></span><span>${safe(race.winner)}</span></a>`;
  }).join('') : `<div class="empty-state">${sample.length ? `No Monday favorite has lost among the ${sample.length} verified races so far.` : 'Awaiting verified race results. The biggest misses will appear here as outcomes settle.'}</div>`;
}
function renderConfidence() {
  const filter = $('confidence-filter').value;
  const sample = monday().filter(race => filter === 'all' || race.category === filter || filter === 'contested' && race.segment === 'contested');
  if (!sample.length) {
    $('confidence-chart').innerHTML = `<div class="empty-state">${verified().length ? 'No verified races with a Monday price match this filter yet.' : 'Awaiting verified results. This chart will compare Monday confidence with actual wins.'}</div>`;
    return;
  }
  const rows = [];
  for (let i=0;i<10;i++) {
    const group = sample.filter(race => {const p=race.movement?.night_before_favorite_probability; return p != null && p >= i/10 && (i === 9 ? p <= 1 : p < (i+1)/10);});
    if (!group.length) continue;
    const expected = mean(group.map(race => race.movement.night_before_favorite_probability));
    const won = group.filter(race => race.forecasts.night_before.hit).length;
    const actual = won/group.length;
    rows.push(`<div class="confidence-row"><strong>${i*10}–${(i+1)*10}%</strong><div class="confidence-plot"><div class="actual-bar" style="width:${actual*100}%"></div><i class="expected-mark" style="left:${expected*100}%"></i><span>${percent(actual)} won · ${percent(expected)} forecast</span></div><span class="confidence-count">${won} / ${group.length}</span></div>`);
  }
  $('confidence-chart').innerHTML = rows.join('');
}
function renderTime() {
  const checkpoints = [['30','30 days out'],['7','7 days out'],['1','1 day out'],['night_before','Mon. 11:59 p.m.'],['preclose','Tue. 5 p.m.']];
  $('time-list').innerHTML = checkpoints.map(([key,label]) => {
    const sample = verified().filter(race => scored(race,key));
    if (!sample.length) return `<div class="time-row"><strong>${label}</strong><span class="time-bar"><i style="width:0"></i><b>Pending</b></span><span>—</span><span>0</span></div>`;
    const hits = sample.filter(race => race.forecasts[key].hit).length;
    const rate = hits/sample.length;
    const brier = mean(sample.map(race => race.forecasts[key].brier));
    return `<div class="time-row"><strong>${label}</strong><span class="time-bar"><i style="width:${rate*100}%"></i><b>${percent(rate)} won</b></span><span class="time-brier">${brier.toFixed(4)}</span><span class="time-count">${hits} / ${sample.length}</span></div>`;
  }).join('');
}
function renderMovement() {
  const races = data.races.filter(race => race.movement);
  const movers = [...races].sort((a,b) => Math.abs(b.movement.biggest_move_pp) - Math.abs(a.movement.biggest_move_pp));
  $('movement-flips').textContent = String(races.filter(race => race.movement.leader_flipped).length);
  $('movement-biggest').textContent = movers.length ? `${Math.abs(movers[0].movement.biggest_move_pp).toFixed(1)} pts` : '—';
  $('mover-list').innerHTML = movers.slice(0,8).map(race => {
    const movement = race.movement;
    const index = movement.biggest_mover_index;
    const before = race.forecasts.night_before.probabilities[index];
    const after = race.forecasts.preclose.probabilities[index];
    const result = race.outcome_status === 'settled' ? race.winner : race.outcome_status === 'provisional' ? `${race.winner} (called)` : 'Pending';
    return `<a class="mover-row" href="${safe(race.url)}" target="_blank" rel="noopener"><span><span class="race-title">${safe(race.title)}</span><span class="candidate">${safe(race.candidates[index].name)}</span></span><span class="prices">${percent(before)} → ${percent(after)}</span><span class="move ${movement.biggest_move_pp >= 0 ? 'positive' : 'negative'}">${points(movement.biggest_move_pp)}</span><span class="result">${safe(result)}</span></a>`;
  }).join('');
}
async function init() {
  try {
    const response = await fetch('data/2026.json');
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    data = await response.json();
    $('confidence-filter').addEventListener('change', renderConfidence);
    renderStats(); renderMisses(); renderConfidence(); renderTime(); renderMovement();
  } catch(error) { $('updated-note').textContent = `Scorecard data could not be loaded: ${error.message}`; }
}
init();
