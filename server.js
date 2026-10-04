const express=require('express');
const path=require('path');
require('dotenv').config();
const app=express();
const PORT=process.env.PORT||3000;
const TEAM_ID=process.env.FACEIT_TEAM_ID||'a15fd8cf-bda5-4456-9445-86688331562e';
const API='https://open.faceit.com/data/v4';
const KEY=process.env.FACEIT_API_KEY;
const apiCache=new Map();
const apiInflight=new Map();
let apiTail=Promise.resolve();
let lastApiRequestAt=0;
const API_CACHE_TTL=300000;
const PLAYER_DETAIL_TTL=900000;
const playerDetailCache=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function faceit(endpoint){
  if(!KEY||KEY.includes('PASTE_YOUR'))throw new Error('FACEIT_API_KEY is not configured');
  const now=Date.now(),cached=apiCache.get(endpoint);
  if(cached&&now-cached.at<API_CACHE_TTL)return cached.data;
  if(apiInflight.has(endpoint))return apiInflight.get(endpoint);
  const job=apiTail.then(async()=>{
    const gap=Date.now()-lastApiRequestAt;
    if(gap<800)await sleep(800-gap);
    let lastStatus=0;
    for(let attempt=0;attempt<3;attempt++){
      lastApiRequestAt=Date.now();
      const r=await fetch(API+endpoint,{headers:{Authorization:'Bearer '+KEY,Accept:'application/json'}});
      if(r.ok){
        const data=await r.json();
        apiCache.set(endpoint,{at:Date.now(),data});
        return data;
      }
      lastStatus=r.status;
      if(r.status===429){await sleep(10000*(attempt+1));continue;}
      throw new Error('FACEIT API '+r.status);
    }
    throw new Error('FACEIT API '+lastStatus);
  });
  apiTail=job.catch(()=>{});
  apiInflight.set(endpoint,job);
  try{return await job;}finally{apiInflight.delete(endpoint);}
}
const playerUrl=n=>'https://www.faceit.com/ru/players/'+encodeURIComponent(n);
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const val=(s,ks)=>{for(const k of ks)if(s?.[k]!==undefined&&s[k]!==null&&s[k]!=='')return num(s[k]);return null};
const ratingFromStats=s=>{for(const [k,v] of Object.entries(s||{})){if(/rating/i.test(k)){const n=num(v);if(n!==null)return n}}return null};
const ours=(p,ids,names)=>{const id=String(p?.player_id||''),n=String(p?.nickname||p?.game_player_name||'').toLowerCase();return(ids.has(id)||names.has(n))};
const ourSide=(teams,ids,names)=>Object.values(teams||{}).find(s=>(s.players||s.roster||[]).some(p=>ours(p,ids,names)));
const sideEntries=teams=>Object.entries(teams||{});
const sideKey=(teams,side)=>sideEntry=>sideEntry?.[1]===side;
const score=(m,s)=>{
  if(!s)return null;
  const scores=m?.results?.score||{};
  if(s.team_id&&scores[s.team_id]!=null)return num(scores[s.team_id]);
  const entry=sideEntries(m.teams).find(sideKey(m.teams,s));
  if(entry&&scores[entry[0]]!=null)return num(scores[entry[0]]);
  const faction=s.faction_id;
  if(faction&&scores[faction]!=null)return num(scores[faction]);
  for(const dr of m?.detailed_results||[]){
    const fs=dr?.factions||{};
    if(s.team_id&&fs[s.team_id]?.score!=null)return num(fs[s.team_id].score);
    if(entry&&fs[entry[0]]?.score!=null)return num(fs[entry[0]].score);
    if(faction&&fs[faction]?.score!=null)return num(fs[faction].score);
  }
  return null;
};
const winnerFor=(m,s)=>{
  if(!s)return null;
  if(m?.results?.winner){
    if(s.team_id&&m.results.winner===s.team_id)return true;
    const entry=sideEntries(m.teams).find(sideKey(m.teams,s));
    if(entry&&m.results.winner===entry[0])return true;
    if(s.faction_id&&m.results.winner===s.faction_id)return true;
  }
  const entry=sideEntries(m.teams).find(sideKey(m.teams,s));
  for(const dr of m?.detailed_results||[]){
    if(!dr?.winner)continue;
    if(s.team_id&&dr.winner===s.team_id)return true;
    if(entry&&dr.winner===entry[0])return true;
    if(s.faction_id&&dr.winner===s.faction_id)return true;
  }
  return null;
};

const normalizedStatKey=k=>String(k||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const statAny=(s,keys)=>{
  const obj=s||{},map={};
  for(const [k,v] of Object.entries(obj))map[normalizedStatKey(k)]=v;
  for(const k of keys){
    const v=map[normalizedStatKey(k)];
    if(v!==undefined&&v!==null&&v!=='')return num(v);
  }
  return null;
};
const clutchStats=s=>{
  let attempts=0,wins=0;
  for(let n=1;n<=5;n++){
    const count=statAny(s,['1v'+n+'Count','1v'+n+' Count']);
    const win=statAny(s,['1v'+n+'Wins','1v'+n+' Win','1v'+n+' Won']);
    if(count!==null)attempts+=count;
    if(win!==null)wins+=win;
  }
  return {attempts,wins};
};

const limitMap=async(items,limit,fn)=>{
  const out=new Array(items.length);
  let next=0;
  const worker=async()=>{
    while(true){
      const i=next++;
      if(i>=items.length)return;
      try{out[i]=await fn(items[i],i)}catch(_){out[i]=null}
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
};

let rosterStatsCache=null;
let rosterStatsCacheAt=0;
const rosterStatsCacheTtl=120000;

app.use(express.static(path.join(__dirname,'public')));
app.get('/api/status',(_q,res)=>res.json({configured:Boolean(KEY&&!KEY.includes('PASTE_YOUR')),teamId:TEAM_ID}));
app.get('/api/team',async(_q,res)=>{try{res.json(await faceit('/teams/'+TEAM_ID))}catch(e){res.status(503).json({error:e.message})}});
app.get('/api/team-stats',async(_q,res)=>{try{res.json(await faceit('/teams/'+TEAM_ID+'/stats/cs2'))}catch(e){res.status(503).json({error:e.message})}});

app.get('/api/players',async(_q,res)=>{
 try{
  const t=await faceit('/teams/'+TEAM_ID),ms=t.members||[];
  const out=ms.map(m=>({
    id:m.user_id,nickname:m.nickname,avatar:m.avatar||'',country:m.country||'RU',
    faceitUrl:String(m.faceit_url||'').replace('{lang}','ru')||playerUrl(m.nickname),
    skillLevel:m.skill_level??null,elo:m.faceit_elo??null,status:'active',verified:null
  }));
  res.json(out);
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/roster-stats',async(_q,res)=>{
 try{
  if(rosterStatsCache&&Date.now()-rosterStatsCacheAt<rosterStatsCacheTtl)return res.json(rosterStatsCache);
  const team=await faceit('/teams/'+TEAM_ID),members=team.members||[];
  const core=await limitMap(members,2,async member=>{
    try{
      const data=await faceit('/players/'+member.user_id+'/games/cs2/stats?limit=20');
      return (data.items||[]).map(x=>x.stats||x).filter(Boolean);
    }catch(_){return []}
  });

  // Pull a small shared pool of recent match-stat payloads. This avoids requesting
  // the same match once per player and gives us the real 1v1..1v5 clutch fields.
  const histories=await limitMap(members,2,async member=>{
    try{return await faceit('/players/'+member.user_id+'/history?game=cs2&limit=20')}catch(_){return {items:[]}}
  });
  const ids=[];
  const seen=new Set();
  for(const h of histories)for(const x of h?.items||[]){
    if(x.match_id&&!seen.has(x.match_id)){seen.add(x.match_id);ids.push(x.match_id)}
  }
  const recentMatchIds=ids.slice(0,20);
  const matchPayloads=await limitMap(recentMatchIds,2,async id=>{
    try{return {id,data:await faceit('/matches/'+id+'/stats')}}catch(_){return null}
  });

  const byPlayer=new Map();
  for(const payload of matchPayloads.filter(Boolean)){
    for(const round of payload.data?.rounds||[]){
      for(const side of round.teams||[]){
        for(const p of side.players||[]){
          const key=String(p.player_id||p.nickname||'').toLowerCase();
          if(!key)continue;
          const e=byPlayer.get(key)||{attempts:0,wins:0};
          const cl=clutchStats(p.player_stats||{});
          e.attempts+=cl.attempts;e.wins+=cl.wins;
          byPlayer.set(key,e);
        }
      }
    }
  }

  const out=members.map((member,i)=>{
    const stats=core[i]||[];
    let wins=0,kills=0,deaths=0,adrSum=0,adrCount=0,kdSum=0,kdCount=0;
    for(const st of stats){
      const r=String(st?.Result??st?.result??'').toLowerCase();
      if(r==='1'||r==='win'||r==='won'||r==='victory')wins++;
      const k=statAny(st,['Kills','K']),d=statAny(st,['Deaths','D']);
      const kd=statAny(st,['K/D Ratio','K/D','KD','kd_ratio']) ?? (k!==null&&d!==null&&d>0?k/d:null);
      const adr=statAny(st,['ADR','Average Damage per Round','average_damage_per_round']);
      if(k!==null)kills+=k;if(d!==null)deaths+=d;
      if(kd!==null){kdSum+=kd;kdCount++}
      if(adr!==null){adrSum+=adr;adrCount++}
    }
    const pid=String(member.user_id||'').toLowerCase();
    const nickname=String(member.nickname||'').toLowerCase();
    const cl=byPlayer.get(pid)||byPlayer.get(nickname)||{attempts:0,wins:0};
    const clutchRate=cl.attempts?Math.round(cl.wins/cl.attempts*1000)/10:null;
    return {
      nickname:member.nickname,matches:stats.length,wins,
      winRate:stats.length?Math.round(wins/stats.length*1000)/10:null,
      kd:kdCount?Math.round(kdSum/kdCount*100)/100:null,
      adr:adrCount?Math.round(adrSum/adrCount*10)/10:null,
      clutchRate,clutchAttempts:cl.attempts,clutchWins:cl.wins,
      avgKills:stats.length?Math.round(kills/stats.length*100)/100:null
    };
  });
  rosterStatsCache=out;rosterStatsCacheAt=Date.now();res.json(out);
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/matches',async(_q,res)=>{
 try{
  const t=await faceit('/teams/'+TEAM_ID),ms=t.members||[],ids=new Set(ms.map(m=>String(m.user_id))),names=new Set(ms.map(m=>String(m.nickname||'').toLowerCase())),map=new Map();
  await Promise.all(ms.map(async m=>{try{const h=await faceit('/players/'+m.user_id+'/history?game=cs2&limit=30');for(const x of h.items||[])if(x.match_id&&!map.has(x.match_id))map.set(x.match_id,x)}catch(_){}}));
  const out=[...map.values()].sort((a,b)=>(b.finished_at||b.started_at||0)-(a.finished_at||a.started_at||0)).slice(0,30).map(m=>{
   const sides=Object.values(m.teams||{}),p=new Set(),participants=[];
   for(const s of sides)for(const x of s.players||[])if(ours(x,ids,names)){const k=String(x.player_id||x.nickname||'').toLowerCase();if(!p.has(k)){p.add(k);participants.push(x.nickname||x.game_player_name)}}
   if(!participants.length)for(const id of m.playing_players||[]){const mm=ms.find(x=>String(x.user_id)===String(id));if(mm)participants.push(mm.nickname)}
   const count=participants.length;if(!count)return null;
   const os=ourSide(m.teams,ids,names),opp=sides.find(s=>s!==os),a=score(m,os),b=score(m,opp);
   let won=winnerFor(m,os);if(won===null&&a!==null&&b!==null)won=a>b;
   return{id:m.match_id,url:m.faceit_url,status:m.status,won,opponent:opp?.nickname||'FACEIT MATCH',ourScore:a,opponentScore:b,date:m.finished_at?new Date(Number(m.finished_at)<100000000000?Number(m.finished_at)*1000:Number(m.finished_at)).toLocaleDateString('ru-RU'):'—',timestamp:m.finished_at||m.started_at||0,map:m.game_data?.map||m.game_data?.maps?.[0]||m.map||'CS2',matchType:count===5?'TEAM':count>=2?'STACK':'SOLO',participantCount:count,participants,detailsLoaded:false};
  }).filter(Boolean);
  res.json(out);
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/live-match',async(req,res)=>{
 try{
  const team=await faceit('/teams/'+TEAM_ID),members=team.members||[];
  const ids=new Set(members.map(m=>String(m.user_id))),names=new Set(members.map(m=>String(m.nickname||'').toLowerCase()));
  const wanted=String(req.query.matchId||'').trim();
  let match=null;

  if(wanted){
    const variants=wanted.startsWith('1-')?[wanted]:['1-'+wanted,wanted];
    for(const id of variants){
      try{match=await faceit('/matches/'+encodeURIComponent(id));if(match)break}catch(_){}
    }
  }

  if(!match){
    const histories=await limitMap(members,2,async m=>{
      try{return await faceit('/players/'+m.user_id+'/history?game=cs2&limit=10')}catch(_){return {items:[]}}
    });
    const active=new Map();
    for(const h of histories)for(const m of h?.items||[]){
      const st=String(m.status||'').toLowerCase();
      if(['ongoing','started','in_progress','live','ready','configuring'].includes(st)&&m.match_id)active.set(m.match_id,m);
    }
    const candidates=[...active.values()].sort((a,b)=>(b.started_at||b.configured_at||0)-(a.started_at||a.configured_at||0));
    for(const item of candidates){
      try{match=await faceit('/matches/'+encodeURIComponent(item.match_id));if(match)break}catch(_){}
    }
  }

  if(!match)return res.json(null);
  const sides=Object.values(match.teams||{}),os=ourSide(match.teams,ids,names),opp=sides.find(s=>s!==os);
  if(!os)return res.json(null);
  const a=score(match,os),b=score(match,opp);
  const participants=[];
  for(const x of os.players||os.roster||[])if(ours(x,ids,names))participants.push(x.nickname||x.game_player_name);
  res.json({
    id:match.match_id,status:match.status||'UNKNOWN',ourScore:a,opponentScore:b,
    opponent:opp?.nickname||'WAITING',map:match.game_data?.map||match.game_data?.maps?.[0]||match.map||'CS2',
    date:match.started_at?new Date(Number(match.started_at)<100000000000?Number(match.started_at)*1000:Number(match.started_at)).toLocaleDateString('ru-RU'):'—',
    matchType:participants.length===5?'TEAM':participants.length>=2?'STACK':'SOLO',
    participantCount:participants.length,participants,
    faceitUrl:String(match.faceit_url||'').replace('{lang}','ru')
  });
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/match/:id/summary',async(req,res)=>{
 try{
  const t=await faceit('/teams/'+TEAM_ID),ms=t.members||[],
    ids=new Set(ms.map(m=>String(m.user_id))),names=new Set(ms.map(m=>String(m.nickname||'').toLowerCase())),
    id=encodeURIComponent(req.params.id);
  const [m,st]=await Promise.all([faceit('/matches/'+id),faceit('/matches/'+id+'/stats').catch(()=>null)]);
  const sides=Object.values(m.teams||{}),os=ourSide(m.teams,ids,names),opp=sides.find(s=>s!==os);
  const a=score(m,os),b=score(m,opp);
  const sm=new Map(),oppStats=new Map();

  for(const r of st?.rounds||[]){
    for(const t of r.teams||[]){
      for(const p of t.players||[]){
        const mine=ours(p,ids,names),target=mine?sm:oppStats;
        const k=String(p.player_id||p.nickname||'').toLowerCase();
        const s=p.player_stats||{};
        const e=target.get(k)||{
          id:p.player_id||null,nickname:p.nickname||p.game_player_name||'UNKNOWN',
          kills:0,deaths:0,assists:0,adr:0,ac:0,rt:0,rc:0,
          clutchAttempts:0,clutchWins:0
        };
        const kls=statAny(s,['Kills','K']),d=statAny(s,['Deaths','D']),as=statAny(s,['Assists','A']);
        const adr=statAny(s,['ADR','Average Damage per Round','average_damage_per_round']);
        const rt=statAny(s,['Rating','Player Rating','player_rating','rating_value','HLTV Rating','Rating 2.0','rating_2_0','Game Rating']) ?? ratingFromStats(s);
        const cl=clutchStats(s);
        if(kls!==null)e.kills+=kls;if(d!==null)e.deaths+=d;if(as!==null)e.assists+=as;
        if(adr!==null){e.adr+=adr;e.ac++}if(rt!==null){e.rt+=rt;e.rc++}
        e.clutchAttempts+=cl.attempts;e.clutchWins+=cl.wins;
        target.set(k,e);
      }
    }
  }

  const finalize=x=>({...x,
    rating:x.rc?x.rt/x.rc:null,
    kd:x.deaths?x.kills/x.deaths:x.kills,
    adr:x.ac?x.adr/x.ac:null,
    clutchRate:x.clutchAttempts?x.clutchWins/x.clutchAttempts*100:null
  });
  const players=[...sm.values()].map(finalize).sort((x,y)=>(y.rating??-999)-(x.rating??-999)||y.kills-x.kills);
  const opponentPlayers=[...oppStats.values()].map(finalize).sort((x,y)=>(y.rating??-999)-(x.rating??-999)||y.kills-x.kills);

  // Match details contain the authoritative rosters even if match stats are partial.
  const rosterFor=s=>Array.isArray(s?.players||s?.roster)?(s.players||s.roster).map(p=>({
    id:p.player_id||null,nickname:p.nickname||p.game_player_name||'UNKNOWN',
    avatar:p.avatar||'',skillLevel:p.game_skill_level??p.skill_level??null,playing:p.playing!==false
  })):[];

  const ourRoster=rosterFor(os);
  const oppRoster=rosterFor(opp);
  const mergeRoster=(base,stats)=>base.map(p=>{
    const hit=stats.find(x=>String(x.id||'').toLowerCase()===String(p.id||'').toLowerCase()||String(x.nickname).toLowerCase()===String(p.nickname).toLowerCase());
    return hit?Object.assign({},p,hit):p;
  });

  let won=winnerFor(m,os);if(won===null&&a!==null&&b!==null)won=a>b;
  const date=m.finished_at||m.started_at||m.configured_at||null;
  res.json({
    id:m.match_id,status:m.status,opponent:opp?.nickname||'FACEIT MATCH',
    opponentTeam:opp?.nickname||'FACEIT MATCH',
    ourTeam:os?.nickname||'ANONVC',
    ourScore:a,opponentScore:b,won,
    map:m.game_data?.map||m.game_data?.maps?.[0]||m.map||'CS2',
    date:date?new Date(Number(date)<100000000000?Number(date)*1000:Number(date)).toLocaleDateString('ru-RU'):'—',
    mvp:players[0]||null,
    players:mergeRoster(ourRoster,players),
    opponentPlayers:mergeRoster(oppRoster,opponentPlayers),
    ourRoster,opponentRoster:oppRoster,
    roundCount:Array.isArray(st?.rounds)?st.rounds.length:null,
    detailsLoaded:true
  });
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/match/:id',async(req,res)=>{try{const id=encodeURIComponent(req.params.id),[match,stats]=await Promise.all([faceit('/matches/'+id),faceit('/matches/'+id+'/stats').catch(()=>null)]);res.json({match,stats})}catch(e){res.status(503).json({error:e.message})}});
app.get('*',(_q,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('AnonVC 2.0 listening on :'+PORT));