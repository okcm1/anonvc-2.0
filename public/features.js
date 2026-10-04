/* ANONVC 3.1 — INTERACTIVE FEATURES */
(function(){
  function escF(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function n(v){return v==null?'—':v;}
  function setupRoster(){
    var grid=document.getElementById('rosterGrid'), search=document.getElementById('rosterSearch'), sort=document.getElementById('rosterSort'), counter=document.getElementById('rosterCounter');
    if(!grid)return;
    function apply(){
      var q=(search&&search.value||'').toLowerCase().trim(), mode=sort&&sort.value||'default';
      var cards=[].slice.call(grid.querySelectorAll('.roster-card'));
      cards.forEach(function(c){
        var key=c.getAttribute('data-player')||'', s=(window.rosterPerformance||{})[key]||{};
        var role=(c.querySelector('.roster-identity p')||{}).textContent||'';
        var ok=!q||(key+' '+role).toLowerCase().indexOf(q)>=0;
        c.classList.toggle('is-hidden',!ok);
        c.dataset.sortValue=mode==='elo'?Number((c.querySelector('.roster-identity p')||{}).textContent.match(/ELO (\d+)/)||[,0])[1]:mode==='kd'?Number(s.kd)||0:mode==='win'?Number(s.winRate)||0:0;
      });
      if(mode!=='default'){
        cards.sort(function(a,b){return Number(b.dataset.sortValue)-Number(a.dataset.sortValue);});
        cards.forEach(function(c){grid.appendChild(c);});
      }
      var visible=cards.filter(function(c){return !c.classList.contains('is-hidden');}).length;
      if(counter)counter.textContent=String(visible).padStart(2,'0')+' / 05 OPERATORS';
    }
    if(search)search.addEventListener('input',apply);
    if(sort)sort.addEventListener('change',apply);
    grid.addEventListener('click',function(e){
      if(e.target.closest('a'))return;
      var card=e.target.closest('.roster-card');if(card)openProfile(card.getAttribute('data-player'));
    });
    var observer=new MutationObserver(function(){apply();});
    observer.observe(grid,{childList:true});
    apply();
  }
  function openProfile(nick){
    var modal=document.getElementById('profileModal'),card=document.querySelector('.roster-card[data-player="'+CSS.escape(nick)+'"]');
    if(!modal||!card)return;
    var s=(window.rosterPerformance||{})[nick]||{}, img=card.querySelector('.avatar-img'), role=(card.querySelector('.roster-identity p')||{}).textContent||'Operator';
    var face=card.querySelector('.roster-link');
    modal.innerHTML='<div class="profile-dialog" role="dialog" aria-modal="true"><button class="profile-close" type="button" aria-label="Close">×</button><div class="profile-top"><div class="profile-avatar">'+(img?'<img src="'+escF(img.src)+'" alt="">':'')+'</div><div><div class="profile-kicker">ANONVC // OPERATOR PROFILE</div><div class="profile-name">'+escF(nick)+'</div><div class="profile-role">'+escF(role)+'</div></div></div><div class="profile-grid">'+
      '<div class="profile-metric"><small>K/D</small><b>'+n(s.kd!=null?s.kd.toFixed(2):null)+'</b></div>'+
      '<div class="profile-metric"><small>AVG KILLS</small><b>'+n(s.avgKills!=null?s.avgKills.toFixed(2):null)+'</b></div>'+
      '<div class="profile-metric"><small>ADR</small><b>'+n(s.adr!=null?s.adr.toFixed(1):null)+'</b></div>'+
      '<div class="profile-metric"><small>CLUTCH</small><b>'+n(s.clutchRate!=null?s.clutchRate.toFixed(1)+'%':null)+'</b></div>'+
      '<div class="profile-metric"><small>WINRATE</small><b>'+n(s.winRate!=null?s.winRate.toFixed(1)+'%':null)+'</b></div>'+
      '<div class="profile-metric"><small>MATCHES</small><b>'+n(s.matches)+'</b></div></div>'+
      '<div class="profile-actions">'+(face?'<a href="'+escF(face.href)+'" target="_blank" rel="noopener">OPEN FACEIT ↗</a>':'')+'<button type="button" data-close>BACK TO ROSTER</button></div></div>';
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');
    modal.querySelector('.profile-close').onclick=closeProfile;
    modal.querySelector('[data-close]').onclick=closeProfile;
    modal.onclick=function(e){if(e.target===modal)closeProfile();};
    document.addEventListener('keydown',escModal);
  }
  function closeProfile(){var m=document.getElementById('profileModal');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');}document.removeEventListener('keydown',escModal);}
  function escModal(e){if(e.key==='Escape')closeProfile();}
  function setupMatches(){
    var input=document.getElementById('matchSearch'), root=document.getElementById('allMatches');
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
      try{await navigator.clipboard.writeText('a15fd8cf-bda5-4456-9445-86688331562e');b.textContent='COPIED ✓';b.classList.add('copy-ok');setTimeout(function(){b.textContent='COPY TEAM ID';b.classList.remove('copy-ok');},1800);}
      catch(_){b.textContent='COPY FAILED';}
    });
  }
  document.addEventListener('DOMContentLoaded',function(){setupRoster();setupMatches();setupCopy();});
})();