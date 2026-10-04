const FALLBACK = [
  {nickname:'okcm1',role:'AWPer',faceitUrl:'https://www.faceit.com/ru/players/okcm1'},
  {nickname:'nesternoid',role:'Rifler / Second AWPer',faceitUrl:'https://www.faceit.com/ru/players/nesternoid'},
  {nickname:'Byrga_',role:'Rifler',faceitUrl:'https://www.faceit.com/ru/players/Byrga_'},
  {nickname:'undeadstar10',role:'Support',faceitUrl:'https://www.faceit.com/ru/players/undeadstar10'},
  {nickname:'zerox252',role:'Entry Fragger',faceitUrl:'https://www.faceit.com/ru/players/zerox252'}
];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = s => {
  const url=String(s||'').replace('/{lang}/','/ru/');
  return /^https:\/\/www\.faceit\.com\/(?:ru\/)?players\//i.test(url) || /^https:\/\/www\.faceit\.com\/(?:ru\/)?teams\//i.test(url) ? url : '#';
};

function avatar(p){
  return p.avatar
    ? `<img class="avatar-img" src="${esc(p.avatar)}" alt="">`
    : esc(p.nickname?.[0]?.toUpperCase() || '?');
}

function mergedPlayers(players){
  return FALLBACK.map(f => ({...f,...(players||[]).find(p=>p.nickname===f.nickname)}));
}

function renderPlayers(players){
  const merged = mergedPlayers(players);
  $('#operatorList').innerHTML = merged.map(p => `<div class="operator"><div class="avatar">${avatar(p)}</div><div><strong>${esc(p.nickname)}</strong><small>${esc(p.role||'Operator')} · FACEIT ${p.skillLevel??'—'}</small></div><span class="lvl">${p.elo??'—'}</span></div>`).join('');
  $('#rosterGrid').innerHTML = merged.map(p => `<article class="panel roster-card"><div class="avatar">${avatar(p)}</div><h2>${esc(p.nickname)}</h2><p>${esc(p.role||'Operator')} · LVL ${p.skillLevel??'—'} · ELO ${p.elo??'—'}</p><a href="${esc(safeUrl(p.faceitUrl))}" target="_blank" rel="noopener">FACEIT PROFILE ↗</a></article>`).join('');
  renderPlayerStats(merged);
}

function renderPlayerStats(players){
  const sorted=[...players].sort((a,b)=>(b.elo??-1)-(a.elo??-1));
  $('#playerStats').innerHTML=sorted.map((p,i)=>`<div class="player-stat-row"><span class="rank">0${i+1}</span><div class="player-stat-avatar avatar">${avatar(p)}</div><div class="player-stat-name"><strong>${esc(p.nickname)}</strong><small>${esc(p.role||'Operator')}</small></div><div><small>LEVEL</small><b>${p.skillLevel??'—'}</b></div><div><small>ELO</small><b>${p.elo??'—'}</b></div><a href="${esc(safeUrl(p.faceitUrl))}" target="_blank" rel="noopener">PROFILE ↗</a></div>`).join('');
}

function renderMatches(matches){
  const rows = Array.isArray(matches) ? matches : [];
  const html = rows.map(m => `<div class="match-row"><span class="result ${m.won?'win':'loss'}">${m.won?'WIN':'LOSS'}</span><div><strong>${esc(m.opponent)}</strong><small>${esc(m.map)} · ${esc(m.date)}</small></div><div class="score">${m.ourScore} : ${m.opponentScore}</div><a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">FACEIT ↗</a></div>`).join('');
  $('#recentList').innerHTML = html || '<div class="match-row"><span class="result">—</span><div><strong>NO MATCH DATA</strong><small>FACEIT returned no team matches yet.</small></div><div class="score">—</div><span>WAITING</span></div>';
  $('#allMatches').innerHTML = html || '<div class="panel" style="padding:25px">FACEIT API is connected, but no matches were returned for this team.</div>';
  $('#matchCount').textContent = `${rows.length} MATCH${rows.length===1?'':'ES'}`;
  $('#matchesState').textContent = rows.length ? 'LIVE API' : 'NO FEED';

  const last = rows[0];
  if(last){
    $('#heroScore').textContent=`${last.ourScore} : ${last.opponentScore}`;
    $('#heroOpponent').textContent=last.opponent;
    $('#heroMap').textContent=last.map;
    $('#heroDate').textContent=last.date;
    $('#nextOpponent').textContent='—';
    $('#nextMeta').textContent='No upcoming match in feed';
  } else {
    $('#heroScore').textContent='— : —';
    $('#heroOpponent').textContent='NO DATA';
    $('#heroMap').textContent='NO MATCH LOADED';
    $('#heroDate').textContent='—';
    $('#nextOpponent').textContent='TBD';
    $('#nextMeta').textContent='No upcoming match in feed';
  }

  const wins=rows.filter(x=>x.won).length;
  const losses=rows.filter(x=>!x.won).length;
  const rate=rows.length ? Math.round(wins/rows.length*100) : null;
  $('#winRate').textContent=rate===null?'—':rate+'%';
  $('#wins').textContent=rows.length ? wins : '—';
  $('#losses').textContent=rows.length ? losses : '—';
  $('#games').textContent=rows.length || '—';
  $('#statsWinRate').textContent=rate===null?'—':rate+'%';
  $('#statsRecord').textContent=rows.length?`${wins} — ${losses}`:'—';
  $('#statsGames').textContent=rows.length||'—';
  $('#formDots').innerHTML = Array.from({length:10},(_,i)=>`<span class="${rows[i]?(rows[i].won?'win':'loss'):'unknown'}"></span>`).join('');
}

function renderTeamStats(data){
  const lifetime=data?.lifetime || data?.stats?.lifetime || {};
  const find=(obj,keys)=>{
    for(const key of keys){
      const value=obj?.[key];
      if(value!==undefined && value!==null && value!=='') return value;
    }
    return null;
  };
  const wins=find(lifetime,['wins','win','matches_won']);
  const losses=find(lifetime,['losses','loss','matches_lost']);
  const games=find(lifetime,['matches','games','total_matches','played']);
  let rate=find(lifetime,['win_rate','winRate','winrate']);
  if(rate!==null && Number(rate)<=1) rate=Number(rate)*100;
  if(rate===null && wins!==null && losses!==null && Number(wins)+Number(losses)>0) rate=Number(wins)/(Number(wins)+Number(losses))*100;

  if(rate!==null) {
    const formatted=Math.round(Number(rate))+'%';
    $('#winRate').textContent=formatted;
    $('#statsWinRate').textContent=formatted;
  }
  if(wins!==null) $('#wins').textContent=wins;
  if(losses!==null) $('#losses').textContent=losses;
  if(games!==null) {
    $('#games').textContent=games;
    $('#statsGames').textContent=games;
  } else if(wins!==null && losses!==null) {
    const total=Number(wins)+Number(losses);
    $('#games').textContent=total;
    $('#statsGames').textContent=total;
  }
  if(wins!==null || losses!==null) $('#statsRecord').textContent=`${wins??'—'} — ${losses??'—'}`;
}

async function getJson(url){
  const r=await fetch(url,{cache:'no-store'});
  const data=await r.json().catch(()=>({error:'Invalid server response'}));
  if(!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function boot(){
  renderPlayers(FALLBACK);
  try{
    const status=await getJson('/api/status');
    $('#apiState').textContent=status.configured?'ONLINE':'OFFLINE';
    $('#statsStatus').textContent=status.configured?'FACEIT API READY':'FACEIT API KEY REQUIRED';
    if(!status.configured){
      renderMatches([]);
      return;
    }

    const [players,matches,teamStats]=await Promise.all([
      getJson('/api/players'),
      getJson('/api/matches'),
      getJson('/api/team-stats').catch(()=>null)
    ]);

    if(Array.isArray(players)) renderPlayers(players);
    renderMatches(Array.isArray(matches) ? matches : []);
    if(teamStats) renderTeamStats(teamStats);

    $('#liveState').textContent='FACEIT LINKED';
    $('#apiState').textContent='ONLINE';
  }catch(e){
    $('#apiState').textContent='ERROR';
    $('#statsStatus').textContent='FACEIT API ERROR';
    $('#liveState').textContent='API ERROR';
    $('#allMatches').innerHTML=`<div class="panel" style="padding:25px">FACEIT API error: ${esc(e.message)}</div>`;
  }
}
boot();
