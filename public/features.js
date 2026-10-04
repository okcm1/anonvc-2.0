/* ANONVC 3.2 — STABLE ROSTER SORT / RICH PLAYER PROFILE */
(function(){
  function escF(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function val(v,dash){return v==null||Number.isNaN(v)?(dash||'—'):v;}
  function getRosterData(nick){
    var stats=window.rosterPerformance||{};
    return stats[nick]||{};
  }
  function cardElo(card){
    var p=card.querySelector('.roster-identity p');
    var m=p&&p.textContent.match(/ELO\s+(\d+)/i);
    return m?Number(m[1]):0;
  }
  function applyRosterSort(){
    var grid=document.getElementById('rosterGrid'), search=document.getElementById('rosterSearch'), sort=document.getElementById('rosterSort'), counter=document.getElementById('rosterCounter');
    if(!grid)return;
    var q=(search&&search.value||'').toLowerCase().trim();
    var mode=sort&&sort.value||'default';
    var cards=Array.from(grid.querySelectorAll('.roster-card'));
    cards.forEach(function(card,i){if(card.dataset.rosterOrder==null)card.dataset.rosterOrder=String(i);
      var nick=card.dataset.player||'';
      var role=(card.querySelector('.roster-identity p')||{}).textContent||'';
      card.classList.toggle('is-hidden',!!q && (nick+' '+role).toLowerCase().indexOf(q)<0);
    });
    var ordered=cards.slice();
    if(mode!=='default'){
      ordered.sort(function(a,b){
        var sa=getRosterData(a.dataset.player||''), sb=getRosterData(b.dataset.player||'');
        var av=mode==='elo'?cardElo(a):mode==='kd'?Number(sa.kd)||0:Number(sa.winRate)||0;
        var bv=mode==='elo'?cardElo(b):mode==='kd'?Number(sb.kd)||0:Number(sb.winRate)||0;
        return bv-av || cards.indexOf(a)-cards.indexOf(b);
      });
    }else{
      ordered.sort(function(a,b){return Number(a.dataset.rosterOrder)-Number(b.dataset.rosterOrder);});
    }
    /* One DOM write per ordered card, with observer disconnected by caller. */
    var frag=document.createDocumentFragment();
    ordered.forEach(function(card){frag.appendChild(card);});
    grid.appendChild(frag);
    var visible=cards.filter(function(c){return !c.classList.contains('is-hidden');}).length;
    if(counter)counter.textContent=String(visible).padStart(2,'0')+' / 05 OPERATORS';
  }
  function setupRoster(){
    var grid=document.getElementById('rosterGrid'), search=document.getElementById('rosterSearch'), sort=document.getElementById('rosterSort');
    if(!grid)return;
    var observer;
    function apply(){
      if(observer)observer.disconnect();
      try{applyRosterSort();}finally{
        if(observer)observer.observe(grid,{childList:true});
      }
    }
    if(search)search.addEventListener('input',apply);
    if(sort)sort.addEventListener('change',apply);
    window.addEventListener('anonvc:roster-rendered',apply);
    window.addEventListener('anonvc:roster-stats',apply);
    observer=new MutationObserver(function(){apply();});
    observer.observe(grid,{childList:true});
    apply();
    grid.addEventListener('click',function(e){
      if(e.target.closest('a'))return;
      var card=e.target.closest('.roster-card');
      if(card)openProfile(card.dataset.player);
    });
  }
  function parseCardMeta(card){
    var p=card.querySelector('.roster-identity p');
    var text=p?p.textContent:'';
    var level=(text.match(/LVL\s+(\d+)/i)||[])[1];
    var elo=(text.match(/ELO\s+(\d+)/i)||[])[1];
    return {role:text.replace(/\s*·\s*LVL.*$/i,'').trim(),level:level||'—',elo:elo||'—'};
  }
  function openProfile(nick){
    var modal=document.getElementById('profileModal');
    var card=Array.from(document.querySelectorAll('.roster-card')).find(function(c){return c.dataset.player===nick;});
    if(!modal||!card)return;
    var s=getRosterData(nick), meta=parseCardMeta(card), img=card.querySelector('.avatar-img');
    var face=card.querySelector('.roster-link');
    var matchCount=s.matches!=null?s.matches:30;
    modal.innerHTML=
      '<div class="profile-dialog" role="dialog" aria-modal="true">'+
      '<button class="profile-close" type="button" aria-label="Close">×</button>'+
      '<div class="profile-top">'+
        '<div class="profile-avatar">'+(img?'<img src="'+escF(img.src)+'" alt="">':'')+'</div>'+
        '<div>'+
          '<div class="profile-kicker">ANONVC // OPERATOR PROFILE</div>'+
          '<div class="profile-name">'+escF(nick)+'</div>'+
          '<div class="profile-role">'+escF(meta.role||'Operator')+'</div>'+
          '<div class="profile-badges">'+
            '<div class="profile-badge"><small>FACEIT LEVEL</small><b>'+escF(meta.level)+'</b></div>'+
            '<div class="profile-badge"><small>ELO</small><b>'+escF(meta.elo)+'</b></div>'+
            '<div class="profile-badge"><small>DATA SAMPLE</small><b>'+escF(matchCount)+' MATCHES</b></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="profile-section-label">CORE PERFORMANCE // FACEIT CS2</div>'+
      '<div class="profile-grid">'+
        '<div class="profile-metric"><small>K/D RATIO</small><b>'+val(s.kd!=null?s.kd.toFixed(2):null)+'</b></div>'+
        '<div class="profile-metric"><small>AVG KILLS</small><b>'+val(s.avgKills!=null?s.avgKills.toFixed(2):null)+'</b></div>'+
        '<div class="profile-metric"><small>ADR</small><b>'+val(s.adr!=null?s.adr.toFixed(1):null)+'</b></div>'+
        '<div class="profile-metric"><small>CLUTCH RATE</small><b>'+val(s.clutchRate!=null?s.clutchRate.toFixed(1)+'%':null)+'</b></div>'+
        '<div class="profile-metric"><small>WIN RATE</small><b>'+val(s.winRate!=null?s.winRate.toFixed(1)+'%':null)+'</b></div>'+
        '<div class="profile-metric"><small>MATCHES PLAYED</small><b>'+val(s.matches)+'</b></div>'+
      '</div>'+
      '<div class="profile-section-label">RAW SAMPLE // 30 MATCHES</div>'+
      '<div class="profile-grid">'+
        '<div class="profile-metric"><small>TOTAL KILLS</small><b>'+val(s.totalKills)+'</b></div>'+
        '<div class="profile-metric"><small>TOTAL DEATHS</small><b>'+val(s.totalDeaths)+'</b></div>'+
        '<div class="profile-metric"><small>TOTAL ASSISTS</small><b>'+val(s.totalAssists)+'</b></div>'+
        '<div class="profile-metric"><small>HEADSHOT %</small><b>'+val(s.headshotRate!=null?s.headshotRate.toFixed(1)+'%':null)+'</b></div>'+
        '<div class="profile-metric"><small>FIRST KILLS</small><b>'+val(s.firstKills)+'</b></div>'+
        '<div class="profile-metric"><small>FIRST DEATHS</small><b>'+val(s.firstDeaths)+'</b></div>'+
      '</div>'+
      '<div class="profile-footer-note">STATISTICS ARE CALCULATED FROM THE CURRENT FACEIT DATA SAMPLE. TEAM / STACK / SOLO MATCHES ARE KEPT SEPARATE IN ANONVC MATCH CLASSIFICATION.</div>'+
      '<div class="profile-actions">'+
        (face?'<a href="'+escF(face.href)+'" target="_blank" rel="noopener">OPEN FACEIT ↗</a>':'')+
        '<button type="button" data-close>BACK TO ROSTER</button>'+
      '</div>'+
      '</div>';
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');
    var close=modal.querySelector('.profile-close'), back=modal.querySelector('[data-close]');
    if(close)close.onclick=closeProfile;if(back)back.onclick=closeProfile;
    modal.onclick=function(e){if(e.target===modal)closeProfile();};
    document.addEventListener('keydown',escModal);
  }
  function closeProfile(){
    var m=document.getElementById('profileModal');
    if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');}
    document.removeEventListener('keydown',escModal);
  }
  function escModal(e){if(e.key==='Escape')closeProfile();}
  function setupMatches(){
    var input=document.getElementById('matchSearch'),root=document.getElementById('allMatches');
    if(!input||!root)return;
    function apply(){
      var q=input.value.toLowerCase().trim();
      root.querySelectorAll('.match-card').forEach(function(c){c.style.display=!q||c.textContent.toLowerCase().indexOf(q)>=0?'':'none';});
    }
    input.addEventListener('input',apply);
    new MutationObserver(apply).observe(root,{childList:true,subtree:true});
  }
  function setupCopy(){
    var b=document.getElementById('copyTeamId');if(!b)return;
    b.addEventListener('click',async function(){
      try{
        await navigator.clipboard.writeText('a15fd8cf-bda5-4456-9445-86688331562e');
        b.textContent='COPIED ✓';b.classList.add('copy-ok');
        setTimeout(function(){b.textContent='COPY TEAM ID';b.classList.remove('copy-ok');},1800);
      }catch(_){b.textContent='COPY FAILED';}
    });
  }
  document.addEventListener('DOMContentLoaded',function(){setupRoster();setupMatches();setupCopy();});
})();