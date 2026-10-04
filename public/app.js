const FALLBACK=[
{nickname:'okcm1',role:'AWPer',faceitUrl:'https://www.faceit.com/ru/players/okcm1'},
{nickname:'nesternoid',role:'Rifler / Second AWPer',faceitUrl:'https://www.faceit.com/ru/players/nesternoid'},
{nickname:'Byrga_',role:'Rifler',faceitUrl:'https://www.faceit.com/ru/players/Byrga_'},
{nickname:'undeadstar10',role:'Support',faceitUrl:'https://www.faceit.com/ru/players/undeadstar10'},
{nickname:'zerox252',role:'Entry Fragger',faceitUrl:'https://www.faceit.com/ru/players/zerox252'}];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{const u=String(s||'').replace('/{lang}/','/ru/');return /^https:\/\/www\.faceit\.com\/(?:ru\/)?(?:players|teams|matches)\//i.test(u)?u:'#'};
const avatar=p=>p.avatar?'<img class="avatar-img" src="'+esc(p.avatar)+'" alt="">':esc(p.nickname?.[0]?.toUpperCase()||'?');
const mergedPlayers=ps=>FALLBACK.map(f=>({...f,...(ps||[]).find(p=>p.nickname===f.nickname)}));
function renderPlayers(players){
 const m=mergedPlayers(players);
 $('#operatorList').innerHTML=m.map(p=>'<div class="operator"><div class="avatar">'+avatar(p)+'</div><div><strong>'+esc(p.nickname)+'</strong><small>'+esc(p.role||'Operator')+' · FACEIT '+(p.skillLevel??'—')+'</small></div><span class="lvl">'+(p.elo??'—')+'</span></div>').join('');
 $('#rosterGrid').innerHTML=m.map(p=>'<article class="panel roster-card"><div class="avatar">'+avatar(p)+'</div><h2>'+esc(p.nickname)+'</h2><p>'+esc(p.role||'Operator')+' · LVL '+(p.skillLevel??'—')+' · ELO '+(p.elo??'—')+'</p><a href="'+esc(safeUrl(p.faceitUrl))+'" target="_blank" rel="noopener">FACEIT PROFILE ↗</a></article>').join('');
 renderPlayerStats(m);
}
function renderPlayerStats(ps){
 const s=[...ps].sort((a,b)=>(b.elo??-1)-(a.elo??-1));
 $('#playerStats').innerHTML=s.map((p,i)=>'<div class="player-stat-row"><span class="rank">0'+(i+1)+'</span><div class="player-stat-avatar avatar">'+avatar(p)+'</div><div class="player-stat-name"><strong>'+esc(p.nickname)+'</strong><small>'+esc(p.role||'Operator')+'</small></div><div><small>LEVEL</small><b>'+(p.skillLevel??'—')+'</b></div><div><small>ELO</small><b>'+(p.elo??'—')+'</b></div><a href="'+esc(safeUrl(p.faceitUrl))+'" target="_blank" rel="noopener">PROFILE ↗</a></div>').join('');
}
let matchRows=[];
let expanded=false;
let activeFilter='TEAM';
const detailCache=new Map();
const detailLoading=new Set();

function typeLabel(m){return m.matchType==='TEAM'?'TEAM MATCH':m.matchType==='STACK'?'STACK · '+m.participantCount+'/5':'SOLO MATCH · 1/5'}
function resultLabel(m){return m.won===true?'WIN':m.won===false?'LOSS':'—'}
function resultClass(m){return m.won===true?'win':m.won===false?'loss':'unknown'}
function detailFor(m){return detailCache.get(m.id)||m}
function mvpHtml(m){
 const d=detailFor(m),p=d.mvp;
 if(!p)return '<small class="mvp">MVP —</small>';
 const rating=p.rating!=null?' · '+Number(p.rating).toFixed(2):'';
 return '<small class="mvp">MVP <b>'+esc(p.nickname)+'</b>'+rating+'</small>';
}
function rowHtml(m){
 const d=detailFor(m);
 const score=(d.ourScore!=null&&d.opponentScore!=null)?d.ourScore+' : '+d.opponentScore:'— : —';
 const detail=d.players?.length?'<div class="match-expanded"><div class="match-expanded-head">TEAM PERFORMANCE</div>'+d.players.slice(0,5).map(p=>'<div class="player-line"><b>'+esc(p.nickname)+'</b><span>'+p.kills+'K / '+p.deaths+'D / '+p.assists+'A</span><span>RATING '+(p.rating!=null?Number(p.rating).toFixed(2):'—')+'</span></div>').join('')+'</div>':'';
 return '<div class="match-card"><div class="match-row match-row-detail" data-match-id="'+esc(m.id)+'"><span class="result '+resultClass(d)+'">'+resultLabel(d)+'</span><div><strong>'+esc(typeLabel(m))+'</strong><small>'+esc(d.opponent||m.opponent)+' · '+esc(d.map||m.map)+' · '+esc(m.date)+'</small>'+mvpHtml(m)+'</div><div class="score">'+score+'</div><a href="'+esc(safeUrl(m.url))+'" target="_blank" rel="noopener">FACEIT ↗</a></div>'+detail+'</div>';
}
function emptyHtml(){return '<div class="match-row"><span class="result">—</span><div><strong>NO MATCH DATA</strong><small>FACEIT returned no player matches yet.</small></div><div class="score">—</div><span>WAITING</span></div>'}
function controlsHtml(total){
 if(total<=2)return '';
 return '<button class="show-all-matches" type="button">'+(expanded?'СКРЫТЬ':'ПОКАЗАТЬ ВСЕ')+' · '+total+' МАТЧЕЙ '+(expanded?'↑':'↓')+'</button>';
}
function filteredRows(){return matchRows.filter(m=>m.matchType===activeFilter)}
function renderMatches(matches){
 matchRows=Array.isArray(matches)?matches:[];
 const filtered=filteredRows();
 const visible=expanded?filtered:filtered.slice(0,2);
 const html=visible.length?visible.map(rowHtml).join(''):'';
 $('#recentList').innerHTML=(html||emptyHtml())+controlsHtml(matchRows.length);
 $('#allMatches').innerHTML=(html||'<div class="panel" style="padding:25px">FACEIT API is connected, but no matches were returned for this team.</div>')+controlsHtml(matchRows.length);
 $('#matchCount').textContent=filtered.length?((expanded?filtered.length:Math.min(2,filtered.length))+' SHOWN / '+filtered.length+' '+activeFilter):'0 MATCHES';
 $('#matchesState').textContent=matchRows.length?'LIVE API':'NO FEED';

 const live=matchRows.find(x=>['ongoing','started','in_progress','live'].includes(String(x.status||'').toLowerCase()));
 const last=live||matchRows[0];
 if(last){
  const d=detailFor(last);
  $('#heroOurScore').textContent=d.ourScore!=null?d.ourScore:'—';
  $('#heroOpponentScore').textContent=d.opponentScore!=null?d.opponentScore:'—';
  $('#heroOpponent').textContent=d.opponent||last.opponent||'WAITING';
  $('#heroMap').textContent=d.map||last.map||'CS2';
  $('#heroDate').textContent=last.date||'—';
  $('#liveState').textContent=live?'LIVE MATCH':'FACEIT LINKED';
 }else{
  $('#heroOurScore').textContent='—';$('#heroOpponentScore').textContent='—';$('#heroOpponent').textContent='NO DATA';$('#heroMap').textContent='NO MATCH LOADED';$('#heroDate').textContent='—';
 }
 $('#nextOpponent').textContent='—';$('#nextMeta').textContent='No upcoming match in feed';

 const team=matchRows.filter(x=>x.matchType==='TEAM');
 const wins=team.filter(x=>detailFor(x).won===true).length;
 const losses=team.filter(x=>detailFor(x).won===false).length;
 const rate=team.length?Math.round(wins/team.length*100):null;
 $('#winRate').textContent=rate===null?'—':rate+'%';
 $('#wins').textContent=team.length?wins:'—';$('#losses').textContent=team.length?losses:'—';$('#games').textContent=team.length||'—';
 $('#statsWinRate').textContent=rate===null?'—':rate+'%';
 $('#statsRecord').textContent=team.length?wins+' — '+losses:'—';
 $('#statsGames').textContent=team.length||'—';
 $('#formDots').innerHTML=Array.from({length:10},(_,i)=>{const x=team[i];return '<span class="'+(x?(detailFor(x).won===true?'win':detailFor(x).won===false?'loss':'unknown'):'unknown')+'"></span>'}).join('');
 document.querySelectorAll('.show-all-matches').forEach(b=>b.onclick=()=>{expanded=!expanded;renderMatches(matchRows);if(expanded)loadDetails(filteredRows())});
 document.querySelectorAll('.match-tab').forEach(b=>{b.classList.toggle('active',b.dataset.filter===activeFilter);b.onclick=()=>{activeFilter=b.dataset.filter;expanded=false;renderMatches(matchRows);loadDetails(filteredRows().slice(0,2))}});
 document.querySelectorAll('.match-row-detail').forEach(row=>row.onclick=async e=>{
   if(e.target.closest('a,button'))return;
   const id=row.dataset.matchId,m=matchRows.find(x=>x.id===id);
   if(!m||detailLoading.has(id))return;
   if(!detailCache.has(id)){detailLoading.add(id);try{const d=await getJson('/api/match/'+encodeURIComponent(id)+'/summary');detailCache.set(id,{...m,...d})}catch(_){}detailLoading.delete(id)}
   renderMatches(matchRows);
 });
}
async function loadDetails(rows){
 const todo=rows.filter(m=>!detailCache.has(m.id)&&!detailLoading.has(m.id));
 todo.forEach(m=>detailLoading.add(m.id));
 for(let i=0;i<todo.length;i+=3){
  const batch=todo.slice(i,i+3);
  await Promise.all(batch.map(async m=>{
   try{const d=await getJson('/api/match/'+encodeURIComponent(m.id)+'/summary');detailCache.set(m.id,{...m,...d})}catch(_){}
   detailLoading.delete(m.id);
  }));
  renderMatches(matchRows);
 }
}
async function getJson(url){
 const r=await fetch(url,{cache:'no-store'}),d=await r.json().catch(()=>({error:'Invalid server response'}));
 if(!r.ok)throw new Error(d.error||'HTTP '+r.status);
 return d;
}
async function boot(){
 renderPlayers(FALLBACK);
 try{
  const status=await getJson('/api/status');
  $('#apiState').textContent=status.configured?'ONLINE':'OFFLINE';
  $('#statsStatus').textContent=status.configured?'FACEIT API READY':'FACEIT API KEY REQUIRED';
  if(!status.configured){renderMatches([]);return}
  const [players,matches]=await Promise.all([getJson('/api/players'),getJson('/api/matches')]);
  if(Array.isArray(players))renderPlayers(players);
  renderMatches(Array.isArray(matches)?matches:[]);
  loadDetails([...new Map([...filteredRows().slice(0,2), ...(live?[live]:[])].map(x=>[x.id,x])).values()]);
  $('#liveState').textContent='FACEIT LINKED';$('#apiState').textContent='ONLINE';
 }catch(e){
  $('#apiState').textContent='ERROR';$('#statsStatus').textContent='FACEIT API ERROR';$('#liveState').textContent='API ERROR';
  $('#allMatches').innerHTML='<div class="panel" style="padding:25px">FACEIT API error: '+esc(e.message)+'</div>';
 }
}
boot();