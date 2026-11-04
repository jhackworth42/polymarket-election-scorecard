const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const percent = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const points = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
const mean = values => values.reduce((sum,value) => sum + value, 0) / values.length;
const horizons = [
  {key:'30',label:'30 days out',detail:'Oct. 4 at 11 a.m. ET'},
  {key:'7',label:'7 days out',detail:'Oct. 27 at 11 a.m. ET'},
  {key:'1',label:'1 day out',detail:'Nov. 2 at 10 a.m. ET'},
  {key:'six_hours',label:'6 hours out',detail:'Nov. 3 at noon ET, six hours before the first U.S. poll closing'}
];
let data, horizon = '1';
const verified = () => data.races.filter(race => race.outcome_status === 'settled');
const scored = (race,key) => race.forecasts[key]?.status === 'scored';
const sample = (key=horizon) => verified().filter(race => scored(race,key));
function renderStats() {
  const races = data.races, results = verified(), group = sample();
  const hits = group.filter(race => race.forecasts[horizon].hit).length;
  $('kpi-races').textContent = races.length.toLocaleString();
  $('kpi-settled').textContent = String(results.length);
  $('kpi-settled-note').textContent = `of ${races.length} tracked races`;
  $('kpi-hit').textContent = group.length ? percent(hits/group.length) : 'Pending';
  $('kpi-hit-note').textContent = group.length ? `${hits} of ${group.length} verified races` : 'Awaiting verified results';
  $('kpi-brier').textContent = group.length ? mean(group.map(race => race.forecasts[horizon].brier)).toFixed(4) : 'Pending';
  const selected = horizons.find(item => item.key === horizon);
  $('snapshot-description').textContent = `Selected snapshot: ${selected.label} · ${selected.detail}. Results are verified independently of this price.`;
  const clear = group.filter(race => race.segment === 'clear').length;
  $('sample-note').textContent = !group.length ? 'Results have not been verified yet; accuracy and calibration will appear as races settle.' : group.length < races.length ? `Early sample: ${group.length} of ${races.length} races have verified results and a usable price here. ${clear} of those ${group.length} were rated clearer a week out. The overall win rate will change as closer races settle.` : 'All tracked races with usable prices have verified results.';
  const updated = new Date(data.generated_at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  $('updated-note').textContent = `Results refreshed ${updated} ET · ${data.fetch_failures} price fetch failures`;
}
function renderMisses() {
  const group = sample();
  const misses = group.filter(race => !race.forecasts[horizon].hit).sort((a,b) => {
    const pa=a.forecasts[horizon],pb=b.forecasts[horizon];
    return pb.probabilities[pb.leader_index]-pa.probabilities[pa.leader_index];
  }).slice(0,8);
  $('miss-list').innerHTML = misses.length ? misses.map(race => {
    const forecast = race.forecasts[horizon], favorite = race.candidates[forecast.leader_index].name;
    return `<a class="miss-row" href="${safe(race.url)}" target="_blank" rel="noopener"><strong>${safe(race.title)}</strong><span>${safe(favorite)} <b>${percent(forecast.probabilities[forecast.leader_index])}</b></span><span>${safe(race.winner)}</span></a>`;
  }).join('') : `<div class="empty-state">${group.length ? `No favorite has lost among the ${group.length} verified races at this checkpoint so far.` : 'Awaiting verified race results. The biggest misses will appear here as outcomes settle.'}</div>`;
}
function renderConfidence() {
  const filter = $('confidence-filter').value;
  const group = sample().filter(race => filter === 'all' || race.category === filter || filter === 'contested' && race.segment === 'contested');
  if (!group.length) { $('confidence-chart').innerHTML = `<div class="empty-state">${verified().length ? 'No verified races with a usable price match this filter yet.' : 'Awaiting verified results. This chart will compare quoted confidence with actual wins.'}</div>`; return; }
  const rows = [];
  for (let i=0;i<10;i++) {
    const band = group.filter(race => {const f=race.forecasts[horizon], p=f.probabilities[f.leader_index]; return p >= i/10 && (i===9 ? p<=1 : p<(i+1)/10);});
    if (!band.length) continue;
    const expected=mean(band.map(race=>{const f=race.forecasts[horizon];return f.probabilities[f.leader_index]}));
    const won=band.filter(race=>race.forecasts[horizon].hit).length, actual=won/band.length;
    rows.push(`<div class="confidence-row"><strong>${i*10}–${(i+1)*10}%</strong><div class="confidence-plot"><div class="actual-bar" style="width:${actual*100}%"></div><i class="expected-mark" style="left:${expected*100}%"></i><span>${percent(actual)} won · ${percent(expected)} forecast</span></div><span class="confidence-count">${won} / ${band.length}</span></div>`);
  }
  $('confidence-chart').innerHTML=rows.join('');
}
function renderBrier() {
  const matched=verified().filter(race=>horizons.every(item=>scored(race,item.key)));
  $('brier-cohort').textContent=`${matched.length} matched verified races`;
  if (!matched.length) { $('brier-chart').innerHTML='<div class="empty-state">The Brier line will appear when races with prices at all four checkpoints settle.</div>'; return; }
  const values=horizons.map(item=>mean(matched.map(race=>race.forecasts[item.key].brier)));
  const ceiling=Math.max(...values)*1.25 || .01, left=62, right=738, top=18, bottom=174;
  const x=i=>left+i*(right-left)/3, y=value=>bottom-value/ceiling*(bottom-top);
  const path=values.map((v,i)=>`${i?'L':'M'} ${x(i)} ${y(v)}`).join(' ');
  const grid=[0,.5,1].map(frac=>{const yy=bottom-frac*(bottom-top);return `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" stroke="#d3dce4"/><text x="2" y="${yy+4}" class="axis-text">${(frac*ceiling).toFixed(4)}</text>`}).join('');
  const marks=values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="${horizons[i].key===horizon?6:4}" fill="${horizons[i].key===horizon?'#b82c38':'#23558f'}"/><text x="${x(i)}" y="${y(v)-12}" text-anchor="middle" class="point-text">${v.toFixed(4)}</text><text x="${x(i)}" y="214" text-anchor="middle" class="axis-text">${horizons[i].label}</text>`).join('');
  $('brier-chart').innerHTML=`<svg viewBox="0 0 800 230" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}<path d="${path}" fill="none" stroke="#23558f" stroke-width="3"/>${marks}</svg>`;
  $('brier-chart').setAttribute('aria-label',`Mean Brier error on ${matched.length} matched races: ${horizons.map((item,i)=>`${item.label} ${values[i].toFixed(4)}`).join(', ')}`);
}
function renderBreakdown() {
  const groups=[['contested','Contested at 7 days','difficulty'],['clear','Clearer at 7 days','difficulty'],['senate','Senate','office'],['governor','Governor','office'],['house','House','office']];
  const rows=groups.map(([key,label,kind])=>{const races=sample().filter(race=>kind==='difficulty'?race.segment===key:race.category===key);return {key,label,kind,n:races.length,error:races.length?mean(races.map(race=>race.forecasts[horizon].brier)):null,hits:races.filter(race=>race.forecasts[horizon].hit).length}});
  const scale=Math.max(.01,...rows.map(row=>row.error||0));
  $('breakdown-list').innerHTML=rows.map((row,index)=>`${index===0||index===2?`<div class="breakdown-group">${index===0?'BY DIFFICULTY':'BY OFFICE'}</div>`:''}<div class="breakdown-row"><strong>${row.label}</strong><span class="breakdown-track"><i class="${row.kind==='difficulty'?row.key:'office'}" style="width:${row.error==null?0:row.error/scale*100}%"></i></span><span class="breakdown-value">${row.error==null?'Pending':row.error.toFixed(4)}</span><span class="breakdown-count">${row.n} races${row.n?` · ${row.hits} right`:''}</span></div>`).join('');
}
function renderMovement() {
  const races=data.races.filter(race=>race.movement), movers=[...races].sort((a,b)=>Math.abs(b.movement.biggest_move_pp)-Math.abs(a.movement.biggest_move_pp));
  $('movement-flips').textContent=String(races.filter(race=>race.movement.leader_flipped).length);
  $('movement-biggest').textContent=movers.length?`${Math.abs(movers[0].movement.biggest_move_pp).toFixed(1)} pts`:'—';
  $('mover-list').innerHTML=movers.slice(0,8).map(race=>{const m=race.movement,i=m.biggest_mover_index,before=race.forecasts.night_before.probabilities[i],after=race.forecasts.preclose.probabilities[i];const result=race.outcome_status==='settled'?race.winner:race.outcome_status==='provisional'?`${race.winner} (called)`:'Pending';return `<a class="mover-row" href="${safe(race.url)}" target="_blank" rel="noopener"><span><span class="race-title">${safe(race.title)}</span><span class="candidate">${safe(race.candidates[i].name)}</span></span><span class="prices">${percent(before)} → ${percent(after)}</span><span class="move ${m.biggest_move_pp>=0?'positive':'negative'}">${points(m.biggest_move_pp)}</span><span class="result">${safe(result)}</span></a>`}).join('');
}
function renderSelected() {renderStats();renderMisses();renderConfidence();renderBrier();renderBreakdown();document.querySelectorAll('[data-horizon]').forEach(button=>{const active=button.dataset.horizon===horizon;button.setAttribute('aria-selected',String(active));button.classList.toggle('active',active)});}
async function init() {try {const response=await fetch('data/2026.json');if(!response.ok)throw Error(`HTTP ${response.status}`);data=await response.json();$('confidence-filter').addEventListener('change',renderConfidence);document.querySelectorAll('[data-horizon]').forEach(button=>button.addEventListener('click',()=>{horizon=button.dataset.horizon;renderSelected()}));renderSelected();renderMovement();}catch(error){$('updated-note').textContent=`Scorecard data could not be loaded: ${error.message}`}}
init();
