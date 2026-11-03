const state = { data: null, horizon: '1', segment: 'contested', raceId: null };
const horizons = ['30', '21', '14', '7', '3', '1', '0'];
const labels = { '30':'30 days', '21':'21 days', '14':'14 days', '7':'7 days', '3':'3 days', '1':'1 day', '0':'Election morning' };
const shortLabels = { '30':'30D', '21':'21D', '14':'14D', '7':'7D', '3':'3D', '1':'1D', '0':'AM' };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const percent = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const forecast = (race, horizon = state.horizon) => race.forecasts[horizon];
const isScored = (race, horizon = state.horizon) => forecast(race, horizon)?.status === 'scored';
const scoredRaces = (horizon = state.horizon) => state.data.races.filter(race => isScored(race, horizon));
const groupRaces = (group, horizon = state.horizon) => scoredRaces(horizon).filter(race => group === 'all' || race.segment === group);
const groupSummary = (group, horizon = state.horizon) => group === 'all' ? state.data.summary[horizon] : state.data.summary_by_segment[horizon][group];

function renderHeroAndKpis() {
  const contested = groupSummary('contested', '1');
  const clear = groupSummary('clear', '1');
  const paired = state.data.paired_30_to_1;
  $('hero-contested').textContent = contested.n ? `${contested.hits}/${contested.n}` : 'Pending';
  $('hero-clear').textContent = clear.n ? `${clear.hits}/${clear.n}` : 'Pending';
  if (contested.n && clear.n) {
    $('hero-title').textContent = `The market missed ${contested.n - contested.hits} of ${contested.n} contested races.`;
    $('hero-dek').textContent = `One day before the election, favorites won ${contested.hits} of ${contested.n} races that looked uncertain a week earlier, versus ${clear.hits} of ${clear.n} clearer races. The timeline shows what changed over the month—and what did not.`;
  }
  $('kpi-contested').textContent = contested.n ? `${contested.hits} / ${contested.n}` : '—';
  $('kpi-contested-detail').textContent = contested.n ? `Brier ${contested.brier.toFixed(3)} · favorites won` : 'Awaiting results';
  $('kpi-clear').textContent = clear.n ? `${clear.hits} / ${clear.n}` : '—';
  $('kpi-clear-detail').textContent = clear.n ? `Brier ${clear.brier.toFixed(3)} · favorites won` : 'Awaiting results';
  $('kpi-improvement').textContent = paired.improvement_fraction == null ? '—' : `${Math.round(paired.improvement_fraction * 100)}%`;
  $('kpi-improvement-detail').textContent = paired.n ? `Less Brier error · same ${paired.n} races` : 'Awaiting results';
  $('kpi-flips').textContent = paired.n ? `${paired.favorite_flips} / ${paired.n}` : '—';
  $('kpi-flips-detail').textContent = 'Favorite changed, 30 days to 1 day';
  if (paired.n) {
    const chartContested = state.data.timeline['1'].contested.n;
    const omitted = contested.n - chartContested;
    const omittedNames = state.data.races.filter(race => race.segment === 'contested' && isScored(race, '1') && !isScored(race, '30')).map(race => race.title);
    $('time-note').textContent = `Same ${paired.n} races at both endpoints: ${chartContested} contested and ${state.data.timeline['1'].clear.n} clearer. ${omitted ? `${omittedNames.join(', ')} had no usable 30-day price, so ${omitted === 1 ? 'it appears' : 'they appear'} in the one-day KPI but not this line.` : ''} Actual observation times are in the data.`;
  } else $('time-note').textContent = 'Time scores will appear as results are called and settled.';
}

function renderTimeChart() {
  const width = 1000, height = 340, left = 65, right = 155, top = 28, bottom = 48;
  const entries = horizons.flatMap(h => ['contested','clear'].map(segment => state.data.timeline[h]?.[segment]?.brier)).filter(value => value != null);
  if (!entries.length) { $('time-chart').innerHTML = '<p class="empty-chart">Results are pending. The pre-election price snapshots are already stored.</p>'; return; }
  const ceiling = Math.max(.3, Math.ceil(Math.max(...entries) * 10) / 10);
  const x = h => left + (30 - Number(h)) / 30 * (width - left - right);
  const y = value => top + (1 - value / ceiling) * (height - top - bottom);
  const grid = Array.from({length: Math.round(ceiling * 10) + 1}, (_, i) => i / 10).map(value => `<line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}" stroke="#d9dee5"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end" fill="#5e6a77" font-size="11" font-family="IBM Plex Mono">${value.toFixed(1)}</text>`).join('');
  const ticks = ['30','21','14','7','0'].map(h => `<text x="${x(h)}" y="${height-12}" text-anchor="middle" fill="#5e6a77" font-size="11" font-family="IBM Plex Mono">${h === '0' ? 'ELECTION AM' : h+' DAYS'}</text>`).join('');
  const series = [
    {key:'contested', color:'#bd3440', label:'CONTESTED'},
    {key:'clear', color:'#245ca3', label:'CLEARER'}
  ];
  const paths = series.map(item => {
    const points = horizons.map(h => ({h, ...state.data.timeline[h][item.key]})).filter(point => point.brier != null);
    if (!points.length) return '';
    const line = points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.h)} ${y(point.brier)}`).join(' ');
    const circles = points.map(point => `<circle cx="${x(point.h)}" cy="${y(point.brier)}" r="5" fill="${item.color}" stroke="white" stroke-width="2"><title>${item.label}: ${labels[point.h]} · Brier ${point.brier.toFixed(3)} · ${point.n} races</title></circle>`).join('');
    const last = points[points.length-1];
    const endLabel = `<text x="${x(last.h)+10}" y="${y(last.brier)+4}" fill="${item.color}" font-size="12" font-family="Public Sans" font-weight="700">${item.label} · ${last.brier.toFixed(3)}</text>`;
    return `<path d="${line}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${circles}${endLabel}`;
  }).join('');
  $('time-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${paths}${ticks}</svg>`;
  $('time-direct-labels').innerHTML = '<span><i class="series-line red"></i> Contested at 7 days</span><span><i class="series-line blue"></i> Clearer at 7 days</span>';
}

function renderControlsAndSummary() {
  const summary = groupSummary(state.segment);
  const hits = summary.hits ?? (summary.n ? Math.round(summary.hit_rate * summary.n) : 0);
  const groupLabel = state.segment === 'all' ? 'all races' : state.segment === 'contested' ? 'contested races' : 'clearer races';
  const cutoffLabel = state.horizon === '0' ? 'election morning' : `${labels[state.horizon]} before the election`;
  $('hit-detail').textContent = summary.n ? `${hits} of ${summary.n} favorites won · ${groupLabel} · ${cutoffLabel}` : `No scored ${groupLabel} at this cutoff`;
  $('brier-score').textContent = summary.brier == null ? '—' : summary.brier.toFixed(3);
  $('selected-horizon-label').textContent = shortLabels[state.horizon];
  document.querySelectorAll('[data-horizon]').forEach(button => {
    const active = button.dataset.horizon === state.horizon;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-segment]').forEach(button => {
    const active = button.dataset.segment === state.segment;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function sparkline(race, focusIndex, isMiss) {
  const width = 340, height = 45, left = 3, right = 3, top = 4, bottom = 4;
  const x = h => left + (30 - Number(h)) / 30 * (width-left-right);
  const y = p => top + (1 - p) * (height-top-bottom);
  const points = horizons.map(h => ({h, p: forecast(race,h).probabilities?.[focusIndex]})).filter(point => point.p != null);
  if (!points.length) return '';
  const path = points.map((point,index) => `${index ? 'L' : 'M'} ${x(point.h)} ${y(point.p)}`).join(' ');
  const color = isMiss ? '#bd3440' : '#245ca3';
  const dots = points.map(point => `<circle cx="${x(point.h)}" cy="${y(point.p)}" r="2.6" fill="${color}"><title>${labels[point.h]}: ${percent(point.p)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${y(.5)}" x2="${width}" y2="${y(.5)}" stroke="#cfd6dd" stroke-dasharray="2 3"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}</svg>`;
}

function renderRaceList() {
  const races = groupRaces(state.segment).sort((a,b) => forecast(b).brier - forecast(a).brier);
  $('confidence-plot').innerHTML = races.map(race => {
    const point = forecast(race), favorite = race.candidates[point.leader_index].name;
    const chance = point.probabilities[point.leader_index];
    const detail = point.hit ? `Favored ${favorite}; won` : `Favored ${favorite}; ${race.winner} won`;
    return `<div class="race-row"><div class="race-name">${escapeHtml(race.title)}<small>${escapeHtml(detail)}</small></div><div class="race-trajectory">${sparkline(race,race.winner_index,!point.hit)}</div><div class="race-outcome ${point.hit ? 'hit' : 'miss'}"><b>${percent(chance)}</b><span>${point.hit ? 'favorite won' : 'favorite lost'}</span></div></div>`;
  }).join('') || '<p class="empty-chart">Race outcomes are pending.</p>';
}

function renderRaceExplorer() {
  const race = state.data.races.find(row => String(row.id) === String(state.raceId)) || state.data.races[0];
  if (!race) return;
  $('race-select').value = String(race.id);
  const unresolved = race.winner_index == null;
  const selected = forecast(race);
  const focus = unresolved ? (selected?.leader_index ?? horizons.map(h => forecast(race,h)?.leader_index).find(index => index != null)) : race.winner_index;
  $('race-status-label').textContent = unresolved ? 'CURRENT FAVORITE · RESULT PENDING' : race.outcome_status === 'provisional' ? 'CALLED WINNER · PROVISIONAL' : 'EVENTUAL WINNER';
  $('race-chance-label').textContent = unresolved ? 'FAVORITE’S CHANCE' : 'WINNER’S CHANCE';
  $('race-winner').textContent = unresolved ? (race.candidates[focus]?.name || 'Awaiting result') : race.winner;
  $('race-link').href = race.url;
  $('race-probability').textContent = selected?.probabilities && focus != null ? percent(selected.probabilities[focus]) : '—';
  const width = 960, height = 260, left = 45, right = 22, top = 26, bottom = 43;
  const x = h => left + (30 - Number(h)) / 30 * (width-left-right);
  const y = p => top + (1-p) * (height-top-bottom);
  const grid = [0,.25,.5,.75,1].map(p => `<line x1="${left}" y1="${y(p)}" x2="${width-right}" y2="${y(p)}" stroke="#d7dde4"/><text x="${left-8}" y="${y(p)+4}" text-anchor="end" fill="#637080" font-family="IBM Plex Mono" font-size="10">${Math.round(p*100)}%</text>`).join('');
  const points = horizons.map(h => ({h,p:forecast(race,h).probabilities?.[focus]})).filter(point => point.p != null);
  const path = points.map((point,index) => `${index ? 'L' : 'M'} ${x(point.h)} ${y(point.p)}`).join(' ');
  const line = path ? `<path d="${path}" fill="none" stroke="#245ca3" stroke-width="3"/>` : '';
  const dots = points.map(point => `<circle cx="${x(point.h)}" cy="${y(point.p)}" r="5" fill="#245ca3" stroke="white" stroke-width="2"><title>${labels[point.h]}: ${percent(point.p)}</title></circle>`).join('');
  const ticks = ['30','21','14','7','0'].map(h => `<text x="${x(h)}" y="${height-10}" text-anchor="middle" fill="#586577" font-family="IBM Plex Mono" font-size="10">${h==='0'?'AM':h+'D'}</text>`).join('');
  $('race-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${line}${dots}${ticks}</svg>`;
  $('race-points').innerHTML = horizons.map(h => {
    const point = forecast(race,h);
    const observed = point.observations?.find(item => item.market_id === race.candidates[focus]?.id);
    const time = observed ? new Date(observed.observed_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',timeZone:'UTC'})+' UTC' : 'No usable price';
    return `<div><span>${shortLabels[h]}</span><span class="point-value">${point.probabilities && focus != null ? percent(point.probabilities[focus]) : '—'}</span><span class="point-time">Observed ${escapeHtml(time)}</span></div>`;
  }).join('');
  const oneDay = forecast(race,'1');
  if (oneDay.status === 'scored') {
    const favorite = race.candidates[oneDay.leader_index].name;
    $('race-story').textContent = oneDay.hit ? `One day out, ${favorite} was favored at ${percent(oneDay.probabilities[oneDay.leader_index])} and won.` : `One day out, the market favored ${favorite} at ${percent(oneDay.probabilities[oneDay.leader_index])}. ${race.winner} won; the market gave that winner ${percent(oneDay.winner_probability)}.`;
  } else $('race-story').textContent = 'The result is pending.';
}

function renderSurprises() {
  const races = scoredRaces().sort((a,b) => forecast(b).brier - forecast(a).brier);
  const total = races.reduce((sum,race) => sum+forecast(race).brier,0);
  const topTwo = races.slice(0,2).reduce((sum,race) => sum+forecast(race).brier,0);
  $('surprise-dek').textContent = total ? `Across all ${races.length} scored races, the two largest errors account for ${percent(topTwo/total)} of the total at this cutoff. A confident miss costs more than a narrow miss.` : 'Scores will appear as results arrive.';
  $('surprises').innerHTML = races.slice(0,6).map(race => {
    const point = forecast(race), favorite = race.candidates[point.leader_index].name, share = point.brier/total;
    const detail = point.hit ? `Favored ${favorite} at ${percent(point.probabilities[point.leader_index])}; won` : `Favored ${favorite} at ${percent(point.probabilities[point.leader_index])}; ${race.winner} won`;
    return `<a class="surprise" href="${escapeHtml(race.url)}" target="_blank" rel="noopener"><div><span class="surprise-title">${escapeHtml(race.title)}</span><span class="surprise-detail">${escapeHtml(detail)}</span></div><div class="surprise-bar-area"><div class="surprise-bar-track"><span class="surprise-bar-fill" style="width:${share*100}%"></span></div><span class="surprise-share">${percent(share)}</span></div></a>`;
  }).join('') || '<p class="empty-chart">No scored races yet.</p>';
}

function renderCalibration() {
  const bins = [{label:'Below 50%',min:0,max:.5},{label:'50–69%',min:.5,max:.7},{label:'70–89%',min:.7,max:.9},{label:'90–100%',min:.9,max:1.001}];
  const rows = scoredRaces().map(race => { const point=forecast(race); return {chance:point.probabilities[point.leader_index],hit:point.hit}; });
  $('calibration-chart').innerHTML = bins.map(bin => {
    const group = rows.filter(row => row.chance>=bin.min && row.chance<bin.max);
    if (!group.length) return `<div class="cal-row"><div class="cal-range">${bin.label}</div><div class="cal-bars">No races in this range</div><div class="cal-count">0</div></div>`;
    const predicted=group.reduce((sum,row)=>sum+row.chance,0)/group.length, wins=group.filter(row=>row.hit).length, actual=wins/group.length;
    return `<div class="cal-row"><div class="cal-range">${bin.label}</div><div class="cal-bars"><div class="cal-bar-line"><div class="cal-track"><div class="cal-fill blue" style="width:${predicted*100}%"></div></div><div class="cal-bar-label">Forecast <b>${percent(predicted)}</b></div></div><div class="cal-bar-line"><div class="cal-track"><div class="cal-fill ink" style="width:${actual*100}%"></div></div><div class="cal-bar-label">Won <b>${percent(actual)}</b></div></div></div><div class="cal-count">${group.length}<small>${wins} won</small></div></div>`;
  }).join('');
}

function render() { renderControlsAndSummary();renderRaceList();renderRaceExplorer();renderSurprises();renderCalibration(); }
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
    state.raceId = scoredRaces('1').sort((a,b)=>forecast(b,'1').brier-forecast(a,'1').brier)[0]?.id || state.data.races[0]?.id;
    document.querySelectorAll('[data-horizon]').forEach(button => button.addEventListener('click', () => {state.horizon=button.dataset.horizon;render();}));
    document.querySelectorAll('[data-segment]').forEach(button => button.addEventListener('click', () => {state.segment=button.dataset.segment;render();}));
    $('race-select').addEventListener('change', event => {state.raceId=event.target.value;renderRaceExplorer();});
    renderHeroAndKpis();renderTimeChart();render();
  } catch (error) { $('hero-dek').textContent = `The data could not be loaded: ${error.message}`; }
}
init();
