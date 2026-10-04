const express=require('express');
const path=require('path');
require('dotenv').config();
const app=express();
const PORT=process.env.PORT||3000;
const TEAM_ID=process.env.FACEIT_TEAM_ID||'a15fd8cf-bda5-4456-9445-86688331562e';
const API='https://open.faceit.com/data/v4';
const KEY=process.env.FACEIT_API_KEY;
async function faceit(endpoint){
  if(!KEY||KEY.includes('PASTE_YOUR'))throw new Error('FACEIT_API_KEY is not configured');
  const r=await fetch(API+endpoint,{headers:{Authorization:'Bearer '+KEY}});
  if(!r.ok)throw new Error('FACEIT API '+r.status);
  return r.json();
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
const liveMatchIds=new Map();
const liveMatchMeta=new Map();
let lastWebhook={receivedAt:null,event:null,matchId:null};

// FACEIT callback health/check endpoint. FACEIT sends webhook events via POST.
// GET/HEAD are also handled so the callback URL is reachable for endpoint checks.
app.get('/api/faceit/webhook',(_req,res)=>res.status(200).json({ok:true,service:'AnonVC 2.0 webhook'}));
app.head('/api/faceit/webhook',(_req,res)=>res.sendStatus(200));

// FACEIT webhook payloads can differ slightly between event types.
// Walk the payload recursively so match_id is found even when nested.
const findMatchId=(value,depth=0)=>{
  if(value==null||depth>6)return null;
  if(Array.isArray(value)){
    for(const item of value){const found=findMatchId(item,depth+1);if(found)return found;}
    return null;
  }
  if(typeof value!=='object')return null;
  for(const key of ['match_id','matchId']){
    if(value[key])return String(value[key]);
  }
  for(const key of Object.keys(value)){
    const found=findMatchId(value[key],depth+1);
    if(found)return found;
  }
  return null;
};

app.post('/api/faceit/webhook',express.json({limit:'256kb'}),(req,res)=>{
  const body=req.body||{};
  const event=String(body.event||body.type||body.event_type||body.name||body.eventName||'').toLowerCase();
  const id=findMatchId(body);
  lastWebhook={receivedAt:Date.now(),event:event||null,matchId:id||null};

  if(id){
    const now=Date.now(),key=String(id);
    liveMatchIds.set(key,now);
    liveMatchMeta.set(key,{event,receivedAt:now});
    if(event.includes('finished')||event.includes('cancelled')||event.includes('aborted')){
      setTimeout(()=>{
        liveMatchIds.delete(key);
        liveMatchMeta.delete(key);
      },300000);
    }
  }
  res.status(200).json({ok:true});
});

app.get('/api/webhook-status',(_req,res)=>res.json({
  ok:true,
  lastWebhook,
  trackedMatches:[...liveMatchIds.keys()],
  trackedCount:liveMatchIds.size
}));

app.get('/api/live-match',async(_q,res)=>{
  try{
    const team=await faceit('/teams/'+TEAM_ID);
    const ms=team.members||[],ids=new Set(ms.map(x=>String(x.user_id))),names=new Set(ms.map(x=>String(x.nickname||'').toLowerCase()));
    const candidates=new Map();
    for(const [id,t] of liveMatchIds.entries()) candidates.set(id,t);

    // Fallback: inspect the newest match for every roster player.
    await Promise.all(ms.map(async member=>{
      try{
        const h=await faceit('/players/'+member.user_id+'/history?game=cs2&limit=5');
        for(const item of h.items||[]){
          if(item.match_id)candidates.set(String(item.match_id),Date.now());
        }
      }catch(_){}
    }));

    const ordered=[...candidates.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    for(const matchId of ordered.slice(0,12)){
      try{
        const m=await faceit('/matches/'+encodeURIComponent(matchId));
        const status=String(m.status||'').toLowerCase();
        const active=['ongoing','started','in_progress','live','ready','configuring'].includes(status);
        if(['finished','cancelled','aborted'].includes(status)){liveMatchIds.delete(matchId);continue;}
        if(!active)continue;

        const sides=Object.values(m.teams||{});
        const os=ourSide(m.teams,ids,names);
        const participants=[];
        for(const side of sides)for(const p of side.roster||side.players||[])if(ours(p,ids,names)){
          const key=String(p.player_id||p.nickname||'').toLowerCase();
          if(!participants.some(x=>String(x).toLowerCase()===key))participants.push(p.nickname||p.game_player_name);
        }
        if(!participants.length)continue;

        const opp=sides.find(side=>side!==os);
        const a=score(m,os),b=score(m,opp);
        return res.json({
          id:m.match_id,url:m.faceit_url,status,
          opponent:opp?.nickname||'FACEIT MATCH',
          ourScore:a,opponentScore:b,
          date:m.started_at?new Date(Number(m.started_at)*1000).toLocaleDateString('ru-RU'):'—',
          timestamp:m.started_at||Date.now(),
          map:m.game_data?.map||m.game_data?.maps?.[0]||m.map||'CS2',
          matchType:participants.length===5?'TEAM':participants.length>=2?'STACK':'SOLO',
          participantCount:participants.length,participants,live:true,updatedAt:Date.now()
        });
      }catch(_){}
    }
    res.json(null);
  }catch(e){res.status(503).json({error:e.message})}
});
app.get('/api/status',(_q,res)=>res.json({configured:Boolean(KEY&&!KEY.includes('PASTE_YOUR')),teamId:TEAM_ID}));
app.get('/api/team',async(_q,res)=>{try{res.json(await faceit('/teams/'+TEAM_ID))}catch(e){res.status(503).json({error:e.message})}});
app.get('/api/team-stats',async(_q,res)=>{try{res.json(await faceit('/teams/'+TEAM_ID+'/stats/cs2'))}catch(e){res.status(503).json({error:e.message})}});

app.get('/api/players',async(_q,res)=>{
 try{
  const t=await faceit('/teams/'+TEAM_ID),ms=t.members||[];
  const out=await Promise.all(ms.map(async m=>{
   let d={};try{d=await faceit('/players/'+m.user_id)}catch(_){try{d=(await faceit('/players?nickname='+encodeURIComponent(m.nickname)+'&game=cs2'))?.items?.[0]||{}}catch(_){}}
   const c=d.games?.cs2||{};
   return{id:d.player_id||m.user_id,nickname:d.nickname||m.nickname,avatar:d.avatar||m.avatar||'',country:d.country||m.country||'',faceitUrl:String(d.faceit_url||m.faceit_url||'').replace('{lang}','ru')||playerUrl(m.nickname),skillLevel:c.skill_level??m.skill_level??null,elo:c.faceit_elo??m.faceit_elo??null};
  }));
  res.json(out);
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/roster-stats',async(_q,res)=>{
 try{
  if(rosterStatsCache&&Date.now()-rosterStatsCacheAt<rosterStatsCacheTtl)return res.json(rosterStatsCache);
  const team=await faceit('/teams/'+TEAM_ID),members=team.members||[];
  const memberData=await Promise.all(members.map(async member=>{
    let stats=[],history=[];
    try{
      const data=await faceit('/players/'+member.user_id+'/games/cs2/stats?limit=30');
      stats=(data.items||[]).map(x=>x.stats||x).filter(Boolean);
    }catch(_){stats=[];}
    try{
      const h=await faceit('/players/'+member.user_id+'/history?game=cs2&limit=30');
      history=h.items||[];
    }catch(_){history=[];}
    const finishedAt=s=>Number(
      s?.['Match Finished At'] ??
      s?.['match_finished_at'] ??
      s?.['Match Finished At Timestamp'] ??
      0
    );
    stats.sort((a,b)=>finishedAt(b)-finishedAt(a));
    return {member,stats:stats.slice(0,30),history:history.slice(0,30)};
  }));

  const matchIds=[...new Set(memberData.flatMap(x=>x.history.map(m=>m.match_id).filter(Boolean)))];
  const matchStats=await limitMap(matchIds,6,async matchId=>{
    try{return {matchId,data:await faceit('/matches/'+encodeURIComponent(matchId)+'/stats')}}
    catch(_){return null}
  });

  const clutchByPlayer=new Map();
  const addClutch=(playerId,stats)=>{
    const id=String(playerId||'');
    if(!id)return;
    const prev=clutchByPlayer.get(id)||{attempts:0,wins:0};
    const cl=clutchStats(stats||{});
    prev.attempts+=cl.attempts;
    prev.wins+=cl.wins;
    clutchByPlayer.set(id,prev);
  };
  for(const item of matchStats){
    if(!item?.data)continue;
    for(const round of item.data.rounds||[]){
      for(const side of round.teams||[]){
        for(const p of side.players||[])addClutch(p.player_id,p.player_stats);
      }
    }
  }

  const out=memberData.map(({member,stats})=>{
    let wins=0,knownResults=0,kills=0,deaths=0,assists=0,headshots=0,firstKills=0,firstDeaths=0,rounds=0;
    let adrSum=0,adrCount=0,kdSum=0,kdCount=0,hsRateSum=0,hsRateCount=0;
    stats.forEach(st=>{
      const rawResult=st?.Result ?? st?.result ?? null;
      if(rawResult!==null&&rawResult!==''){
        knownResults++;
        const r=String(rawResult).toLowerCase();
        if(rawResult===1||r==='1'||r==='win'||r==='won'||r==='victory')wins++;
      }
      const k=val(st,['Kills','kills','K']),d=val(st,['Deaths','deaths','D']),a=val(st,['Assists','assists','A']);
      const hs=val(st,['Headshots','headshots','HS']);
      const hsPct=val(st,['Headshots %','Headshot %','headshot_percent','Headshot Percentage']);
      const fk=val(st,['First Kills','First kills','first_kills','First Kill']);
      const fd=val(st,['First Deaths','First deaths','first_deaths','First Death']);
      const rds=val(st,['Rounds','rounds','Rounds Played','rounds_played']);
      const directKd=val(st,['K/D','K/D Ratio','K/D ratio','KD','kd','Average K/D','Average K/D Ratio']);
      const adr=val(st,['ADR','adr','Average Damage per Round','average_damage_per_round']);
      if(k!==null)kills+=k;if(d!==null)deaths+=d;if(a!==null)assists+=a;
      if(hs!==null)headshots+=hs;if(fk!==null)firstKills+=fk;if(fd!==null)firstDeaths+=fd;if(rds!==null)rounds+=rds;
      const matchKd=directKd!==null?directKd:(k!==null&&d!==null&&d>0?k/d:null);
      if(matchKd!==null){kdSum+=matchKd;kdCount++;}
      if(adr!==null){adrSum+=adr;adrCount++;}
      if(hsPct!==null){hsRateSum+=hsPct;hsRateCount++;}
    });
    const cl=clutchByPlayer.get(String(member.user_id))||{attempts:0,wins:0};
    const calculatedHsRate=hsRateCount?hsRateSum/hsRateCount:(kills?headshots/kills*100:null);
    return {
      nickname:member.nickname,matches:stats.length,wins,
      winRate:knownResults?Math.round(wins/knownResults*1000)/10:null,
      kd:kdCount?Math.round(kdSum/kdCount*100)/100:null,
      adr:adrCount?Math.round(adrSum/adrCount*10)/10:null,
      clutchRate:cl.attempts?Math.round(cl.wins/cl.attempts*1000)/10:null,
      clutchAttempts:cl.attempts,clutchWins:cl.wins,
      avgKills:stats.length?Math.round(kills/stats.length*100)/100:null,
      totalKills:kills,totalDeaths:deaths,totalAssists:assists,totalHeadshots:headshots,
      headshotRate:calculatedHsRate==null?null:Math.round(calculatedHsRate*10)/10,
      firstKills,firstDeaths,rounds
    };
  });
  rosterStatsCache=out;rosterStatsCacheAt=Date.now();
  res.json(out);
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/matches',async(_q,res)=>{
 try{
  const t=await faceit('/teams/'+TEAM_ID),ms=t.members||[],ids=new Set(ms.map(m=>String(m.user_id))),names=new Set(ms.map(m=>String(m.nickname||'').toLowerCase())),map=new Map();
  await Promise.all(ms.map(async m=>{try{const h=await faceit('/players/'+m.user_id+'/history?game=cs2&limit=100');for(const x of h.items||[])if(x.match_id&&!map.has(x.match_id))map.set(x.match_id,x)}catch(_){}}));
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
  const rosterOf=side=>(side?.roster||side?.players||[]).map(p=>p?.nickname||p?.game_player_name||'').filter(Boolean);
  const ourRoster=rosterOf(os),opponentRoster=rosterOf(opp);
  const ourTeam=os?.nickname||os?.name||'ANONVC';
  const opponentTeam=opp?.nickname||opp?.name||'FACEIT MATCH';
  const winnerTeam=won===true?ourTeam:won===false?opponentTeam:null;
  res.json({id:m.match_id,status:m.status,opponent:opponentTeam,ourTeam,opponentTeam,ourRoster,opponentRoster,winnerTeam,ourScore:a,opponentScore:b,won,map:m.game_data?.map||m.game_data?.maps?.[0]||m.map||'CS2',mvp:players[0]||null,players,detailsLoaded:true});
 }catch(e){res.status(503).json({error:e.message})}
});

app.get('/api/match/:id',async(req,res)=>{try{const id=encodeURIComponent(req.params.id),[match,stats]=await Promise.all([faceit('/matches/'+id),faceit('/matches/'+id+'/stats').catch(()=>null)]);res.json({match,stats})}catch(e){res.status(503).json({error:e.message})}});
app.get('*',(_q,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('AnonVC 2.0 listening on :'+PORT));