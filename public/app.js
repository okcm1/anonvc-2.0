const FALLBACK = [
  {nickname:'okcm1',role:'AWPer',faceitUrl:'https://www.faceit.com/ru/players/okcm1'},
  {nickname:'nesternoid',role:'Rifler / Second AWPer',faceitUrl:'https://www.faceit.com/ru/players/nesternoid'},
  {nickname:'Byrga_',role:'Rifler',faceitUrl:'https://www.faceit.com/ru/players/Byrga_'},
  {nickname:'undeadstar10',role:'Support',faceitUrl:'https://www.faceit.com/ru/players/undeadstar10'},
  {nickname:'zerox252',role:'Entry Fragger',faceitUrl:'https://www.faceit.com/ru/players/zerox252'}
];

var $ = function(s){ return document.querySelector(s); };
var esc = function(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
};
var safeUrl = function(s){
  var u=String(s||'').replace('/{lang}/','/ru/');
  return /^https:\/\/www\.faceit\.com\/(?:ru\/)?(?:players|teams|matches)\//i.test(u) ? u : '#';
};
var avatar = function(p){
  return p && p.avatar ? '<img class="avatar-img" src="'+esc(p.avatar)+'" alt="">' :
    esc(p && p.nickname ? p.nickname.charAt(0).toUpperCase() : '?');
};
var mergedPlayers = function(ps){
  ps=Array.isArray(ps)?ps:[];
  return FALLBACK.map(function(f){
    var found=ps.find(function(p){return p.nickname===f.nickname;});
    return Object.assign({},f,found||{});
  });
};

var rosterPerformance={};

function renderRosterPerformance(stats){
  rosterPerformance={};
  (Array.isArray(stats)?stats:[]).forEach(function(s){rosterPerformance[s.nickname]=s;});
  document.querySelectorAll('.roster-card').forEach(function(card){
    var key=card.getAttribute('data-player');
    var s=rosterPerformance[key];
    var box=card.querySelector('.roster-metrics');
    if(!box)return;
    box.innerHTML=
      '<div><small>K/D</small><b>'+(s&&s.kd!=null?s.kd.toFixed(2):'—')+'</b></div>'+
      '<div><small>AVG</small><b>'+(s&&s.avgKills!=null?s.avgKills.toFixed(2):'—')+'</b></div>'+
      '<div><small>ADR</small><b>'+(s&&s.adr!=null?s.adr.toFixed(1):'—')+'</b></div>'+
      '<div><small>CLUTCH</small><b>'+(s&&s.clutchRate!=null?s.clutchRate.toFixed(1)+'%':'—')+'</b></div>'+
      '<div><small>WINRATE</small><b>'+(s&&s.winRate!=null?s.winRate.toFixed(1)+'%':'—')+'</b></div>'+
      '<div><small>MATCHES</small><b>'+(s&&s.matches!=null?s.matches:'—')+'</b></div>';
  });
}

function renderPlayers(players){
  var m=mergedPlayers(players);
  var list=$('#operatorList'), grid=$('#rosterGrid');
  if(list) list.innerHTML=m.map(function(p){
    return '<div class="operator"><div class="avatar">'+avatar(p)+'</div><div><strong>'+esc(p.nickname)+'</strong><small>'+esc(p.role||'Operator')+' · FACEIT '+(p.skillLevel==null?'—':p.skillLevel)+'</small></div><span class="lvl">'+(p.elo==null?'—':p.elo)+'</span></div>';
  }).join('');
  if(grid) grid.innerHTML=m.map(function(p){
    return '<article class="panel roster-card" data-player="'+esc(p.nickname)+'"><div class="roster-photo">'+avatar(p)+'</div><div class="roster-identity"><h2>'+esc(p.nickname)+'</h2><p>'+esc(p.role||'Operator')+' · LVL '+(p.skillLevel==null?'—':p.skillLevel)+' · ELO '+(p.elo==null?'—':p.elo)+'</p></div><div class="roster-metrics"><div><small>MATCHES</small><b>—</b></div><div><small>K/D</small><b>—</b></div><div><small>ADR</small><b>—</b></div><div><small>CLUTCH</small><b>—</b></div><div><small>WINRATE</small><b>—</b></div></div><a class="roster-link" href="'+esc(safeUrl(p.faceitUrl))+'" target="_blank" rel="noopener">FACEIT PROFILE ↗</a></article>';
  }).join('');
  renderRosterPerformance(m.map(function(p){return Object.assign({nickname:p.nickname,matches:null},p.rosterStats||{});}));
  renderPlayerStats(m);
}

function renderPlayerStats(ps){
  var el=$('#playerStats');
  if(!el)return;
  var s=ps.slice().sort(function(a,b){return (b.elo==null?-1:b.elo)-(a.elo==null?-1:a.elo);});
  el.innerHTML=s.map(function(p,i){
    return '<div class="player-stat-row"><span class="rank">0'+(i+1)+'</span><div class="player-stat-avatar avatar">'+avatar(p)+'</div><div class="player-stat-name"><strong>'+esc(p.nickname)+'</strong><small>'+esc(p.role||'Operator')+'</small></div><div><small>LEVEL</small><b>'+(p.skillLevel==null?'—':p.skillLevel)+'</b></div><div><small>ELO</small><b>'+(p.elo==null?'—':p.elo)+'</b></div><a href="'+esc(safeUrl(p.faceitUrl))+'" target="_blank" rel="noopener">PROFILE ↗</a></div>';
  }).join('');
}

var matchRows=[];
var expanded=false;
var activeFilter='TEAM';
var detailCache=new Map();
var detailLoading=new Set();

function typeLabel(m){
  return m.matchType==='TEAM'?'TEAM MATCH':m.matchType==='STACK'?'STACK · '+m.participantCount+'/5':'SOLO MATCH · 1/5';
}
function resultLabel(m){return m.won===true?'WIN':m.won===false?'LOSS':'—';}
function resultClass(m){return m.won===true?'win':m.won===false?'loss':'unknown';}
function detailFor(m){return detailCache.get(m.id)||m;}
function mvpHtml(m){
  var p=detailFor(m).mvp;
  return p ? '<small class="mvp">MVP <b>'+esc(p.nickname)+'</b></small>' : '<small class="mvp">MVP —</small>';
}
function rowHtml(m){
  var d=detailFor(m);
  var score=d.ourScore!=null && d.opponentScore!=null ? d.ourScore+' : '+d.opponentScore : '— : —';
  var detail=d.players && d.players.length ? '<div class="match-expanded"><div class="match-expanded-head">TEAM PERFORMANCE</div>'+
    d.players.slice(0,5).map(function(p){return '<div class="player-line"><b>'+esc(p.nickname)+'</b><span>'+p.kills+'K / '+p.deaths+'D / '+p.assists+'A</span></div>';}).join('')+
    '</div>' : '';
  return '<div class="match-card"><div class="match-row match-row-detail" data-match-id="'+esc(m.id)+'"><span class="result '+resultClass(d)+'">'+resultLabel(d)+'</span><div><strong>'+esc(typeLabel(m))+'</strong><small>'+esc(d.opponent||m.opponent)+' · '+esc(d.map||m.map)+' · '+esc(m.date)+'</small>'+mvpHtml(m)+'</div><div class="score">'+score+'</div><a href="'+esc(safeUrl(m.url))+'" target="_blank" rel="noopener">FACEIT ↗</a></div>'+detail+'</div>';
}
function emptyHtml(){
  return '<div class="match-row"><span class="result">—</span><div><strong>NO MATCH DATA</strong><small>FACEIT returned no player matches yet.</small></div><div class="score">—</div><span>WAITING</span></div>';
}
function controlsHtml(total){
  if(total<=2)return '';
  return '<button class="show-all-matches" type="button">'+(expanded?'СКРЫТЬ':'ПОКАЗАТЬ ВСЕ')+' · '+total+' МАТЧЕЙ '+(expanded?'↑':'↓')+'</button>';
}
function filteredRows(){return matchRows.filter(function(m){return m.matchType===activeFilter;});}

function renderAdvancedStats(team){
  team=Array.isArray(team)?team:[];
  var loaded=team.map(function(m){return detailCache.get(m.id);}).filter(function(d){return d&&Array.isArray(d.players)&&d.players.length;});
  var all=[]; loaded.forEach(function(d){d.players.forEach(function(p){all.push(p);});});
  var totalKills=0,totalAdr=0,adrN=0,by={};
  all.forEach(function(p){totalKills+=Number(p.kills)||0;if(p.adr!=null){totalAdr+=Number(p.adr);adrN++;}var e=by[p.nickname]||{nickname:p.nickname,kills:0,deaths:0,assists:0,adr:0,adrN:0};e.kills+=Number(p.kills)||0;e.deaths+=Number(p.deaths)||0;e.assists+=Number(p.assists)||0;if(p.adr!=null){e.adr+=Number(p.adr);e.adrN++;}by[p.nickname]=e;});
  var top=Object.values(by).sort(function(a,b){return b.kills-a.kills||((b.kills/(b.deaths||1))-(a.kills/(a.deaths||1)));})[0];
  var avgKills=loaded.length?totalKills/(loaded.length*5):null,avgAdr=adrN?totalAdr/adrN:null;
  if($('#avgKills'))$('#avgKills').textContent=avgKills==null?'—':avgKills.toFixed(1);
  if($('#avgAdr'))$('#avgAdr').textContent=avgAdr==null?'—':avgAdr.toFixed(1);
  if($('#topFragger'))$('#topFragger').textContent=top?top.nickname:'—';
  if($('#topFraggerMeta'))$('#topFraggerMeta').textContent=top?(top.kills+' K / '+top.deaths+' D / '+top.assists+' A'):'WAITING FOR MATCH DATA';
  var sf=$('#statsForm');if(sf)sf.innerHTML=team.slice(0,10).map(function(m){var d=detailFor(m),c=d.won===true?'win':d.won===false?'loss':'unknown',label=d.won===true?'W':d.won===false?'L':'—';return '<span class="'+c+'" title="'+esc((d.ourScore||'—')+' : '+(d.opponentScore||'—'))+'">'+label+'</span>';}).join('');
  var tp=$('#teamPerformance');if(tp){var rows=Object.values(by).sort(function(a,b){return b.kills-a.kills;});tp.innerHTML=rows.length?rows.map(function(p,i){var kd=p.deaths?p.kills/p.deaths:p.kills,adr=p.adrN?p.adr/p.adrN:null;return '<div class="team-perf-row"><span class="perf-rank">0'+(i+1)+'</span><b>'+esc(p.nickname)+'</b><span><small>K/D</small>'+kd.toFixed(2)+'</span><span><small>ADR</small>'+(adr==null?'—':adr.toFixed(1))+'</span><span><small>KILLS</small>'+p.kills+'</span><span><small>ASSISTS</small>'+p.assists+'</span></div>';}).join(''):'<div class="team-perf-empty">LOAD TEAM MATCH DETAILS TO BUILD PERFORMANCE</div>';}
}

function renderMatches(matches){
  matchRows=Array.isArray(matches)?matches:[];
  var filtered=filteredRows();
  var teamRows=matchRows.filter(function(m){return m.matchType==='TEAM';});
  var visible=expanded?filtered:filtered.slice(0,2);
  var html=visible.length?visible.map(rowHtml).join(''):'';
  var recent=$('#recentList'), all=$('#allMatches');
  var homeVisible=teamRows.slice(0,2).map(rowHtml).join('');
  if(recent) recent.innerHTML=(homeVisible||emptyHtml());
  if(all) all.innerHTML=(html||'<div class="panel" style="padding:25px">FACEIT API is connected, but no matches were returned for this category.</div>')+controlsHtml(filtered.length);

  var mc=$('#matchCount'); if(mc) mc.textContent=filtered.length?((expanded?filtered.length:Math.min(2,filtered.length))+' SHOWN / '+filtered.length+' '+activeFilter):'0 MATCHES';
  var ms=$('#matchesState'); if(ms) ms.textContent=matchRows.length?'LIVE API':'NO FEED';

  var live=teamRows.find(function(x){return ['ongoing','started','in_progress','live'].indexOf(String(x.status||'').toLowerCase())>=0;});
  var last=live||teamRows[0];
  if(last){
    var d=detailFor(last);
    if($('#heroOurScore')) $('#heroOurScore').textContent=d.ourScore!=null?d.ourScore:'—';
    if($('#heroOpponentScore')) $('#heroOpponentScore').textContent=d.opponentScore!=null?d.opponentScore:'—';
    if($('#heroOpponent')) $('#heroOpponent').textContent=d.opponent||last.opponent||'WAITING';
    if($('#heroMap')) $('#heroMap').textContent=d.map||last.map||'CS2';
    if($('#heroDate')) $('#heroDate').textContent=last.date||'—';
    if($('#liveState')) $('#liveState').textContent=live?'LIVE MATCH':'FACEIT LINKED';
    if($('#heroStatus')) $('#heroStatus').textContent=live?'LIVE MATCH':(last.won===true?'WIN':last.won===false?'LOSS':'LATEST RESULT');
    if($('#heroMode')) $('#heroMode').textContent=last.matchType==='TEAM'?'TEAM MATCH':last.matchType==='STACK'?'STACK MATCH':'SOLO MATCH';
    if($('#heroPlayers')) $('#heroPlayers').textContent=(last.participantCount||'?')+' / 5';
    if($('#heroUpdated')) $('#heroUpdated').textContent=last.date||'—';
  }else{
    if($('#heroOurScore')) $('#heroOurScore').textContent='—';
    if($('#heroOpponentScore')) $('#heroOpponentScore').textContent='—';
    if($('#heroOpponent')) $('#heroOpponent').textContent='NO DATA';
    if($('#heroMap')) $('#heroMap').textContent='NO MATCH LOADED';
    if($('#heroDate')) $('#heroDate').textContent='—';
    if($('#heroStatus')) $('#heroStatus').textContent='NO DATA';
    if($('#heroMode')) $('#heroMode').textContent='—';
    if($('#heroPlayers')) $('#heroPlayers').textContent='—';
    if($('#heroUpdated')) $('#heroUpdated').textContent='—';
  }

  if($('#nextOpponent')) $('#nextOpponent').textContent='—';
  if($('#nextMeta')) $('#nextMeta').textContent='No upcoming match in feed';

  var formTeam=teamRows.slice(0,10);
  var fl=$('#formList');
  if(fl) fl.innerHTML=formTeam.map(function(x){
    var d=detailFor(x), s=d.ourScore!=null&&d.opponentScore!=null?d.ourScore+' : '+d.opponentScore:'— : —';
    var cls=d.won===true?'win-dot':d.won===false?'loss-dot':'unk-dot';
    return '<div class="form-line"><span class="'+cls+'"></span><b>'+s+'</b><small>'+esc(x.date||'—')+'</small></div>';
  }).join('');

  var team=teamRows;
  var wins=team.filter(function(x){return detailFor(x).won===true;}).length;
  var losses=team.filter(function(x){return detailFor(x).won===false;}).length;
  var rate=team.length?Math.round(wins/team.length*100):null;
  if($('#winRate')) $('#winRate').textContent=rate===null?'—':rate+'%';
  if($('#wins')) $('#wins').textContent=team.length?wins:'—';
  if($('#losses')) $('#losses').textContent=team.length?losses:'—';
  if($('#games')) $('#games').textContent=team.length||'—';
  if($('#statsWinRate')) $('#statsWinRate').textContent=rate===null?'—':rate+'%';
  if($('#statsRecord')) $('#statsRecord').textContent=team.length?wins+' — '+losses:'—';
  if($('#statsGames')) $('#statsGames').textContent=team.length||'—';

  renderAdvancedStats(team);

  var dots=$('#formDots');
  if(dots) dots.innerHTML=Array.from({length:10},function(_,i){
    var x=team[i], c=!x?'unknown':detailFor(x).won===true?'win':detailFor(x).won===false?'loss':'unknown';
    var label=c==='win'?'W':c==='loss'?'L':'—'; return '<span class="'+c+'">'+label+'</span>';
  }).join('');

  document.querySelectorAll('.show-all-matches').forEach(function(b){
    b.onclick=function(){expanded=!expanded;renderMatches(matchRows);if(expanded)loadDetails(filteredRows());};
  });
  document.querySelectorAll('.match-tab').forEach(function(b){
    b.classList.toggle('active',b.dataset.filter===activeFilter);
    b.onclick=function(){activeFilter=b.dataset.filter;expanded=false;renderMatches(matchRows);loadDetails(filteredRows().slice(0,2));};
  });
  document.querySelectorAll('.match-row-detail').forEach(function(row){
    row.onclick=async function(e){
      if(e.target.closest('a,button'))return;
      var id=row.dataset.matchId,m=matchRows.find(function(x){return x.id===id;});
      if(!m||detailLoading.has(id))return;
      if(!detailCache.has(id)){
        detailLoading.add(id);
        try{var d=await getJson('/api/match/'+encodeURIComponent(id)+'/summary');detailCache.set(id,Object.assign({},m,d));}catch(_){}
        detailLoading.delete(id);
      }
      renderMatches(matchRows);
    };
  });
}

async function loadDetails(rows){
  var todo=rows.filter(function(m){return !detailCache.has(m.id)&&!detailLoading.has(m.id);});
  todo.forEach(function(m){detailLoading.add(m.id);});
  for(var i=0;i<todo.length;i+=3){
    var batch=todo.slice(i,i+3);
    await Promise.all(batch.map(async function(m){
      try{var d=await getJson('/api/match/'+encodeURIComponent(m.id)+'/summary');detailCache.set(m.id,Object.assign({},m,d));}catch(_){}
      detailLoading.delete(m.id);
    }));
    renderMatches(matchRows);
  }
}

async function getJson(url){
  var r=await fetch(url,{cache:'no-store'});
  var d=await r.json().catch(function(){return {error:'Invalid server response'};});
  if(!r.ok)throw new Error(d.error||'HTTP '+r.status);
  return d;
}

async function boot(){
  renderPlayers(FALLBACK);
  try{
    var status=await getJson('/api/status');
    if($('#apiState')) $('#apiState').textContent=status.configured?'ONLINE':'OFFLINE';
    if($('#statsStatus')) $('#statsStatus').textContent=status.configured?'FACEIT API READY':'FACEIT API KEY REQUIRED';
    if(!status.configured){renderMatches([]);return;}
    var result=await Promise.all([getJson('/api/players'),getJson('/api/matches')]);
    if(Array.isArray(result[0]))renderPlayers(result[0]);
    renderMatches(Array.isArray(result[1])?result[1]:[]);
    getJson('/api/roster-stats').then(function(stats){renderRosterPerformance(stats);}).catch(function(e){console.warn('Roster stats unavailable:',e.message);});
    var liveBoot=matchRows.find(function(x){return ['ongoing','started','in_progress','live'].indexOf(String(x.status||'').toLowerCase())>=0;});
    var first=filteredRows().slice(0,2);
    if(liveBoot)first.push(liveBoot);
    var unique=Array.from(new Map(first.map(function(x){return [x.id,x];})).values());
    loadDetails(unique);
    loadDetails(matchRows.filter(function(x){return x.matchType==='TEAM';}).slice(0,10));
    if($('#liveState')) $('#liveState').textContent='FACEIT LINKED';
    if($('#apiState')) $('#apiState').textContent='ONLINE';
  }catch(e){
    if($('#apiState')) $('#apiState').textContent='ERROR';
    if($('#statsStatus')) $('#statsStatus').textContent='FACEIT API ERROR';
    if($('#liveState')) $('#liveState').textContent='API ERROR';
    if($('#allMatches')) $('#allMatches').innerHTML='<div class="panel" style="padding:25px">FACEIT API error: '+esc(e.message)+'</div>';
    console.error('AnonVC boot error:',e);
  }
}

document.addEventListener('DOMContentLoaded',boot);
