const state = { data: null, horizon: '1', raceId: null };
const horizons = ['30', '7', '1', '0'];
const labels = { '30': '30 days before', '7': '7 days before', '1': '1 day before', '0': 'Election day morning' };
const shortLabels = { '30': '30 DAYS', '7': '7 DAYS', '1': '1 DAY', '0': 'ELECTION DAY' };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const percent = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const forecast = (race, horizon = state.horizon) => race.forecasts[horizon];
const isScored = (race, horizon = state.horizon) => forecast(race, horizon)?.status === 'scored';
const scoredRaces = (horizon = state.horizon) => state.data.races.filter(race => isScored(race, horizon));

function renderHero() {
  const oneDay = state.data.summary['1'];
  const hits = scoredRaces('1').filter(race => forecast(race, '1').hit).length;
  $('hero-hits').textContent = oneDay.n ? `${hits} / ${oneDay.n}` : 'Pending';
  $('hero-brier').textContent = oneDay.brier == null ? '—' : oneDay.brier.toFixed(3);
  $('hero-sample').textContent = String(oneDay.n);
  if (oneDay.n) {
    $('hero-title').textContent = `Polymarket favored the winner in ${hits} of ${oneDay.n} races.`;
    $('hero-dek').textContent = 'A one-day-before retrospective of direct election-winner markets. The headline hit rate is only part of the story: confidence and the size of the misses matter too.';
  } else {
    $('hero-title').textContent = 'What did Polymarket expect before election day?';
    $('hero-dek').textContent = 'The market snapshots are frozen. Race scores will appear as outcomes are called and settled.';
  }
}

function renderSummary() {
  const summary = state.data.summary[state.horizon];
  const hits = scoredRaces().filter(race => forecast(race).hit).length;
  $('hit-detail').textContent = summary.n ? `${hits} of ${summary.n} favorites won at this cutoff${summary.provisional_n ? ` · ${summary.provisional_n} provisional` : ''}` : 'No races scored at this cutoff yet';
  $('brier-score').textContent = summary.brier == null ? '—' : summary.brier.toFixed(3);
  $('selected-horizon-label').textContent = shortLabels[state.horizon];
  document.querySelectorAll('[data-horizon]').forEach(button => {
    const active = button.dataset.horizon === state.horizon;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderRacePlot() {
  const races = scoredRaces().map(race => {
    const point = forecast(race);
    return { race, point, chance: point.probabilities[point.leader_index], leader: race.candidates[point.leader_index].name };
  }).sort((a, b) => b.chance - a.chance);
  $('confidence-plot').innerHTML = races.map(({race, point, chance, leader}) => {
    const status = point.hit ? 'Won' : 'Lost';
    const detail = point.hit ? `Favored ${leader}; won` : `Favored ${leader}; ${race.winner} won`;
    return `<div class="race-row"><div class="race-name">${escapeHtml(race.title)}<small>${escapeHtml(detail)}</small></div><div class="race-track"><i class="race-marker ${point.hit ? 'hit' : 'miss'}" style="left:${chance * 100}%" aria-label="${escapeHtml(status)}"></i></div><div class="race-outcome ${point.hit ? 'hit' : 'miss'}"><b>${percent(chance)}</b>${status}</div></div>`;
  }).join('') || '<p class="empty-chart">Race outcomes are pending.</p>';
}

function renderCalibration() {
  const bins = [
    {label: 'Below 50%', min: 0, max: .5},
    {label: '50–69%', min: .5, max: .7},
    {label: '70–89%', min: .7, max: .9},
    {label: '90–100%', min: .9, max: 1.001}
  ];
  const rows = scoredRaces().map(race => {
    const point = forecast(race);
    return { chance: point.probabilities[point.leader_index], hit: point.hit };
  });
  $('calibration-chart').innerHTML = bins.map(bin => {
    const group = rows.filter(row => row.chance >= bin.min && row.chance < bin.max);
    if (!group.length) return `<div class="cal-row"><div class="cal-range">${bin.label}</div><div class="cal-bars">No races in this range</div><div class="cal-count">0</div></div>`;
    const forecastMean = group.reduce((sum, row) => sum + row.chance, 0) / group.length;
    const wins = group.filter(row => row.hit).length;
    const actual = wins / group.length;
    return `<div class="cal-row"><div class="cal-range">${bin.label}</div><div class="cal-bars"><div class="cal-bar-line"><div class="cal-track"><div class="cal-fill blue" style="width:${forecastMean * 100}%"></div></div><div class="cal-bar-label">Forecast <b>${percent(forecastMean)}</b></div></div><div class="cal-bar-line"><div class="cal-track"><div class="cal-fill ink" style="width:${actual * 100}%"></div></div><div class="cal-bar-label">Won <b>${percent(actual)}</b></div></div></div><div class="cal-count">${group.length}<small>${wins} won</small></div></div>`;
  }).join('');
}

function renderSurprises() {
  const all = scoredRaces().sort((a, b) => forecast(b).brier - forecast(a).brier);
  const total = all.reduce((sum, race) => sum + forecast(race).brier, 0);
  const topTwo = all.slice(0, 2).reduce((sum, race) => sum + forecast(race).brier, 0);
  $('surprise-dek').textContent = total ? `The two largest errors account for ${percent(topTwo / total)} of this cohort’s total squared error at the selected cutoff. Each bar is a race’s share of that total.` : 'Scores will appear as results arrive.';
  $('surprises').innerHTML = all.slice(0, 6).map(race => {
    const point = forecast(race);
    const favorite = race.candidates[point.leader_index].name;
    const share = point.brier / total;
    const detail = point.hit ? `Favored ${favorite} at ${percent(point.probabilities[point.leader_index])}; won` : `Favored ${favorite} at ${percent(point.probabilities[point.leader_index])}; ${race.winner} won`;
    return `<a class="surprise" href="${escapeHtml(race.url)}" target="_blank" rel="noopener"><div><span class="surprise-title">${escapeHtml(race.title)}</span><span class="surprise-detail">${escapeHtml(detail)}</span></div><div class="surprise-bar-area"><div class="surprise-bar-track"><span class="surprise-bar-fill" style="width:${share * 100}%"></span></div><span class="surprise-share">${percent(share)}</span></div></a>`;
  }).join('') || '<p class="empty-chart">No scored races yet.</p>';
}

function renderRace() {
  const race = state.data.races.find(row => String(row.id) === String(state.raceId)) || state.data.races[0];
  if (!race) return;
  state.raceId = race.id;
  $('race-select').value = String(race.id);
  const unresolved = race.winner_index == null;
  const selected = forecast(race);
  const focus = unresolved ? (selected?.leader_index ?? horizons.map(h => forecast(race, h)?.leader_index).find(index => index != null)) : race.winner_index;
  $('race-status-label').textContent = unresolved ? 'FAVORITE · RESULT PENDING' : race.outcome_status === 'provisional' ? 'CALLED WINNER · PROVISIONAL' : 'EVENTUAL WINNER';
  $('race-chance-label').textContent = unresolved ? 'FAVORITE’S CHANCE' : 'WINNER’S CHANCE';
  $('race-winner').textContent = unresolved ? (race.candidates[focus]?.name || 'Awaiting result') : race.winner;
  $('race-link').href = race.url;
  $('race-probability').textContent = selected?.probabilities && focus != null ? percent(selected.probabilities[focus]) : '—';

  const width = 960, height = 260, left = 45, right = 22, top = 26, bottom = 43;
  const x = index => left + index / 3 * (width - left - right);
  const y = probability => top + (1 - probability) * (height - top - bottom);
  const grid = [0, .25, .5, .75, 1].map(p => `<line x1="${left}" y1="${y(p)}" x2="${width - right}" y2="${y(p)}" stroke="#d7dde4"/><text x="${left - 9}" y="${y(p) + 4}" text-anchor="end" fill="#637080" font-family="IBM Plex Mono" font-size="10">${Math.round(p * 100)}%</text>`).join('');
  const points = horizons.map((h, index) => ({h, index, point: forecast(race, h)})).filter(item => focus != null && item.point.probabilities?.[focus] != null);
  const path = points.map((item, index) => `${index ? 'L' : 'M'} ${x(item.index)} ${y(item.point.probabilities[focus])}`).join(' ');
  const line = path ? `<path d="${path}" fill="none" stroke="#245ca3" stroke-width="3"/>` : '';
  const dots = points.map(item => `<circle cx="${x(item.index)}" cy="${y(item.point.probabilities[focus])}" r="5" fill="#245ca3" stroke="#fff" stroke-width="2"><title>${labels[item.h]}: ${percent(item.point.probabilities[focus])}</title></circle><text x="${x(item.index)}" y="${y(item.point.probabilities[focus]) - 12}" text-anchor="middle" fill="#245ca3" font-family="IBM Plex Mono" font-size="11" font-weight="600">${percent(item.point.probabilities[focus])}</text>`).join('');
  const xlabels = horizons.map((h, index) => `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" fill="#586577" font-family="IBM Plex Mono" font-size="10">${shortLabels[h]}</text>`).join('');
  $('race-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${line}${dots}${xlabels}</svg>`;
  $('race-points').innerHTML = horizons.map(h => {
    const point = forecast(race, h);
    const observed = point.observations?.find(item => item.market_id === race.candidates[focus]?.id);
    const time = observed ? new Date(observed.observed_at).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',timeZone:'UTC'}) + ' UTC' : 'No usable price';
    const probability = point.probabilities && focus != null ? percent(point.probabilities[focus]) : '—';
    return `<div><span>${shortLabels[h]}</span><span class="point-value">${probability}</span><span class="point-time">Observed ${escapeHtml(time)}</span></div>`;
  }).join('');
}

function render() { renderSummary(); renderRacePlot(); renderCalibration(); renderSurprises(); renderRace(); }
async function init() {
  try {
    const response = await fetch('scorecard.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    $('edition-label').textContent = state.data.label;
    $('method-discovered').textContent = state.data.discovered_events;
    $('method-included').textContent = state.data.included_races;
    $('method-failures').textContent = state.data.fetch_failures;
    $('race-select').innerHTML = state.data.races.map(race => `<option value="${escapeHtml(race.id)}">${escapeHtml(race.title)}</option>`).join('');
    state.raceId = scoredRaces('1').sort((a, b) => forecast(b, '1').brier - forecast(a, '1').brier)[0]?.id || state.data.races[0]?.id;
    document.querySelectorAll('[data-horizon]').forEach(button => button.addEventListener('click', () => { state.horizon = button.dataset.horizon; render(); }));
    $('race-select').addEventListener('change', event => { state.raceId = event.target.value; renderRace(); });
    renderHero();
    render();
  } catch (error) {
    $('hero-dek').textContent = `The data could not be loaded: ${error.message}`;
  }
}
init();
