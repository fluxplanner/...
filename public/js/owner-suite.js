/**
 * Flux Owner Command Center — full control UI for the owner account.
 * Real actions: dev team, audit log, platform config, backups, analytics export.
 * Auth user admin / impersonation / cross-user queries require Supabase Dashboard or a service-role Edge Function (called out in UI).
 */
(function(){
  const PLATFORM_DEFAULTS={
    announcement:'',
    dataRetentionDays:365,
    sessionIdleWarnMins:60,
    integrations:{slackWebhook:'',genericWebhook:''},
    complianceContact:'',
  };
  const ROLE_PRESETS={
    admin:['clear_data','feature_flags','dev_mode','manage_devs','view_users'],
    editor:['clear_data','feature_flags','dev_mode','view_users'],
    viewer:['view_users'],
  };

  window.getPlatformConfig=function(){
    return{...PLATFORM_DEFAULTS,...load('flux_platform_config',{})};
  };
  window.savePlatformConfig=function(partial){
    save('flux_platform_config',{...getPlatformConfig(),...partial});
    if(typeof syncKey==='function')syncKey('platform',1);
  };

  window.ownerAuditAppend=function(action,detail){
    if(!isOwner())return;
    const log=load('flux_owner_audit',[]);
    log.push({
      t:Date.now(),
      action:String(action||'event'),
      detail:typeof detail==='object'?JSON.stringify(detail):String(detail||''),
      by:currentUser?.email||'local',
    });
    while(log.length>300)log.shift();
    save('flux_owner_audit',log);
    syncKey('owner_audit',1);
  };

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function tabStyle(active){
    return`padding:8px 12px;font-size:.72rem;font-weight:600;border-radius:10px;border:1px solid ${active?'rgba(var(--accent-rgb),.4)':'var(--border2)'};background:${active?'rgba(var(--accent-rgb),.12)':'transparent'};color:${active?'var(--accent)':'var(--muted2)'};cursor:pointer;font-family:inherit`;
  }

  window.openOwnerSuite=function(){
    if(!isOwner())return;
    document.getElementById('modPanel')?.remove();
    document.getElementById('ownerSuite')?.remove();
    const root=document.createElement('div');
    root.id='ownerSuite';
    root.style.cssText='position:fixed;inset:0;background:rgba(5,8,16,.92);z-index:9900;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;backdrop-filter:blur(12px);overflow-y:auto';

    let tab='overview';
    function body(){
      const devAccounts=load('flux_dev_accounts',[]);
      const auditRaw=load('flux_owner_audit',[]);
      const audit=auditRaw.slice().reverse();
      const pc=getPlatformConfig();
      const lastSync=load('flux_last_sync',0);
      const lsBytes=JSON.stringify(localStorage).length;
      const insights=[];
      try{
        const overdue=(tasks||[]).filter(t=>!t.done&&t.date&&new Date(t.date+'T00:00:00')<new Date(new Date().toDateString())).length;
        if(overdue>=3)insights.push({icon:'⚠️',t:'Workload',d:overdue+' overdue tasks — consider nudges or Recovery-style filters.'});
        if((tasks||[]).filter(t=>!t.done).length===0)insights.push({icon:'✨',t:'Momentum',d:'Inbox clear — strong time to plan ahead.'});
        if((sessionLog||[]).length>=5)insights.push({icon:'⏱',t:'Focus',d:Math.round((sessionLog||[]).reduce((a,s)=>a+(s.mins||0),0)/60)+'h logged in focus sessions.'});
      }catch(_){}
      insights.push({icon:'🛡',t:'Security',d:'Use Google 2FA on the account that signs into Flux; session hints are advisory only in this client.'});

      if(tab==='overview')return`
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px">
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Team (dev seats)</div>
            <div style="font-size:1.4rem;font-weight:800;color:var(--accent)">${devAccounts.length}</div>
          </div>
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px">
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Audit events</div>
            <div style="font-size:1.4rem;font-weight:800;color:var(--gold)">${auditRaw.length}</div>
          </div>
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px">
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Local footprint</div>
            <div style="font-size:1.1rem;font-weight:800;color:var(--text)">${(lsBytes/1024).toFixed(0)} KB</div>
          </div>
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px">
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Last cloud sync</div>
            <div style="font-size:.72rem;font-weight:700;color:var(--muted2);margin-top:4px">${lastSync?new Date(lastSync).toLocaleString():'—'}</div>
          </div>
        </div>
        <div style="background:rgba(124,92,255,.08);border:1px solid rgba(124,92,255,.25);border-radius:14px;padding:14px;margin-bottom:14px">
          <div style="font-size:.75rem;font-weight:700;margin-bottom:6px">🔐 Platform reality (read this)</div>
          <div style="font-size:.72rem;color:var(--muted2);line-height:1.55">
            Flux stores each user’s data in their own <b>user_data</b> row. This browser only has your <b>anon</b> Supabase key — it cannot list every Auth user, reset passwords, suspend accounts, or impersonate without a <b>server-side Admin API</b> (Edge Function + service role). Do those in <b>Supabase Dashboard → Authentication</b> or add a secured admin function.
          </div>
        </div>
        <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:8px">AI-style insights (heuristic)</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${insights.map(i=>`<div style="display:flex;gap:10px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px 12px"><span>${i.icon}</span><div><div style="font-size:.78rem;font-weight:700">${esc(i.t)}</div><div style="font-size:.72rem;color:var(--muted2)">${esc(i.d)}</div></div></div>`).join('')}
        </div>`;

      if(tab==='team')return`
        <div style="font-size:.72rem;color:var(--muted2);margin-bottom:12px;line-height:1.5">
          <b>Roles</b> map to permission bundles. <b>Admin</b> = all tools. <b>Editor</b> = flags + dev mode + clear (no manage devs). <b>Viewer</b> = read-only panel hooks.
        </div>
        ${devAccounts.length?devAccounts.map((d,i)=>`
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">
              <span style="font-weight:700;flex:1;min-width:140px">${esc(d.email)}</span>
              <select onchange="ownerSetDevRole(${i},this.value)" style="padding:6px 10px;border-radius:8px;background:var(--card);border:1px solid var(--border2);color:var(--text);font-size:.75rem">
                <option value="admin" ${(d.role||'admin')==='admin'?'selected':''}>Admin</option>
                <option value="editor" ${d.role==='editor'?'selected':''}>Editor</option>
                <option value="viewer" ${d.role==='viewer'?'selected':''}>Viewer</option>
              </select>
              <button type="button" onclick="removeDevAccount(${i})" style="padding:6px 10px;font-size:.72rem;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:var(--red);border-radius:8px">Remove</button>
            </div>
            <div style="font-size:.65rem;color:var(--muted);font-family:JetBrains Mono,monospace">Perms: ${(d.perms||[]).join(', ')||'—'}</div>
          </div>`).join(''):'<div style="color:var(--muted);font-size:.82rem">No dev accounts. Add emails below.</div>'}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <input type="email" id="osNewDevEmail" placeholder="invite@email.com" style="flex:1;min-width:180px;margin:0;padding:8px 12px;font-size:.8rem;border-radius:10px">
          <button type="button" onclick="ownerQuickAddDev()" style="padding:8px 14px;font-size:.78rem">+ Invite</button>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px">Bulk import / export (dev list)</div>
          <button type="button" onclick="ownerExportDevsJson()" style="margin-right:8px;margin-bottom:8px;padding:8px 12px;font-size:.72rem;border-radius:10px">Export JSON</button>
          <button type="button" onclick="ownerExportDevsCsv()" style="margin-right:8px;margin-bottom:8px;padding:8px 12px;font-size:.72rem;border-radius:10px">Export CSV</button>
          <label style="font-size:.72rem;color:var(--accent);cursor:pointer">Import JSON<input type="file" accept="application/json" style="display:none" onchange="ownerImportDevsFile(event)"></label>
        </div>`;

      if(tab==='data')return`
        <div style="font-size:.72rem;color:var(--muted2);line-height:1.55;margin-bottom:14px">
          Full <b>backup</b> includes planner payload shape (tasks, notes, grades, dev list, audit tail, platform config). Restoring merges into this browser then syncs if signed in.
        </div>
        <button type="button" onclick="ownerExportFullBackup()" style="width:100%;padding:12px;margin-bottom:10px;font-size:.85rem;font-weight:700;border-radius:12px;background:linear-gradient(135deg,rgba(var(--accent-rgb),.2),rgba(var(--purple-rgb),.15));border:1px solid rgba(var(--accent-rgb),.35)">⬇ Download full backup (JSON)</button>
        <label style="display:block;width:100%;padding:12px;text-align:center;border-radius:12px;border:1px dashed var(--border2);cursor:pointer;font-size:.82rem;color:var(--accent);margin-bottom:12px">
          ⬆ Restore from backup JSON<input type="file" accept="application/json" style="display:none" onchange="ownerRestoreBackupFile(event)">
        </label>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border)">
          <span style="font-size:.8rem">Archive all <b>done</b> tasks (reversible via backup)</span>
          <button type="button" onclick="ownerArchiveDoneTasks()" style="padding:6px 12px;font-size:.72rem;border-radius:8px">Archive</button>
        </div>
        <div style="margin-top:14px">
          <label style="font-size:.72rem;color:var(--muted)">Data retention target (days, advisory)</label>
          <input type="number" id="osRetention" value="${pc.dataRetentionDays||365}" min="30" max="3650" style="width:100%;margin-top:4px;padding:8px;border-radius:10px" onchange="savePlatformConfig({dataRetentionDays:parseInt(this.value)||365})">
        </div>`;

      if(tab==='config')return`
        <label style="font-size:.72rem;color:var(--muted)">Global announcement (show in toast on load — optional)</label>
        <input type="text" id="osAnnounce" value="${esc(pc.announcement)}" placeholder="e.g. Maintenance Sunday 2am UTC" style="width:100%;margin:6px 0 14px;padding:10px;border-radius:10px" onblur="savePlatformConfig({announcement:this.value.trim()})">
        <label style="font-size:.72rem;color:var(--muted)">Session idle reminder (minutes, advisory)</label>
        <input type="number" id="osSess" value="${pc.sessionIdleWarnMins||60}" min="5" max="480" style="width:100%;margin:6px 0 14px;padding:8px;border-radius:10px" onchange="savePlatformConfig({sessionIdleWarnMins:parseInt(this.value)||60})">
        <label style="font-size:.72rem;color:var(--muted)">Compliance / DPO contact (reference only)</label>
        <input type="text" id="osComp" value="${esc(pc.complianceContact)}" placeholder="privacy@school.edu" style="width:100%;margin:6px 0;padding:10px;border-radius:10px" onblur="savePlatformConfig({complianceContact:this.value.trim()})">
        <p style="font-size:.68rem;color:var(--muted);margin-top:12px">Billing, 2FA enforcement, and IP allowlists require IdP or Supabase Pro policies — not configurable from this client alone.</p>`;

      if(tab==='integrations')return`
        <label style="font-size:.72rem;color:var(--muted)">Slack / generic webhook URL (POST JSON on future events)</label>
        <input type="url" id="osSlack" value="${esc(pc.integrations?.slackWebhook||'')}" placeholder="https://hooks.slack.com/..." style="width:100%;margin:6px 0;padding:10px;border-radius:10px" onblur="ownerSaveIntegrationWebhooks()">
        <input type="url" id="osHook" value="${esc(pc.integrations?.genericWebhook||'')}" placeholder="https://your-automation/webhook" style="width:100%;margin:6px 0 14px;padding:10px;border-radius:10px" onblur="ownerSaveIntegrationWebhooks()">
        <button type="button" onclick="ownerTestWebhookPing()" style="padding:8px 14px;font-size:.75rem;border-radius:10px">Send test ping</button>
        <p style="font-size:.68rem;color:var(--muted);margin-top:12px">API keys with service role must never ship in the browser. Use Edge Functions.</p>`;

      if(tab==='analytics')return`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div style="background:var(--card2);border-radius:12px;padding:12px;border:1px solid var(--border)"><div style="font-size:1.3rem;font-weight:800;color:var(--accent)">${(tasks||[]).length}</div><div style="font-size:.65rem;color:var(--muted)">Tasks total</div></div>
          <div style="background:var(--card2);border-radius:12px;padding:12px;border:1px solid var(--border)"><div style="font-size:1.3rem;font-weight:800;color:var(--green)">${(tasks||[]).filter(t=>t.done).length}</div><div style="font-size:.65rem;color:var(--muted)">Completed</div></div>
          <div style="background:var(--card2);border-radius:12px;padding:12px;border:1px solid var(--border)"><div style="font-size:1.3rem;font-weight:800;color:var(--gold)">${(notes||[]).length}</div><div style="font-size:.65rem;color:var(--muted)">Notes</div></div>
          <div style="background:var(--card2);border-radius:12px;padding:12px;border:1px solid var(--border)"><div style="font-size:1.3rem;font-weight:800;color:var(--purple)">${(sessionLog||[]).length}</div><div style="font-size:.65rem;color:var(--muted)">Focus logs</div></div>
        </div>
        <button type="button" onclick="ownerExportTasksCsv()" style="padding:10px 16px;font-size:.78rem;border-radius:10px;margin-right:8px">Export tasks CSV</button>
        <button type="button" onclick="ownerExportSessionsCsv()" style="padding:10px 16px;font-size:.78rem;border-radius:10px">Export sessions CSV</button>`;

      if(tab==='audit')return`
        <button type="button" onclick="ownerClearAudit()" style="margin-bottom:12px;padding:6px 12px;font-size:.72rem;border-radius:8px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.25);color:var(--red)">Clear audit log</button>
        <div style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;background:var(--card2)">
          ${audit.length?audit.map(e=>`<div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:.72rem">
            <div style="font-family:JetBrains Mono,monospace;color:var(--muted)">${new Date(e.t).toLocaleString()}</div>
            <div style="font-weight:700;color:var(--accent)">${esc(e.action)}</div>
            <div style="color:var(--muted2);word-break:break-word">${esc(e.detail)}</div>
            <div style="font-size:.65rem;opacity:.6">${esc(e.by)}</div>
          </div>`).join(''):'<div style="padding:20px;text-align:center;color:var(--muted)">No events yet.</div>'}
        </div>`;

      if(tab==='advanced')return`
        <div style="font-size:.72rem;color:var(--muted2);line-height:1.6;margin-bottom:14px">
          <b>Impersonation</b>, <b>revoke other users’ sessions</b>, and <b>live user activity across tenants</b> need secure server endpoints. Use Supabase Auth admin or build <code style="font-size:.65rem">admin-revoke-session</code> Edge Functions.
        </div>
        <button type="button" onclick="document.getElementById('ownerSuite')?.remove();openModPanel();" style="padding:10px 16px;font-size:.78rem;border-radius:12px;margin-bottom:10px;background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.3)">⚡ Open classic Dev Panel</button>
        <button type="button" onclick="forceSyncNow()" style="display:block;width:100%;padding:10px;margin-bottom:8px;font-size:.78rem;border-radius:10px">⟳ Force sync now</button>
        <button type="button" onclick="clearCache()" style="display:block;width:100%;padding:10px;font-size:.78rem;border-radius:10px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.25);color:var(--red)">⚠ Nuclear: clear local cache (typed confirm)</button>`;

      return'';
    }

    function paint(){
      const bodyEl=root.querySelector('#osBody');
      if(bodyEl)bodyEl.innerHTML=body();
      root.querySelectorAll('[data-os-tab]').forEach(b=>{
        b.style.cssText=tabStyle(b.getAttribute('data-os-tab')===tab);
      });
    }

    root.innerHTML=`
      <div style="background:var(--card);border:1px solid rgba(251,191,36,.35);border-radius:22px;width:100%;max-width:760px;box-shadow:0 24px 80px rgba(0,0,0,.55);overflow:hidden">
        <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,rgba(251,191,36,.08),transparent)">
          <span style="font-size:1.6rem">👑</span>
          <div style="flex:1">
            <div style="font-size:1.05rem;font-weight:800">Owner Command Center</div>
            <div style="font-size:.68rem;color:var(--muted);font-family:JetBrains Mono,monospace">${esc(currentUser?.email)} · god-mode for your data plane</div>
          </div>
          <button type="button" onclick="document.getElementById('ownerSuite')?.remove()" style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer">✕</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:12px 16px;border-bottom:1px solid var(--border);background:var(--card2)">
          <button type="button" data-os-tab="overview" onclick="window.__osSetTab('overview')">Overview</button>
          <button type="button" data-os-tab="team" onclick="window.__osSetTab('team')">Team & roles</button>
          <button type="button" data-os-tab="data" onclick="window.__osSetTab('data')">Data & backup</button>
          <button type="button" data-os-tab="config" onclick="window.__osSetTab('config')">Platform config</button>
          <button type="button" data-os-tab="integrations" onclick="window.__osSetTab('integrations')">Integrations</button>
          <button type="button" data-os-tab="analytics" onclick="window.__osSetTab('analytics')">Analytics</button>
          <button type="button" data-os-tab="audit" onclick="window.__osSetTab('audit')">Audit log</button>
          <button type="button" data-os-tab="advanced" onclick="window.__osSetTab('advanced')">Advanced</button>
        </div>
        <div id="osBody" style="padding:20px;max-height:min(70vh,620px);overflow-y:auto"></div>
      </div>`;

    window.__osSetTab=function(t){tab=t;paint();};
    document.body.appendChild(root);
    paint();
    ownerAuditAppend('owner_suite_open',{});
    const ann=getPlatformConfig().announcement;
    if(ann)showToast(ann,'info');
  };

  window.ownerSetDevRole=function(idx,role){
    if(!isOwner())return;
    const devAccounts=load('flux_dev_accounts',[]);
    const acc=devAccounts[idx];if(!acc)return;
    acc.role=role;
    acc.perms=[...(ROLE_PRESETS[role]||ROLE_PRESETS.viewer)];
    saveDevAccounts(devAccounts);
    ownerAuditAppend('dev_role_change',{email:acc.email,role});
    openOwnerSuite();
  };

  window.ownerQuickAddDev=function(){
    const inp=document.getElementById('osNewDevEmail');
    const email=(inp?.value||'').trim();
    if(!email||!email.includes('@')){alert('Valid email required.');return;}
    const devAccounts=load('flux_dev_accounts',[]);
    if(devAccounts.find(d=>d.email===email)){alert('Already a dev account.');return;}
    devAccounts.push({email,role:'viewer',perms:[...ROLE_PRESETS.viewer],addedAt:Date.now()});
    saveDevAccounts(devAccounts);
    ownerAuditAppend('dev_invite',{email});
    openOwnerSuite();
  };

  window.ownerExportDevsJson=function(){
    const blob=new Blob([JSON.stringify(load('flux_dev_accounts',[]),null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flux-dev-accounts.json';a.click();URL.revokeObjectURL(a.href);
    ownerAuditAppend('export_dev_json',{});
  };
  window.ownerExportDevsCsv=function(){
    const rows=['email,role,perms,addedAt'].concat(load('flux_dev_accounts',[]).map(d=>`${d.email},${d.role||''},"${(d.perms||[]).join(';')}",${d.addedAt||''}`));
    const blob=new Blob([rows.join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flux-dev-accounts.csv';a.click();URL.revokeObjectURL(a.href);
    ownerAuditAppend('export_dev_csv',{});
  };
  window.ownerImportDevsFile=function(ev){
    const f=ev.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const arr=JSON.parse(r.result);
        if(!Array.isArray(arr))throw new Error('JSON must be an array');
        const norm=arr.map(x=>(typeof x==='string'?{email:x}:x)).filter(x=>x&&x.email&&x.email.includes('@'));
        norm.forEach(u=>{
          if(!u.perms||!u.perms.length)u.perms=[...(ROLE_PRESETS[u.role]||ROLE_PRESETS.viewer)];
          if(!u.role)u.role='viewer';
          u.addedAt=u.addedAt||Date.now();
        });
        save('flux_dev_accounts',norm);
        saveDevAccounts(norm);
        ownerAuditAppend('import_dev_json',{count:norm.length});
        openOwnerSuite();
        showToast('Imported '+norm.length+' dev rows','success');
      }catch(e){alert('Import failed: '+e.message);}
    };
    r.readAsText(f);
    ev.target.value='';
  };

  window.ownerExportFullBackup=function(){
    const payload=getCloudPayload();
    payload._fluxBackupMeta={v:1,exportedAt:new Date().toISOString(),owner:currentUser?.email};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flux-owner-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);
    ownerAuditAppend('full_backup_export',{});
  };

  window.ownerRestoreBackupFile=function(ev){
    const f=ev.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const d=JSON.parse(r.result);
        if(d.tasks){tasks=d.tasks;save('tasks',tasks);}
        if(d.grades){grades=d.grades;save('flux_grades',grades);}
        if(d.notes){notes=d.notes;save('flux_notes',notes);}
        if(d.habits){habits=d.habits;save('flux_habits',habits);}
        if(d.goals){goals=d.goals;save('flux_goals',goals);}
        if(d.devAccounts&&isOwner())save('flux_dev_accounts',d.devAccounts);
        if(d.ownerAuditLog&&isOwner())save('flux_owner_audit',d.ownerAuditLog.slice(-300));
        if(d.platformConfig&&isOwner())save('flux_platform_config',d.platformConfig);
        if(d.profile)localStorage.setItem('profile',JSON.stringify(d.profile));
        if(currentUser)syncToCloud();
        ownerAuditAppend('backup_restore',{keys:Object.keys(d).slice(0,20).join(',')});
        showToast('Restore applied — verify data & sync','success');
        location.reload();
      }catch(e){alert('Restore failed: '+e.message);}
    };
    r.readAsText(f);
    ev.target.value='';
  };

  window.ownerArchiveDoneTasks=function(){
    if(!confirm('Remove all completed tasks from the active list? (Backup first.)'))return;
    const n=tasks.filter(t=>t.done).length;
    tasks=tasks.filter(t=>!t.done);
    save('tasks',tasks);
    if(currentUser)syncToCloud();
    ownerAuditAppend('archive_done_tasks',{removed:n});
    showToast('Archived '+n+' done tasks','info');
    openOwnerSuite();
  };

  window.ownerSaveIntegrationWebhooks=function(){
    const s=document.getElementById('osSlack')?.value?.trim()||'';
    const g=document.getElementById('osHook')?.value?.trim()||'';
    savePlatformConfig({integrations:{...getPlatformConfig().integrations,slackWebhook:s,genericWebhook:g}});
    ownerAuditAppend('integrations_update','webhooks');
  };

  window.ownerTestWebhookPing=function(){
    const url=getPlatformConfig().integrations?.slackWebhook||getPlatformConfig().integrations?.genericWebhook;
    if(!url){showToast('Add a webhook URL first','warning');return;}
    fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Flux Owner ping',ts:new Date().toISOString()})}).then(()=>showToast('Ping sent','success')).catch(()=>showToast('Ping failed (CORS or URL)','error'));
    ownerAuditAppend('webhook_test',{});
  };

  window.ownerExportTasksCsv=function(){
    const h='id,name,done,priority,date,type,subject';
    const rows=tasks.map(t=>[t.id,t.name,t.done,t.priority,t.date||'',t.type||'',t.subject||''].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','));
    const blob=new Blob([[h,...rows].join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flux-tasks.csv';a.click();URL.revokeObjectURL(a.href);
    ownerAuditAppend('export_tasks_csv',{n:tasks.length});
  };
  window.ownerExportSessionsCsv=function(){
    const h='date,mins,subject';
    const rows=sessionLog.map(s=>[s.date,s.mins,s.subject||''].join(','));
    const blob=new Blob([[h,...rows].join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flux-sessions.csv';a.click();URL.revokeObjectURL(a.href);
    ownerAuditAppend('export_sessions_csv',{n:sessionLog.length});
  };

  window.ownerClearAudit=function(){
    if(!confirm('Clear owner audit log?'))return;
    save('flux_owner_audit',[]);
    syncKey('owner_audit',1);
    openOwnerSuite();
  };
})();
