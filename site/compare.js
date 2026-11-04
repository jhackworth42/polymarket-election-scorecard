const $=id=>document.getElementById(id);
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let data;
function pickCell(source,winner,detail=''){
 if(!source)return '<span class="source-missing">No data</span>';
 if(!source.pick)return `<span class="source-missing">${source.rating==='Toss-up'?'Toss-up':'Tied average'}</span>`;
 const result=winner?`<small class="${source.pick===winner?'call-hit':'call-miss'}">${source.pick===winner?'Correct':'Miss'}</small>`:'';
 return `<strong class="party-${source.pick.toLowerCase()}">${source.pick}</strong>${detail?` <small>${safe(detail)}</small>`:''}${result}`;
}
function render(){const query=$('search').value.trim().toLowerCase(),office=$('office').value,status=$('status').value,sources=$('sources').value;
 const rows=data.races.filter(race=>{const picks=[race.polymarket?.pick,race.inside?.pick,race.polls?.pick];return (!query||race.title.toLowerCase().includes(query))&&(office==='all'||race.key.startsWith(office+':'))&&(status==='all'||status==='verified'&&!!race.winner_party||status==='pending'&&!race.winner_party)&&(sources==='all'||sources==='shared'&&picks.every(Boolean)||sources==='disagree'&&new Set(picks.filter(Boolean)).size>1)});
 rows.sort((a,b)=>Number(!!b.winner_party)-Number(!!a.winner_party)||a.title.localeCompare(b.title));
 $('compare-summary').textContent=`${rows.length} of ${data.races.length} races shown · ${data.common_verified_races} verified races with all three directional picks`;
 $('compare-table').innerHTML=rows.map(race=>`<tr><td><a href="${safe(race.url)}" target="_blank" rel="noopener">${safe(race.title)} ↗</a></td><td>${race.winner_party?`<strong class="party-${race.winner_party.toLowerCase()}">${race.winner_party}</strong>`:'Pending'}</td><td>${pickCell(race.polymarket,race.winner_party,race.polymarket?.confidence==null?'':`${Math.round(race.polymarket.confidence*100)}%`)}</td><td>${pickCell(race.inside,race.winner_party,race.inside?.rating)}</td><td>${pickCell(race.polls,race.winner_party,race.polls?.average)}</td></tr>`).join('')||'<tr><td colspan="5">No races match these filters.</td></tr>';
}
async function init(){try{const response=await fetch('data/comparison.json');if(!response.ok)throw Error(`HTTP ${response.status}`);data=await response.json();['search','office','status','sources'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));render()}catch(error){$('compare-summary').textContent=`Comparison data could not be loaded: ${error.message}`}}
init();
