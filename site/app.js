const state = { data: null, horizon: "1", raceId: null };
const labels = { "30": "30 days out", "7": "7 days out", "1": "1 day out", "0": "Election day" };
const shortLabels = { "30": "30 DAYS", "7": "7 DAYS", "1": "1 DAY", "0": "ELECTION DAY" };
const horizons = ["30", "7", "1", "0"];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const pct = (n) => n == null ? "—" : `${Math.round(n * 100)}%`;
const forecast = (race, h = state.horizon) => race.forecasts[h];
const scored = (race, h = state.horizon) => forecast(race, h)?.status === "scored";

function renderSummary() {
  const s = state.data.summary[state.horizon];
  $("hit-rate").textContent = pct(s.hit_rate);
  $("brier-score").textContent = s.brier == null ? "—" : s.brier.toFixed(3);
  $("race-count").textContent = String(s.n);
  const hits = state.data.races.filter(r => scored(r) && forecast(r).hit).length;
  $("hit-detail").textContent = s.n ? `${hits} of ${s.n} favorites won${s.provisional_n ? ` · ${s.provisional_n} provisional` : ""}` : "Awaiting resolved or called races";
  $("coverage-detail").textContent = `${state.data.included_races} included · ${state.data.discovered_events} discovered`;
  $("selected-horizon-label").textContent = shortLabels[state.horizon];
  document.querySelectorAll("[data-horizon]").forEach(button => {
    const active = button.dataset.horizon === state.horizon;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderPlot() {
  const rows = state.data.races.filter(r => scored(r)).map(r => ({
    race: r, p: Math.max(...forecast(r).probabilities.filter(p => p != null)), hit: forecast(r).hit
  })).sort((a, b) => a.p - b.p);
  const width = 1000, height = 250, left = 65, right = 30, top = 28, bottom = 52;
  const x = p => left + p * (width - left - right);
  const lines = [0,.2,.4,.6,.8,1].map(p => `<line x1="${x(p)}" y1="${top}" x2="${x(p)}" y2="${height-bottom}" stroke="#466057" stroke-dasharray="3 6"/><text x="${x(p)}" y="${height-19}" text-anchor="middle" fill="#b8c8bb" font-family="IBM Plex Mono" font-size="12">${Math.round(p*100)}%</text>`).join("");
  const dots = rows.map((row, i) => {
    const cy = top + 18 + ((i * 47) % (height - top - bottom - 36));
    const cx = Math.max(left + 3, Math.min(width - right - 3, x(row.p)));
    return `<circle cx="${cx}" cy="${cy}" r="${row.hit ? 6 : 7}" fill="${row.hit ? "#83c8a8" : "#20332d"}" stroke="${row.hit ? "#83c8a8" : "#ed9a7c"}" stroke-width="2" opacity=".94"><title>${esc(row.race.title)} · ${esc(row.race.candidates[forecast(row.race).leader_index].name)} ${pct(row.p)} · ${row.hit ? "correct" : "missed"}</title></circle>`;
  }).join("");
  $("confidence-plot").innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${lines}${dots}<text x="${width/2}" y="${height-2}" text-anchor="middle" fill="#b8c8bb" font-family="IBM Plex Mono" font-size="11" letter-spacing="2">FAVORITE'S FORECAST PROBABILITY</text></svg>`;
}

function renderSurprises() {
  const all = state.data.races.filter(r => scored(r)).sort((a,b) => forecast(b).brier - forecast(a).brier);
  const rows = all.slice(0,5);
  const total = all.reduce((sum,r) => sum + forecast(r).brier, 0);
  const topTwo = rows.slice(0,2).reduce((sum,r) => sum + forecast(r).brier, 0);
  $("surprise-dek").textContent = total > 0
    ? `The two biggest penalties account for ${Math.round(topTwo/total*100)}% of the total forecast error at this cutoff. A confident wrong call matters far more than a narrow miss.`
    : "The biggest Brier penalties identify consequential misses.";
  $("surprises").innerHTML = rows.map((r,i) => {
    const f = forecast(r), leader = r.candidates[f.leader_index].name;
    return `<a class="surprise" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="rank">0${i+1}</span><span class="title">${esc(r.title)}</span><span class="winner">Favorite: ${esc(leader)} · ${pct(f.probabilities[f.leader_index])}<br>Winner: ${esc(r.winner)}</span><span class="penalty">${f.brier.toFixed(3)}<small>BRIER PENALTY ↗</small></span></a>`;
  }).join("") || "<p>No scored races at this cutoff.</p>";
}

function renderCalibration() {
  const bins = [
    {label:"Below 50%", min:0, max:.5},
    {label:"50–69%", min:.5, max:.7},
    {label:"70–89%", min:.7, max:.9},
    {label:"90–100%", min:.9, max:1.001}
  ];
  const rows = state.data.races.filter(r => scored(r)).map(r => ({
    p: Math.max(...forecast(r).probabilities.filter(p => p != null)), hit: forecast(r).hit
  }));
  $("calibration").innerHTML = bins.map(bin => {
    const group = rows.filter(r => r.p >= bin.min && r.p < bin.max);
    if (!group.length) return `<div class="cal-row"><div class="cal-label"><strong>${bin.label}</strong><small>0 races</small></div><div></div><div class="cal-values">NO DATA</div></div>`;
    const predicted = group.reduce((sum,r) => sum+r.p,0)/group.length;
    const observed = group.filter(r => r.hit).length/group.length;
    return `<div class="cal-row"><div class="cal-label"><strong>${bin.label}</strong><small>${group.length} race${group.length===1?"":"s"}</small></div><div class="cal-track"><i class="cal-marker predicted" style="left:${predicted*100}%" title="Average forecast ${pct(predicted)}"></i><i class="cal-marker observed" style="left:${observed*100}%" title="Actual win rate ${pct(observed)}"></i></div><div class="cal-values">${pct(predicted)} forecast<strong>${pct(observed)} won</strong></div></div>`;
  }).join("");
}

function renderRace() {
  const r = state.data.races.find(row => String(row.id) === String(state.raceId)) || state.data.races[0];
  if (!r) return;
  state.raceId = r.id;
  $("race-select").value = String(r.id);
  const unresolved = r.winner_index == null;
  const selected = forecast(r);
  const focusIndex = unresolved ? (selected?.leader_index ?? horizons.map(h => forecast(r,h)?.leader_index).find(i => i != null)) : r.winner_index;
  $("race-status-label").textContent = unresolved ? "CURRENT FAVORITE · RESULT PENDING" : r.outcome_status === "provisional" ? "CALLED WINNER · PROVISIONAL" : "EVENTUAL WINNER";
  $("race-chance-label").textContent = unresolved ? "FAVORITE'S CHANCE" : "WINNER'S CHANCE";
  $("race-winner").textContent = unresolved ? (r.candidates[focusIndex]?.name || "Awaiting result") : r.winner;
  $("race-link").href = r.url;
  $("race-probability").textContent = selected?.probabilities && focusIndex != null ? pct(selected.probabilities[focusIndex]) : "—";
  const width = 1000, height = 290, left = 45, right = 30, top = 25, bottom = 40;
  const x = i => left + i / 3 * (width-left-right);
  const y = p => top + (1-p) * (height-top-bottom);
  const grid = [0,.25,.5,.75,1].map(p => `<line x1="${left}" y1="${y(p)}" x2="${width-right}" y2="${y(p)}" stroke="#d4ddd1"/><text x="${left-8}" y="${y(p)+4}" text-anchor="end" fill="#788b7b" font-family="IBM Plex Mono" font-size="11">${Math.round(p*100)}</text>`).join("");
  const points = horizons.map((h,i) => ({i,h,f:forecast(r,h)})).filter(item => item.f.probabilities && item.f.probabilities[focusIndex] != null);
  const path = points.map((p,i) => `${i ? "L" : "M"} ${x(p.i)} ${y(p.f.probabilities[focusIndex])}`).join(" ");
  const line = path ? `<path d="${path}" fill="none" stroke="#167460" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const circles = points.map(p => `<circle cx="${x(p.i)}" cy="${y(p.f.probabilities[focusIndex])}" r="6" fill="#167460" stroke="#fff" stroke-width="3"><title>${shortLabels[p.h]}: ${pct(p.f.probabilities[focusIndex])}</title></circle>`).join("");
  const xlabels = horizons.map((h,i) => `<text x="${x(i)}" y="${height-8}" text-anchor="middle" fill="#677a6b" font-family="IBM Plex Mono" font-size="11">${shortLabels[h]}</text>`).join("");
  $("race-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${grid}${line}${circles}${xlabels}</svg>`;
  $("race-points").innerHTML = horizons.map(h => {
    const f = forecast(r,h);
    const observed = f.observations?.find(o => o.market_id === r.candidates[focusIndex]?.id);
    const when = observed ? new Date(observed.observed_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",timeZone:"UTC"}) + " UTC" : "No usable price";
    return `<div><span>${shortLabels[h]}</span><span class="point-value">${f.probabilities && focusIndex != null ? pct(f.probabilities[focusIndex]) : "—"}</span><span class="point-time">Observed ${esc(when)}</span></div>`;
  }).join("");
}

function render() { renderSummary(); renderPlot(); renderCalibration(); renderSurprises(); renderRace(); }

async function init() {
  try {
    const response = await fetch("scorecard.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    $("edition-label").textContent = state.data.label;
    const options = state.data.races.map(r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join("");
    $("race-select").innerHTML = options;
    state.raceId = state.data.races[0]?.id;
    document.querySelectorAll("[data-horizon]").forEach(button => button.addEventListener("click", () => { state.horizon = button.dataset.horizon; render(); }));
    $("race-select").addEventListener("change", event => { state.raceId = event.target.value; renderRace(); });
    $("method-note").textContent = `${state.data.discovered_events} tagged events reviewed · ${state.data.included_races} eligible races · ${state.data.fetch_failures} price fetch failures`;
    render();
  } catch (error) {
    $("hit-detail").textContent = "Data could not be loaded";
    $("method-note").textContent = String(error);
  }
}
init();
