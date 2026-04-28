/**
 * Flux — staged release gate.
 *
 * Every deploy bumps FLUX_BUILD_ID below. The new build reaches owner +
 * dev accounts immediately; normal users see a non-blocking "Update
 * under review" screen until the owner (or a dev) clicks
 * "Push update to all users" from the preview banner or panels.
 *
 * Release state lives at flux_platform_config.releaseGate and piggy-backs
 * on the existing Supabase sync path (owner's user_data row is the source
 * of truth; other clients poll it).
 */
(function(){
  const FLUX_BUILD_ID='build-2026-04-24-01'; // ⬅ BUMP THIS EACH DEPLOY
  window.FLUX_BUILD_ID=FLUX_BUILD_ID;

  const KEY_GATE='flux_release_gate';
  const KEY_FIRST='flux_release_build_first_seen';
  const POLL_MS=60*1000;
  const OWNER_EMAIL_FALLBACK='azfermohammed21@gmail.com';

  function ownerEmail(){
    try{return typeof OWNER_EMAIL!=='undefined'?OWNER_EMAIL:OWNER_EMAIL_FALLBACK;}
    catch(_){return OWNER_EMAIL_FALLBACK;}
  }
  function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function buildLabel(id){return String(id||'').replace(/^build-/,'');}

  function cachedEmail(){
    try{return localStorage.getItem('flux_last_user_email')||'';}catch(_){return'';}
  }
  function isOwnerLocal(){
    try{if(typeof isOwner==='function'&&isOwner())return true;}catch(_){}
    return cachedEmail()===ownerEmail();
  }
  function isDevLocal(){
    try{
      if(typeof getMyRole==='function'){
        const r=getMyRole();
        if(r==='dev'||r==='owner')return true;
      }
    }catch(_){}
    // Fallback to cached identity so owner/dev don't flash the blocking overlay
    // on reload before Supabase restores the session.
    const email=cachedEmail();
    if(!email)return false;
    if(email===ownerEmail())return true;
    try{
      const devs=JSON.parse(localStorage.getItem('flux_dev_accounts')||'[]');
      return Array.isArray(devs)&&devs.some(d=>d&&d.email===email);
    }catch(_){return false;}
  }
  function hasPreviewAccess(){return isOwnerLocal()||isDevLocal();}

  function getGate(){
    try{
      const raw=localStorage.getItem(KEY_GATE);
      if(raw)return JSON.parse(raw);
    }catch(_){}
    try{
      const pc=JSON.parse(localStorage.getItem('flux_platform_config'));
      if(pc&&pc.releaseGate)return pc.releaseGate;
    }catch(_){}
    return null;
  }
  function saveGate(g){
    try{localStorage.setItem(KEY_GATE,JSON.stringify(g));}catch(_){}
  }
  /** No gate ever set → don't block anyone (default-on behavior for fresh deploys). */
  function isReleased(gate){
    if(!gate||!gate.released)return true;
    return gate.released===FLUX_BUILD_ID;
  }

  /** Fetch the owner's published gate from Supabase (used by all non-owner clients). */
  async function fetchOwnerGate(){
    let sb=null;
    try{sb=typeof getSB==='function'?getSB():null;}catch(_){}
    if(!sb)return null;
    try{
      if(!window.__fluxOwnerRowId){
        const rows=await sb.from('user_data').select('id,data').limit(100);
        const hit=(rows&&rows.data||[]).find(r=>r&&r.data&&r.data.ownerEmail===ownerEmail());
        if(hit){
          window.__fluxOwnerRowId=hit.id;
          const g=hit.data.platformConfig&&hit.data.platformConfig.releaseGate;
          if(g){saveGate(g);return g;}
        }
      }
      if(window.__fluxOwnerRowId){
        const res=await sb.from('user_data').select('data').eq('id',window.__fluxOwnerRowId).single();
        const g=res&&res.data&&res.data.data&&res.data.data.platformConfig&&res.data.data.platformConfig.releaseGate;
        if(g){saveGate(g);return g;}
      }
    }catch(_){}
    return null;
  }

  /** Owner/dev action: flip the gate so the current build becomes live for every user.
   *  Only the OWNER's user_data row is treated as the cloud source of truth (dev rows
   *  aren't read by other clients), so a dev push updates local + their own row but
   *  requires the owner to mirror it for full propagation. */
  async function pushUpdate(notes){
    if(!hasPreviewAccess())return{ok:false,err:'Not authorized'};
    const now=Date.now();
    const by=(typeof currentUser!=='undefined'&&currentUser&&currentUser.email)||'unknown';
    const gate={
      released:FLUX_BUILD_ID,
      pushedAt:now,
      pushedBy:by,
      notes:String(notes||'').slice(0,800),
    };
    saveGate(gate);
    try{
      if(typeof savePlatformConfig==='function'){
        savePlatformConfig({releaseGate:gate});
      }else{
        const pc=JSON.parse(localStorage.getItem('flux_platform_config'))||{};
        pc.releaseGate=gate;
        localStorage.setItem('flux_platform_config',JSON.stringify(pc));
      }
    }catch(_){}
    const owner=isOwnerLocal();
    try{
      if(owner&&typeof syncToCloud==='function')await syncToCloud();
      else if(typeof syncKey==='function')syncKey('platform',1);
    }catch(_){}
    try{
      if(typeof ownerAuditAppend==='function'){
        ownerAuditAppend('release_push',{build:FLUX_BUILD_ID,notes:gate.notes,by});
      }
    }catch(_){}
    applyGate();
    if(typeof showToast==='function'){
      if(owner){
        showToast('✓ Released build '+buildLabel(FLUX_BUILD_ID)+' to all users','success');
      }else{
        showToast('Preview updated. The owner needs to confirm to release to all users.','info');
      }
    }
    return{ok:true,gate,propagated:owner};
  }

  function ensureHost(){
    let host=document.getElementById('fluxReleaseGateRoot');
    if(!host){
      host=document.createElement('div');
      host.id='fluxReleaseGateRoot';
      document.body.appendChild(host);
    }
    return host;
  }

  function removeOverlay(){
    const o=document.getElementById('fluxReleaseOverlay');
    if(o)o.remove();
    const app=document.getElementById('app');
    if(app)app.removeAttribute('aria-hidden');
  }
  function removeBanner(){
    const b=document.getElementById('fluxReleasePreviewBanner');
    if(b)b.remove();
    document.body.classList.remove('flux-has-release-banner');
    document.documentElement.style.removeProperty('--flux-release-banner-h');
  }

  function renderOverlay(gate){
    ensureHost();
    if(document.getElementById('fluxReleaseOverlay'))return;
    const notes=gate&&gate.notes?`<div style="font-size:.74rem;color:var(--muted2,#8a93a7);margin-top:14px;line-height:1.55;max-width:420px;margin-left:auto;margin-right:auto;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 14px;text-align:left"><div style="font-size:.62rem;text-transform:uppercase;letter-spacing:.14em;color:var(--muted,#5b6473);margin-bottom:6px">Release notes</div>${esc(gate.notes)}</div>`:'';
    const div=document.createElement('div');
    div.id='fluxReleaseOverlay';
    div.style.cssText='position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at 30% 20%,rgba(var(--accent-rgb),.18),transparent 60%),rgba(4,7,14,.96);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);color:var(--text,#e6edf6);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    div.innerHTML=`
      <div style="max-width:460px;width:100%;text-align:center">
        <div style="font-size:2.6rem;margin-bottom:14px">🛠</div>
        <div style="font-size:1.3rem;font-weight:800;letter-spacing:-.01em;margin-bottom:8px">Update under review</div>
        <div style="font-size:.85rem;color:var(--muted2,#8a93a7);line-height:1.55">Flux just shipped a new build. The Flux team is reviewing it before rolling out to everyone. Check back in a few minutes — this screen will clear automatically once it's live.</div>
        ${notes}
        <div style="margin-top:22px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button type="button" id="fluxReleaseRetryBtn" style="padding:10px 18px;font-size:.82rem;font-weight:700;border-radius:10px;background:rgba(var(--accent-rgb),.16);border:1px solid rgba(var(--accent-rgb),.35);color:var(--accent,#00bfff);cursor:pointer">↻ Check again</button>
          <button type="button" id="fluxReleaseSignOutBtn" style="padding:10px 18px;font-size:.82rem;font-weight:700;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:var(--muted2,#8a93a7);cursor:pointer">Sign out</button>
        </div>
        <div style="font-size:.62rem;color:var(--muted,#5b6473);font-family:JetBrains Mono,monospace;margin-top:18px;opacity:.7">BUILD · ${esc(buildLabel(FLUX_BUILD_ID))} · awaiting release</div>
      </div>`;
    ensureHost().appendChild(div);
    div.querySelector('#fluxReleaseRetryBtn').addEventListener('click',async(e)=>{
      const btn=e.currentTarget;
      const old=btn.textContent;
      btn.textContent='Checking…';btn.disabled=true;
      const g=await fetchOwnerGate();
      applyGate();
      const stillGated=!isReleased(g||getGate())&&!hasPreviewAccess();
      if(stillGated){
        btn.textContent=old;btn.disabled=false;
        if(typeof showToast==='function')showToast('Still under review — hang tight.','info');
      }
    });
    div.querySelector('#fluxReleaseSignOutBtn').addEventListener('click',()=>{
      try{
        const sb=typeof getSB==='function'?getSB():null;
        if(sb)sb.auth.signOut();
      }catch(_){}
      setTimeout(()=>location.reload(),200);
    });
    const app=document.getElementById('app');
    if(app)app.setAttribute('aria-hidden','true');
  }

  function renderPreviewBanner(gate){
    ensureHost();
    if(document.getElementById('fluxReleasePreviewBanner'))return;
    const releasedLabel=gate&&gate.released?buildLabel(gate.released):'none yet';
    const bar=document.createElement('div');
    bar.id='fluxReleasePreviewBanner';
    bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9500;display:flex;align-items:center;gap:10px;padding:7px 14px;background:linear-gradient(90deg,rgba(251,191,36,.18),rgba(124,92,255,.14));border-bottom:1px solid rgba(251,191,36,.4);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:.74rem;color:var(--text,#e6edf6);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    bar.innerHTML=`
      <span style="font-weight:800;color:#fbbf24;letter-spacing:.04em;font-family:JetBrains Mono,monospace;font-size:.68rem">PREVIEW</span>
      <span style="flex:1;min-width:0;color:var(--muted2,#8a93a7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Build <b style="color:var(--text,#e6edf6)">${esc(buildLabel(FLUX_BUILD_ID))}</b> — only owner &amp; devs see this. Users are on <b>${esc(releasedLabel)}</b></span>
      <button type="button" id="fluxReleaseOpenBtn" style="padding:5px 12px;font-size:.72rem;font-weight:700;border-radius:8px;background:rgba(251,191,36,.2);border:1px solid rgba(251,191,36,.5);color:#fbbf24;cursor:pointer;white-space:nowrap">Push update →</button>
      <button type="button" id="fluxReleaseCloseBtn" style="padding:4px 8px;font-size:.8rem;background:none;border:none;color:var(--muted2,#8a93a7);cursor:pointer" title="Hide until next reload">✕</button>`;
    ensureHost().appendChild(bar);
    document.documentElement.style.setProperty('--flux-release-banner-h','34px');
    document.body.classList.add('flux-has-release-banner');
    bar.querySelector('#fluxReleaseOpenBtn').addEventListener('click',openPushDialog);
    bar.querySelector('#fluxReleaseCloseBtn').addEventListener('click',removeBanner);
  }

  function openPushDialog(){
    if(!hasPreviewAccess())return;
    const existing=document.getElementById('fluxReleaseDialog');
    if(existing)existing.remove();
    const root=document.createElement('div');
    root.id='fluxReleaseDialog';
    root.style.cssText='position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,16,.86);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    const gate=getGate()||{};
    const lastPush=gate.pushedAt?new Date(gate.pushedAt).toLocaleString():'—';
    root.innerHTML=`
      <div style="background:var(--card,#121826);border:1px solid rgba(251,191,36,.4);border-radius:20px;padding:22px;width:100%;max-width:460px;box-shadow:0 32px 80px rgba(0,0,0,.55);color:var(--text,#e6edf6)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span style="font-size:1.5rem">🚀</span>
          <div style="flex:1">
            <div style="font-size:1.05rem;font-weight:800">Push update to all users</div>
            <div style="font-size:.7rem;color:var(--muted,#5b6473);font-family:JetBrains Mono,monospace">preview · ${esc(buildLabel(FLUX_BUILD_ID))}</div>
          </div>
          <button type="button" id="fluxPushClose" style="background:none;border:none;color:var(--muted,#5b6473);font-size:1.2rem;cursor:pointer;padding:0">✕</button>
        </div>
        <div style="font-size:.76rem;color:var(--muted2,#8a93a7);line-height:1.55;margin-bottom:14px">Releases this build to every user. Normal users currently see an <b>"Update under review"</b> screen — on their next load (or auto-poll), they'll pick up the new build and the overlay clears.</div>
        ${isOwnerLocal()?'':'<div style="font-size:.72rem;color:#fbbf24;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.28);border-radius:10px;padding:9px 11px;margin-bottom:12px;line-height:1.5">⚠️ Dev account: pushing saves the release note but only the <b>owner</b> can propagate it to normal users. Ping the owner after pushing.</div>'}
        <div style="background:var(--card2,#0c1220);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:.72rem;line-height:1.5;color:var(--muted2,#8a93a7)">
          <div>Currently released: <b style="color:var(--text,#e6edf6)">${esc(buildLabel(gate.released)||'— (first release)')}</b></div>
          ${gate.pushedBy?`<div style="margin-top:2px">Last push by ${esc(gate.pushedBy)} · ${esc(lastPush)}</div>`:''}
        </div>
        <label style="display:block;font-size:.66rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted,#5b6473);margin-bottom:6px;font-family:JetBrains Mono,monospace">Release notes (optional)</label>
        <textarea id="fluxPushNotes" placeholder="Liquid glass default, sidebar fixes, tour polish…" style="width:100%;min-height:72px;padding:10px;border-radius:10px;background:var(--card2,#0c1220);border:1px solid var(--border2,rgba(255,255,255,.12));color:var(--text,#e6edf6);font-family:inherit;font-size:.78rem;resize:vertical;box-sizing:border-box"></textarea>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button type="button" id="fluxPushGoBtn" style="flex:1;padding:11px;font-size:.85rem;font-weight:800;border-radius:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:none;color:#080a0f;cursor:pointer">Push to all users</button>
          <button type="button" id="fluxPushCancelBtn" style="padding:11px 16px;font-size:.78rem;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:var(--muted2,#8a93a7);cursor:pointer">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const close=()=>root.remove();
    root.querySelector('#fluxPushClose').addEventListener('click',close);
    root.querySelector('#fluxPushCancelBtn').addEventListener('click',close);
    root.querySelector('#fluxPushGoBtn').addEventListener('click',async(e)=>{
      const btn=e.currentTarget;
      btn.textContent='Pushing…';btn.disabled=true;
      const notes=(root.querySelector('#fluxPushNotes').value||'').trim();
      const res=await pushUpdate(notes);
      close();
      if(!res.ok&&typeof showToast==='function')showToast(res.err||'Push failed','error');
    });
  }

  /** True only when the current session is definitely a signed-in normal user
   *  (so we don't block the login screen or anonymous landings). */
  function isConfirmedNormal(){
    try{
      if(typeof currentUser==='undefined'||!currentUser)return false;
      return !isOwnerLocal()&&!isDevLocal();
    }catch(_){return false;}
  }

  function applyGate(){
    try{
      const g=getGate();
      if(isReleased(g)){
        removeOverlay();
        removeBanner();
        return;
      }
      if(hasPreviewAccess()){
        removeOverlay();
        renderPreviewBanner(g);
        return;
      }
      if(isConfirmedNormal()){
        removeBanner();
        renderOverlay(g);
        return;
      }
      removeOverlay();
      removeBanner();
    }catch(_){}
  }

  let _pollId=null;
  function startPolling(){
    if(_pollId)return;
    _pollId=setInterval(async()=>{
      if(isOwnerLocal())return; // owner is the source of truth
      try{await fetchOwnerGate();}catch(_){}
      applyGate();
    },POLL_MS);
    window.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'){
        if(!isOwnerLocal())fetchOwnerGate().finally(applyGate);
        else applyGate();
      }
    });
  }

  function boot(){
    try{
      if(!localStorage.getItem(KEY_FIRST))localStorage.setItem(KEY_FIRST,String(Date.now()));
    }catch(_){}
    applyGate();
    startPolling();
  }

  window.FluxRelease={
    FLUX_BUILD_ID,
    getGate,
    hasPreviewAccess,
    pushUpdate,
    fetchOwnerGate,
    applyGate,
    openPushDialog,
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
