const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pct = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const points = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
let races = [], horizon = '1';
const forecast = race => race.forecasts[horizon];
const price = race => { const f=forecast(race); return f?.probabilities ? f.probabilities[f.leader_index] : -1; };
function render() {
  const query=$('search').value.trim().toLowerCase(),office=$('office').value,segment=$('segment').value,call=$('call').value,threshold=Number($('movement').value)||0,sort=$('sort').value;
  const visible=races.filter(race=>{
    const f=forecast(race),scored=f?.status==='scored';
    return (!query||`${race.title} ${race.candidates.map(c=>c.name).join(' ')}`.toLowerCase().includes(query)) &&
      (office==='all'||race.category===office) && (segment==='all'||race.segment===segment) &&
      (call==='all'||call==='pending'&&!scored||call==='hit'&&scored&&f.hit||call==='miss'&&scored&&!f.hit) &&
      Math.abs(race.movement.biggest_move_pp)>=threshold;
  });
  visible.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='night'?price(b)-price(a):Math.abs(b.movement.biggest_move_pp)-Math.abs(a.movement.biggest_move_pp));
  $('visible-count').textContent=visible.length.toLocaleString();
  $('inventory-note').textContent=`of ${races.length.toLocaleString()} races with fresh Monday and Tuesday prices`;
  $('race-table').innerHTML=visible.map(race=>{
    const f=forecast(race),m=race.movement,after=race.forecasts.preclose,index=m.preclose_leader_index;
    const favorite=f?.probabilities?`<span class="table-candidate">${safe(race.candidates[f.leader_index].name)}</span><strong>${pct(f.probabilities[f.leader_index])}</strong>`:'No usable price';
    const result=race.outcome_status==='pending'?'Pending':`${race.winner??'—'}${race.outcome_status==='provisional'?' · called':' · settled'}`;
    const call=f?.status==='scored'?(f.hit?'<span class="call-hit">Correct</span>':'<span class="call-miss">Miss</span>'):'Pending';
    return `<tr><td><a href="${safe(race.url)}" target="_blank" rel="noopener">${safe(race.title)} ↗</a></td><td>${safe(race.category)}</td><td>${favorite}</td><td><span class="table-candidate">${safe(race.candidates[index].name)}</span><strong>${pct(after.probabilities[index])}</strong></td><td>${call}</td><td class="${m.biggest_move_pp>=0?'positive':'negative'}">${points(m.biggest_move_pp)}</td><td>${safe(result)}</td></tr>`;
  }).join('')||'<tr><td colspan="7">No races match these filters.</td></tr>';
  document.querySelectorAll('[data-horizon]').forEach(button=>{const active=button.dataset.horizon===horizon;button.setAttribute('aria-selected',String(active));button.classList.toggle('active',active)});
}
async function init(){try{const response=await fetch('data/2026.json');if(!response.ok)throw Error(`HTTP ${response.status}`);const data=await response.json();races=data.races.filter(race=>race.movement);['search','office','segment','call','movement','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));document.querySelectorAll('[data-horizon]').forEach(button=>button.addEventListener('click',()=>{horizon=button.dataset.horizon;render()}));render()}catch(error){$('inventory-note').textContent=`Could not load race data: ${error.message}`}}
init();
