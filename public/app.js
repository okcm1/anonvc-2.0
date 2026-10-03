const FALLBACK = [
  {nickname:'okcm1',role:'AWPer',faceitUrl:'https://www.faceit.com/ru/players/okcm1'},
  {nickname:'nesternoid',role:'Rifler / Second AWPer',faceitUrl:'https://www.faceit.com/ru/players/nesternoid'},
  {nickname:'Byrga_',role:'Rifler',faceitUrl:'https://www.faceit.com/ru/players/Byrga_'},
  {nickname:'undeadstar10',role:'Support',faceitUrl:'https://www.faceit.com/ru/players/undeadstar10'},
  {nickname:'zerox252',role:'Entry Fragger',faceitUrl:'https://www.faceit.com/ru/players/zerox252'}
];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function renderPlayers(players){
  const merged = FALLBACK.map(f => ({...f,...(players||[]).find(p=>p.nickname===f.nickname)}));
  $('#operatorList').innerHTML = merged.map(p => `<div class="operator"><div class="avatar">${esc(p.nickname[0]?.toUpperCase())}</div><div><strong>${esc(p.nickname)}</strong><small>${esc(p.role||'Operator')} · FACEIT ${p.skillLevel??'—'}</small></div><span class="lvl">${p.elo??'—'}</span></div>`).join('');
  $('#rosterGrid').innerHTML = merged.map(p => `<article class="panel roster-card"><div class="avatar">${esc(p.nickname[0]?.toUpperCase())}</div><h2>${esc(p.nickname)}</h2><p>${esc(p.role||'Operator')} · LVL ${p.skillLevel??'—'} · ELO ${p.elo??'—'}</p><a href="${esc(p.faceitUrl)}" target="_blank">FACEIT PROFILE ↗</a></article>`).join('');
}

function renderMatches(matches){
  const rows = matches?.length ? matches : [];
  const html = rows.map(m => `<div class="match-row"><span class="result ${m.won?'win':'loss'}">${m.won?'WIN':'LOSS'}</span><div><strong>${esc(m.opponent)}</strong><small>${esc(m.map)} · ${esc(m.date)}</small></div><div class="score">${m.ourScore} : ${m.opponentScore}</div><a href="${esc(m.url||'#')}" target="_blank">FACEIT ↗</a></div>`).join('');
  $('#recentList').innerHTML = html || '<div class="match-row"><span class="result">—</span><div><strong>FACEIT DATA</strong><small>Configure the server API key to load matches.</small></div><div class="score">—</div><span>OFFLINE</span></div>';
  $('#allMatches').innerHTML = html || '<div class="panel" style="padding:25px">FACEIT match feed is waiting for the server-side API key.</div>';
  const last = rows[0];
  if(last){ $('#heroScore').textContent=`${last.ourScore} : ${last.opponentScore}`; $('#heroOpponent').textContent=last.opponent; $('#heroMap').textContent=last.map; $('#heroDate').textContent=last.date; $('#nextOpponent').textContent=last.opponent; $('#nextMeta').textContent=last.date+' · recent match'; }
  const wins=rows.filter(x=>x.won).length, losses=rows.filter(x=>!x.won).length;
  if(rows.length){ $('#winRate').textContent=Math.round(wins/rows.length*100)+'%'; $('#wins').textContent=wins; $('#losses').textContent=losses; $('#games').textContent=rows.length; }
  $('#formDots').innerHTML = Array.from({length:10},(_,i)=>`<span class="${rows[i]?(rows[i].won?'win':'loss'):'unknown'}"></span>`).join('');
}

async function boot(){
  renderPlayers(FALLBACK);
  try{
    const status=await fetch('/api/status').then(r=>r.json());
    $('#apiState').textContent=status.configured?'ONLINE':'OFFLINE';
    $('#statsStatus').textContent=status.configured?'FACEIT API READY':'FACEIT API KEY REQUIRED';
    if(!status.configured) return;
    const [players,matches]=await Promise.all([fetch('/api/players').then(r=>r.json()),fetch('/api/matches').then(r=>r.json())]);
    if(Array.isArray(players)) renderPlayers(players);
    if(Array.isArray(matches)) renderMatches(matches);
  }catch(e){
    $('#apiState').textContent='OFFLINE';
    $('#statsStatus').textContent='SERVER OFFLINE';
  }
}
boot();