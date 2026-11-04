const state={data:null,cohort:'all',segment:'all',bucket:70};
const $=id=>document.getElementById(id);
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pct=value=>value==null?'—':`${Math.round(value*100)}%`;
const move=value=>value==null?'—':`${value>0?'+':''}${value.toFixed(1)} pts`;
const eligible=()=>state.data.races.filter(r=>r.movement);
const candidateRows=()=>eligible().flatMap(race=>{
 const before=race.forecasts.night_before.probabilities,after=race.forecasts.preclose.probabilities;
 return race.candidates.flatMap((candidate,index)=>before[index]==null||after[index]==null?[]:[{
  race,candidate,index,before:before[index],after:after[index],delta:(after[index]-before[index])*100,
  favorite:index===race.movement.night_before_leader_index
 }]);
});
function renderStats(){
 const races=eligible(),flips=races.filter(r=>r.movement.leader_flipped),biggest=[...races].sort((a,b)=>Math.abs(b.movement.biggest_move_pp)-Math.abs(a.movement.biggest_move_pp))[0];
 const confident=races.filter(r=>r.outcome_status!=='pending'&&r.movement.night_before_favorite_probability>=.7);
 const losses=confident.filter(r=>r.winner_index!==r.movement.night_before_leader_index);
 $('kpi-races').textContent=races.length.toLocaleString();$('kpi-flips').textContent=String(flips.length);
 $('kpi-biggest').textContent=biggest?`${Math.abs(biggest.movement.biggest_move_pp).toFixed(1)} pts`:'—';
 $('kpi-upsets').textContent=confident.length?`${losses.length} / ${confident.length}`:'Pending';
 $('kpi-upsets-note').textContent=confident.length?'Settled races with a ≥70% Monday favorite':'Among settled races';
 const date=new Date(state.data.generated_at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 const settled=state.data.races.filter(r=>r.outcome_status==='settled').length;
 $('updated-note').textContent=`Movement prices frozen at the stated cutoffs · Results updated ${date} ET · ${settled} of ${state.data.races.length} race outcomes settled`;
}
function renderBuckets(){
 const rows=candidateRows().filter(row=>(state.cohort==='all'||row.favorite)&&(state.segment==='all'||row.race.segment===state.segment));
 $('bucket-sample').textContent=`${rows.length.toLocaleString()} outcomes · ${new Set(rows.map(row=>row.race.id)).size} races`;
 $('bucket-chart').innerHTML=Array.from({length:10},(_,i)=>{
  const band=rows.filter(row=>row.before>=i/10&&(i===9?row.before<=1:row.before<(i+1)/10));
  const moved=band.filter(row=>Math.abs(row.delta)>=5);
  const rate=band.length?moved.length/band.length:0;
  const label=`${i*10}–${(i+1)*10}%`;
  return `<button class="bucket-row ${state.bucket===i*10?'active':''}" data-bucket="${i*10}" aria-pressed="${state.bucket===i*10}"><span class="bucket-label">${label}</span><span class="bucket-track"><span class="bucket-fill" style="display:block;width:${rate*100}%"></span></span><span class="bucket-count">${band.length?Math.round(rate*100):0}%<small>${moved.length} of ${band.length}</small></span></button>`;
 }).join('');
 document.querySelectorAll('[data-bucket]').forEach(button=>button.addEventListener('click',()=>{state.bucket=Number(button.dataset.bucket);renderBuckets();}));
 const selected=rows.filter(row=>row.before>=state.bucket/100&&(state.bucket===90?row.before<=1:row.before<(state.bucket+10)/100)).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,6);
 $('bucket-selection').innerHTML=`<div class="selection-title">Largest moves among outcomes priced ${state.bucket}–${state.bucket+10}% Monday night</div>`+
  (selected.length?selected.map(row=>`<div class="selection-row"><span><a href="${safe(row.race.url)}" target="_blank" rel="noopener">${safe(row.race.title)}</a> · ${safe(row.candidate.name)}</span><span>${pct(row.before)} → ${pct(row.after)}</span><strong class="${row.delta>=0?'positive':'negative'}">${move(row.delta)}</strong></div>`).join(''):'<p>No outcomes in this band.</p>');
}
function resultLabel(race){
 if(race.outcome_status==='pending')return 'Pending';
 const winner=race.winner||'Result pending';
 return `${winner}${race.outcome_status==='provisional'?' (called)':''}`;
}
function renderMovers(){
 const races=[...eligible()].sort((a,b)=>Math.abs(b.movement.biggest_move_pp)-Math.abs(a.movement.biggest_move_pp)).slice(0,10);
 $('mover-list').innerHTML=races.map(race=>{
  const m=race.movement,candidate=race.candidates[m.biggest_mover_index];
  const before=race.forecasts.night_before.probabilities[m.biggest_mover_index],after=race.forecasts.preclose.probabilities[m.biggest_mover_index];
  return `<a class="mover-row" href="${safe(race.url)}" target="_blank" rel="noopener"><span><span class="race-title">${safe(race.title)}</span><span class="candidate">${safe(candidate.name)}</span></span><span class="prices">${pct(before)} → ${pct(after)}</span><span class="move ${m.biggest_move_pp>=0?'positive':'negative'}">${move(m.biggest_move_pp)}</span><span class="result">${safe(resultLabel(race))}</span></a>`;
 }).join('');
}
function renderReversals(){
 const races=eligible().filter(r=>r.movement.leader_flipped);
 $('reversal-list').innerHTML=races.length?races.map(race=>{
  const m=race.movement,a=race.candidates[m.night_before_leader_index],b=race.candidates[m.preclose_leader_index];
  const aPrice=race.forecasts.night_before.probabilities[m.night_before_leader_index],bPrice=race.forecasts.preclose.probabilities[m.preclose_leader_index];
  return `<a class="reversal-card" href="${safe(race.url)}" target="_blank" rel="noopener"><strong>${safe(race.title)}</strong><span class="from-to">Monday: <b>${safe(a.name)} ${pct(aPrice)}</b><br>Tuesday: <em>${safe(b.name)} ${pct(bPrice)}</em></span></a>`;
 }).join(''):'<p>No race changed its leading candidate between these two cutoffs.</p>';
}
async function init(){try{
 const response=await fetch('data/2026.json');if(!response.ok)throw Error(`HTTP ${response.status}`);state.data=await response.json();
 document.querySelectorAll('[data-cohort]').forEach(button=>button.addEventListener('click',()=>{state.cohort=button.dataset.cohort;document.querySelectorAll('[data-cohort]').forEach(b=>b.classList.toggle('active',b===button));renderBuckets();}));
 $('bucket-segment').addEventListener('change',event=>{state.segment=event.target.value;renderBuckets();});
 renderStats();renderBuckets();renderMovers();renderReversals();
 }catch(error){$('updated-note').textContent=`Market data could not be loaded: ${error.message}`;}}
init();
