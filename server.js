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
const API_CACHE_TTL=45000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function faceit(endpoint){
  if(!KEY||KEY.includes('PASTE_YOUR'))throw new Error('FACEIT_API_KEY is not configured');
  const now=Date.now(),cached=apiCache.get(endpoint);
  if(cached&&now-cached.at<API_CACHE_TTL)return cached.data;
  if(apiInflight.has(endpoint))return apiInflight.get(endpoint);
  const job=apiTail.then(async()=>{
    const gap=Date.now()-lastApiRequestAt;
    if(gap<300)await sleep(300-gap);
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
      if(r.status===429){await sleep(1200*(attempt+1));continue;}
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
  if(m?.results?.winner&&s.team_id)return m.results.winner===s.team_id;
  const entry=sideEntries(m.teams).find(sideKey(m.teams,s));
  if(entry&&m?.results?.winner)return m.results.winner===entry[0];
  for(const dr of m?.detailed_results||[]){
    if(!dr?.winner)continue;
    if(s.team_id&&dr.winner===s.team_id)return true;
    if(entry&&dr.winner===entry[0])return true;
    if(s.faction_id&&dr.winner===s.faction_id)return true;
  }
  return null;
};

const clutchStats=s=>{
  let attempts=0,wins=0;
  for(let n=1;n<=5;n++){
    const count=val(s,['1v'+n+'Count']);
    const win=val(s,['1v'+n+'Wins']);
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
    id:m.user_id,nickname:m.nickname,avatar:m.avatar||'',country:m.country||'',
    faceitUrl:String(m.faceit_url||'').replace('{lang}','ru')||playerUrl(m.nickname),
    skillLevel:m.skill_level??null,elo:m.faceit_elo??null
  }));
  res.json(out);
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/roster-stats',async(_q,res)=>{
 try{
  if(rosterStatsCache&&Date.now()-rosterStatsCacheAt<API_CACHE_TTL)return res.json(rosterStatsCache);
  const team=await faceit('/teams/'+TEAM_ID),members=team.members||[];
  const out=[];
  for(const member of members){
    let stats=[];
    try{
      const data=await faceit('/players/'+member.user_id+'/games/cs2/stats?limit=20');
      stats=(data.items||[]).map(x=>x.stats||x).filter(Boolean);
    }catch(_){}
    let wins=0,kills=0,deaths=0,adrSum=0,adrCount=0,kdSum=0,kdCount=0,clutchAttempts=0,clutchWins=0;
    for(const st of stats){
      const r=String(st?.Result??st?.result??'').toLowerCase();
      if(r==='1'||r==='win'||r==='won'||r==='victory')wins++;
      const k=val(st,['Kills','kills','K']),d=val(st,['Deaths','deaths','D']);
      const kd=val(st,['K/D Ratio','K/D','KD','kd_ratio']) ?? (k!==null&&d!==null&&d>0?k/d:null);
      const adr=val(st,['ADR','adr','Average Damage per Round','average_damage_per_round']);
      if(k!==null)kills+=k;if(d!==null)deaths+=d;
      if(kd!==null){kdSum+=kd;kdCount++;}
      if(adr!==null){adrSum+=adr;adrCount++;}
      const cl=clutchStats(st);clutchAttempts+=cl.attempts;clutchWins+=cl.wins;
    }
    out.push({
      nickname:member.nickname,matches:stats.length,wins,
      winRate:stats.length?Math.round(wins/stats.length*1000)/10:null,
      kd:kdCount?Math.round(kdSum/kdCount*100)/100:null,
      adr:adrCount?Math.round(adrSum/adrCount*10)/10:null,
      clutchRate:clutchAttempts?Math.round(clutchWins/clutchAttempts*1000)/10:null,
      clutchAttempts,clutchWins,
      avgKills:stats.length?Math.round(kills/stats.length*100)/100:null
    });
  }
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

app.get('/api/match/:id/summary',async(req,res)=>{
 try{
  const t=await faceit('/teams/'+TEAM_ID),ms=t.members||[],ids=new Set(ms.map(m=>String(m.user_id))),names=new Set(ms.map(m=>String(m.nickname||'').toLowerCase())),id=encodeURIComponent(req.params.id);
  const [m,st]=await Promise.all([faceit('/matches/'+id),faceit('/matches/'+id+'/stats').catch(()=>null)]);
  const sides=Object.values(m.teams||{}),os=ourSide(m.teams,ids,names),opp=sides.find(s=>s!==os),a=score(m,os),b=score(m,opp);
  const sm=new Map();
  for(const r of st?.rounds||[])for(const t of r.teams||[])for(const p of t.players||[])if(ours(p,ids,names)){
   const k=String(p.player_id||p.nickname||''),s=p.player_stats||{},e=sm.get(k)||{nickname:p.nickname||p.game_player_name||'UNKNOWN',kills:0,deaths:0,assists:0,rt:0,rc:0};
   const kls=val(s,['Kills','kills','K']),d=val(s,['Deaths','deaths','D']),as=val(s,['Assists','assists','A']),adr=val(s,['ADR','adr','Average Damage per Round','average_damage_per_round']),rt=val(s,['Rating','rating','Player Rating','player_rating','rating_value','HLTV Rating','HLTV rating','HLTV_Rating','Rating 2.0','rating_2_0','Game Rating']) ?? ratingFromStats(s) ?? num(p?.rating ?? p?.player_rating ?? p?.stats?.Rating ?? p?.stats?.rating ?? p?.stats?.['HLTV Rating'] ?? p?.stats?.['Rating 2.0']);
   if(kls!==null)e.kills+=kls;if(d!==null)e.deaths+=d;if(as!==null)e.assists+=as;if(adr!==null){e.adr=(e.adr||0)+adr;e.ac=(e.ac||0)+1}if(rt!==null){e.rt+=rt;e.rc++}sm.set(k,e);
  }
  const players=[...sm.values()].map(x=>({...x,rating:x.rc?x.rt/x.rc:null,kd:x.deaths?x.kills/x.deaths:x.kills,adr:x.ac?x.adr/x.ac:null})).sort((x,y)=>(y.rating??-999)-(x.rating??-999)||y.kills-x.kills||y.kd-x.kd);
  let won=winnerFor(m,os);if(won===null&&a!==null&&b!==null)won=a>b;
  res.json({id:m.match_id,status:m.status,opponent:opp?.nickname||'FACEIT MATCH',ourScore:a,opponentScore:b,won,map:m.game_data?.map||m.game_data?.maps?.[0]||m.map||'CS2',mvp:players[0]||null,players,detailsLoaded:true});
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/match/:id',async(req,res)=>{try{const id=encodeURIComponent(req.params.id),[match,stats]=await Promise.all([faceit('/matches/'+id),faceit('/matches/'+id+'/stats').catch(()=>null)]);res.json({match,stats})}catch(e){res.status(503).json({error:e.message})}});
app.get('*',(_q,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('AnonVC 2.0 listening on :'+PORT));