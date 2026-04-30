/**
 * Flux Workspace — Notion-style pages (vanilla IIFE).
 * Depends on globals from app.js: load, save, esc, tasks, notes, classes, todayStr,
 * API, fluxAuthHeaders, showToast, nav, syncKey, openEdit, toggleTask, getSubjects, fmtAI
 */
(function(){
  const KEY='flux_workspace_v1';
  const VERSION=1;
  const TYPES=new Set(['paragraph','heading1','heading2','heading3','todo','bullet','numbered','quote','callout','divider','code','toggle','taskLink','aiSummary']);
  const WS_AI_ACTIONS=new Set(['create_workspace_page','append_workspace_block','update_workspace_property']);

  let slashEl=null, blockMenuEl=null, templateMenuEl=null, taskPickerEl=null;
  let searchQ='', showArchived=false, _saveT=null;

  function uid(p){return (p||'ws')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
  function now(){return Date.now();}

  function emptyWorkspace(){
    return{version:VERSION,activePageId:null,pages:[],templates:[]};
  }

  function normalizeBlock(b,depth){
    depth=depth|0;
    if(!b||typeof b!=='object')return{id:uid('b'),type:'paragraph',text:'',meta:{}};
    const type=TYPES.has(b.type)?b.type:'paragraph';
    const o={
      id:String(b.id||uid('b')),
      type,
      text:String(b.text!=null?b.text:''),
      checked:!!b.checked,
      collapsed:!!b.collapsed,
      language:b.language?String(b.language):'',
      meta:b.meta&&typeof b.meta==='object'?{...b.meta}:{},
    };
    if(depth<1&&Array.isArray(b.children)&&b.children.length)
      o.children=b.children.slice(0,12).map(c=>normalizeBlock(c,depth+1));
    return o;
  }

  function normalizePage(p){
    if(!p||typeof p!=='object')return null;
    const props=p.properties&&typeof p.properties==='object'?p.properties:{};
    const normProps={
      status:['Not started','In progress','Done','Paused'].includes(props.status)?props.status:undefined,
      subject:props.subject!=null?String(props.subject):undefined,
      due:props.due!=null?String(props.due):undefined,
      tags:Array.isArray(props.tags)?props.tags.map(String).filter(Boolean).slice(0,40):[],
      linkedTaskIds:Array.isArray(props.linkedTaskIds)?props.linkedTaskIds.slice(0,80):[],
      linkedNoteIds:Array.isArray(props.linkedNoteIds)?props.linkedNoteIds.slice(0,40):[],
      linkedClassIds:Array.isArray(props.linkedClassIds)?props.linkedClassIds.slice(0,40):[],
    };
    Object.keys(normProps).forEach(k=>{
      const v=normProps[k];
      if(v===undefined||(Array.isArray(v)&&!v.length))delete normProps[k];
    });
    return{
      id:String(p.id||uid('p')),
      parentId:p.parentId!=null&&p.parentId!==''?String(p.parentId):null,
      title:String(p.title||'Untitled'),
      icon:String(p.icon||'📄'),
      cover:String(p.cover||''),
      favorite:!!p.favorite,
      archived:!!p.archived,
      order:typeof p.order==='number'&&isFinite(p.order)?p.order:now(),
      createdAt:typeof p.createdAt==='number'?p.createdAt:now(),
      updatedAt:typeof p.updatedAt==='number'?p.updatedAt:now(),
      properties:normProps,
      blocks:Array.isArray(p.blocks)?p.blocks.map(x=>normalizeBlock(x,0)):[{id:uid('b'),type:'paragraph',text:'',meta:{}}],
    };
  }

  function normalizeWorkspace(raw){
    const ws=emptyWorkspace();
    if(!raw||typeof raw!=='object')return ws;
    ws.version=VERSION;
    if(Array.isArray(raw.pages))ws.pages=raw.pages.map(normalizePage).filter(Boolean);
    if(raw.activePageId&&ws.pages.some(p=>p.id===raw.activePageId))ws.activePageId=String(raw.activePageId);
    if(Array.isArray(raw.templates))ws.templates=raw.templates;
    return ws;
  }

  function loadWorkspace(){
    try{
      const raw=load(KEY,null);
      return normalizeWorkspace(raw);
    }catch(e){return emptyWorkspace();}
  }

  function saveWorkspace(ws,opts){
    const w=normalizeWorkspace(ws);
    w.version=VERSION;
    save(KEY,w);
    if(!opts||!opts.skipSync){try{if(typeof syncKey==='function')syncKey('workspace',w);}catch(e){}}
    return w;
  }

  function gatherFromDOM(){
    const root=document.getElementById('fluxWorkspaceRoot');
    if(!root)return;
    const pageId=root.dataset.activePage;
    if(!pageId)return;
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    root.querySelectorAll('.flux-ws-block[data-block-id]').forEach(row=>{
      const bid=row.getAttribute('data-block-id');
      const b=page.blocks.find(x=>x.id===bid);
      if(!b)return;
      const ta=row.querySelector('textarea.ws-block-input');
      if(ta)b.text=ta.value;
      const pr=row.querySelector('pre.ws-code-input');
      if(pr)b.text=pr.textContent||'';
      const ck=row.querySelector('input[type="checkbox"].ws-todo-check');
      if(ck)b.checked=ck.checked;
    });
    const titleEl=document.getElementById('fluxWsTitle');
    if(titleEl)page.title=titleEl.value.trim()||'Untitled';
    const iconEl=document.getElementById('fluxWsIcon');
    if(iconEl)page.icon=(iconEl.textContent||'📄').trim()||'📄';
    const st=document.getElementById('fluxWsPropStatus');
    if(st){if(st.value)page.properties.status=st.value;else delete page.properties.status;}
    const sub=document.getElementById('fluxWsPropSubject');
    if(sub){if(sub.value)page.properties.subject=sub.value;else delete page.properties.subject;}
    const due=document.getElementById('fluxWsPropDue');
    if(due){if(due.value)page.properties.due=due.value;else delete page.properties.due;}
    const tags=document.getElementById('fluxWsPropTags');
    if(tags){
      const arr=tags.value.split(',').map(s=>s.trim()).filter(Boolean);
      if(arr.length)page.properties.tags=arr;else delete page.properties.tags;
    }
    page.updatedAt=now();
    saveWorkspace(ws,{skipSync:true});
  }

  function debounceSave(){
    gatherFromDOM();
    clearTimeout(_saveT);
    _saveT=setTimeout(()=>{saveWorkspace(loadWorkspace());},350);
  }

  function getPage(ws,id){return ws.pages.find(p=>p.id===id)||null;}
  function siblings(ws,parentId){
    return ws.pages.filter(p=>String(p.parentId||'')===String(parentId||'')).sort((a,b)=>a.order-b.order);
  }
  function depthOf(ws,id,seen){
    seen=seen||new Set();
    if(seen.has(id))return 0;
    seen.add(id);
    const p=getPage(ws,id);
    if(!p||!p.parentId)return 0;
    return 1+depthOf(ws,p.parentId,seen);
  }

  function createBlock(type,text,extra){
    const b=normalizeBlock({type:type||'paragraph',text:text||'',...extra||{}},0);
    return b;
  }

  function templateBlocks(key){
    const h=(t,type,txt)=>createBlock(type,txt);
    const T={
      blank:[h('','paragraph','')],
      weekly:[h('','heading2','This week'),h('','todo','Top 3 priorities'),h('','todo',''),h('','todo',''),h('','paragraph','Notes'),h('','heading3','Due this week'),h('','paragraph','Use slash → Insert today’s tasks')],
      class:[h('','heading2','Assignments'),h('','todo',''),h('','heading2','Class notes'),h('','paragraph',''),h('','heading2','Exam prep'),h('','bullet','Key topics'),h('','heading2','Resources'),h('','paragraph','Links & files')],
      project:[h('','heading2','Outcome'),h('','paragraph',''),h('','heading2','Milestones'),h('','todo',''),h('','heading2','Tasks'),h('','todo',''),h('','heading2','Risks'),h('','bullet',''),h('','heading2','Next action'),h('','paragraph','')],
      study:[h('','heading2','Goal'),h('','paragraph',''),h('','heading2','Active recall'),h('','bullet',''),h('','heading2','Mistakes'),h('','bullet',''),h('','heading2','Next review'),h('','paragraph','')],
      college:[h('','heading2','Activities & leadership'),h('','paragraph',''),h('','heading2','Target schools'),h('','bullet',''),h('','heading2','EC milestones'),h('','todo',''),h('','heading2','Deadlines'),h('','paragraph','')],
    };
    return T[key]||T.blank;
  }

  function createPage(opts){
    const ws=loadWorkspace();
    const parentId=opts&&opts.parentId!=null?String(opts.parentId):null;
    const title=(opts&&opts.title)||'Untitled';
    const template=(opts&&opts.template)||'blank';
    const icon=(opts&&opts.icon)||'📄';
    const sibs=siblings(ws,parentId);
    const ord=sibs.length?sibs[sibs.length-1].order+1:now();
    const page={
      id:uid('p'),
      parentId,
      title,
      icon,
      cover:'',
      favorite:false,
      archived:false,
      order:ord,
      createdAt:now(),
      updatedAt:now(),
      properties:{},
      blocks:[],
    };
    if(template==='class')page.properties.subject='';
    page.blocks=templateBlocks(template).map(normalizeBlock);
    if(opts&&Array.isArray(opts.blocks)&&opts.blocks.length){
      page.blocks=opts.blocks.map(x=>normalizeBlock({type:x.type,text:x.text,...x},0));
    }
    ws.pages.push(normalizePage(page));
    ws.activePageId=page.id;
    saveWorkspace(ws);
    render();
    return page.id;
  }

  function updatePage(id,patch){
    const ws=loadWorkspace();
    const p=ws.pages.find(x=>x.id===id);
    if(!p)return;
    Object.assign(p,patch);
    p.updatedAt=now();
    saveWorkspace(ws);
  }

  function archivePage(id){updatePage(id,{archived:true});render();}
  function restorePage(id){updatePage(id,{archived:false});render();}
  function deletePageHard(id){
    const ws=loadWorkspace();
    ws.pages=ws.pages.filter(p=>p.id!==id);
    ws.pages.forEach(p=>{if(p.parentId===id)p.parentId=null;});
    if(ws.activePageId===id)ws.activePageId=ws.pages[0]?.id||null;
    saveWorkspace(ws);
    render();
  }
  function duplicatePage(id){
    const ws=loadWorkspace();
    const src=ws.pages.find(p=>p.id===id);
    if(!src)return;
    const copy=JSON.parse(JSON.stringify(src));
    copy.id=uid('p');
    copy.title=(src.title||'Page')+' copy';
    copy.createdAt=now();
    copy.updatedAt=now();
    copy.favorite=false;
    const walk=blocks=>blocks.map(b=>{
      const nb={...b,id:uid('b')};
      if(nb.children)nb.children=walk(nb.children);
      return nb;
    });
    copy.blocks=walk(copy.blocks||[]);
    ws.pages.push(normalizePage(copy));
    ws.activePageId=copy.id;
    saveWorkspace(ws);
    render();
  }

  function movePageDir(id,dir){
    gatherFromDOM();
    const ws=loadWorkspace();
    const p=ws.pages.find(x=>x.id===id);
    if(!p)return;
    const sib=siblings(ws,p.parentId);
    const idx=sib.findIndex(x=>x.id===id);
    const j=idx+dir;
    if(j<0||j>=sib.length)return;
    const a=sib[idx],b=sib[j];
    const t=a.order;a.order=b.order;b.order=t;
    saveWorkspace(ws);
    render();
  }

  function setActivePage(id){
    const ws=loadWorkspace();
    if(!getPage(ws,id))return;
    ws.activePageId=id;
    saveWorkspace(ws);
    render();
  }

  function insertBlockAfter(pageId,afterId,block){
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    const nb=normalizeBlock(block,0);
    const i=afterId?page.blocks.findIndex(b=>b.id===afterId):-1;
    if(i<0)page.blocks.unshift(nb);
    else page.blocks.splice(i+1,0,nb);
    page.updatedAt=now();
    saveWorkspace(ws);
    render();
    setTimeout(()=>{
      const el=document.querySelector(`#fluxWorkspaceRoot .flux-ws-block[data-block-id="${nb.id}"] textarea`);
      if(el){el.focus();el.selectionStart=el.value.length;}
    },30);
  }

  function deleteBlock(pageId,bid){
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page||page.blocks.length<=1)return;
    page.blocks=page.blocks.filter(b=>b.id!==bid);
    page.updatedAt=now();
    saveWorkspace(ws);
    render();
  }

  function moveBlock(pageId,bid,dir){
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    const i=page.blocks.findIndex(b=>b.id===bid);
    const j=i+dir;
    if(i<0||j<0||j>=page.blocks.length)return;
    const t=page.blocks[i];
    page.blocks[i]=page.blocks[j];
    page.blocks[j]=t;
    page.updatedAt=now();
    saveWorkspace(ws);
    render();
  }

  function changeBlockType(pageId,bid,type){
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    const b=page&&page.blocks.find(x=>x.id===bid);
    if(!b||!TYPES.has(type))return;
    b.type=type;
    if(type!=='todo')delete b.checked;
    page.updatedAt=now();
    saveWorkspace(ws);
    render();
  }

  function duplicateBlock(pageId,bid){
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    const b=page.blocks.find(x=>x.id===bid);
    if(!b)return;
    const c=normalizeBlock({...JSON.parse(JSON.stringify(b)),id:uid('b')},0);
    const i=page.blocks.findIndex(x=>x.id===bid);
    page.blocks.splice(i+1,0,c);
    page.updatedAt=now();
    saveWorkspace(ws);
    render();
  }

  function closePopovers(){
    if(slashEl){slashEl.remove();slashEl=null;}
    if(blockMenuEl){blockMenuEl.remove();blockMenuEl=null;}
    if(templateMenuEl){templateMenuEl.remove();templateMenuEl=null;}
    if(taskPickerEl){taskPickerEl.remove();taskPickerEl=null;}
  }

  function filterPages(ws){
    const q=searchQ.trim().toLowerCase();
    return ws.pages.filter(p=>{
      if(!showArchived&&p.archived)return false;
      if(showArchived&&!p.archived)return false;
      if(!q)return true;
      if((p.title||'').toLowerCase().includes(q))return true;
      return pageToPlainText(p,50000).toLowerCase().includes(q);
    });
  }

  function pageToPlainText(page,limit){
    const parts=[page.title||''];
    (page.blocks||[]).forEach(b=>{
      parts.push(b.text||'');
      if(b.type==='taskLink'&&b.meta&&b.meta.taskId!=null){
        const t=(typeof tasks!=='undefined'?tasks:[]).find(x=>String(x.id)===String(b.meta.taskId));
        if(t)parts.push(t.name||'');
      }
    });
    let s=parts.join('\n').replace(/\s+/g,' ').trim();
    if(limit&&s.length>limit)s=s.slice(0,limit)+'…';
    return s;
  }

  function buildAIContext(maxChars){
    maxChars=maxChars||4000;
    const ws=loadWorkspace();
    const lines=[];
    let used=0;
    const pages=[...ws.pages].filter(p=>!p.archived).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    pages.forEach(p=>{
      const head=`Page: ${p.icon||''} ${p.title||'Untitled'} (id:${p.id})`;
      const props=JSON.stringify(p.properties||{});
      const body=pageToPlainText(p,1200);
      const chunk=`${head}\nprops:${props}\n${body}\n---\n`;
      if(used+chunk.length>maxChars)return;
      lines.push(chunk);
      used+=chunk.length;
    });
    return lines.join('')||'(workspace empty)';
  }

  function findPageByTitle(ws,title){
    if(!title)return null;
    const q=String(title).trim().toLowerCase();
    return ws.pages.find(p=>!p.archived&&(p.title||'').toLowerCase()===q)
      ||ws.pages.find(p=>!p.archived&&(p.title||'').toLowerCase().includes(q));
  }

  function applyAIAction(a){
    if(!a||!WS_AI_ACTIONS.has(a.action))return null;
    const ws=loadWorkspace();
    if(a.action==='create_workspace_page'){
      let parentId=null;
      if(a.parentTitle){
        const par=findPageByTitle(ws,a.parentTitle);
        if(par)parentId=par.id;
      }
      const template=({weekly:'weekly',class:'class',project:'project',study:'study',blank:'blank',college:'college'})[a.template]||'blank';
      const blocks=Array.isArray(a.blocks)?a.blocks.map(x=>normalizeBlock({type:x.type,text:x.text,...x},0)):null;
      createPage({parentId,title:a.title||'Untitled',template,icon:a.icon||'📝',blocks:blocks||undefined});
      return'✓ Created workspace page: '+esc(a.title||'Untitled');
    }
    if(a.action==='append_workspace_block'){
      const page=findPageByTitle(ws,a.pageTitle||'');
      if(!page)return'✗ No workspace page titled: '+esc(a.pageTitle||'');
      const blk=normalizeBlock({type:a.type||'paragraph',text:a.text||'',meta:a.meta&&typeof a.meta==='object'?a.meta:{}},0);
      page.blocks.push(blk);
      page.updatedAt=now();
      saveWorkspace(ws);
      render();
      return'✓ Appended block to: '+esc(page.title);
    }
    if(a.action==='update_workspace_property'){
      const page=findPageByTitle(ws,a.pageTitle||'');
      if(!page)return'✗ No workspace page titled: '+esc(a.pageTitle||'');
      const prop=a.property;
      if(prop==='tags'&&typeof a.value==='string')page.properties.tags=a.value.split(',').map(s=>s.trim()).filter(Boolean);
      else if(prop==='tags'&&Array.isArray(a.value))page.properties.tags=a.value.map(String);
      else if(prop==='status'&&['Not started','In progress','Done','Paused'].includes(a.value))page.properties.status=a.value;
      else if(prop==='due')page.properties.due=String(a.value||'');
      else if(prop==='subject')page.properties.subject=String(a.value||'');
      else return'✗ Unknown property';
      page.updatedAt=now();
      saveWorkspace(ws);
      render();
      return'✓ Updated '+esc(prop)+' on: '+esc(page.title);
    }
    return null;
  }

  function renderTreeRows(ws,clickFn){
    const visible=filterPages(ws);
    const roots=visible.filter(p=>!p.parentId).sort((a,b)=>a.order-b.order);
    const rows=[];
    function walk(list,depth){
      list.forEach(p=>{
        const fav=p.favorite?'⭐':'';
        const ind='&nbsp;'.repeat(depth*2);
        rows.push(`<div class="flux-ws-tree-row ${ws.activePageId===p.id?'active':''}" data-page-id="${p.id}" role="button" tabindex="0">
          <span class="flux-ws-tree-ico">${esc(p.icon||'📄')}</span>
          <span class="flux-ws-tree-title">${ind}${esc(p.title||'Untitled')}</span>
          <span class="flux-ws-tree-actions" onclick="event.stopPropagation()">
            <button type="button" class="flux-ws-icon-btn" data-act="p-up" data-pid="${p.id}" title="Move up" aria-label="Move page up">↑</button>
            <button type="button" class="flux-ws-icon-btn" data-act="p-down" data-pid="${p.id}" title="Move down" aria-label="Move page down">↓</button>
          </span>
        </div>`);
        const ch=visible.filter(c=>c.parentId===p.id).sort((a,b)=>a.order-b.order);
        if(ch.length)walk(ch,depth+1);
      });
    }
    walk(roots,0);
    return rows.join('')||'<div class="flux-ws-empty" style="padding:16px">No pages match.</div>';
  }

  function renderFavorites(ws){
    const fav=ws.pages.filter(p=>p.favorite&&!p.archived);
    if(!fav.length)return'';
    return`<div class="flux-ws-sec-title">Favorites</div>`+fav.map(p=>
      `<div class="flux-ws-tree-row ${ws.activePageId===p.id?'active':''}" data-page-id="${p.id}" role="button"><span class="flux-ws-tree-ico">${esc(p.icon||'📄')}</span><span class="flux-ws-tree-title">${esc(p.title)}</span></div>`
    ).join('');
  }

  function taskById(id){return(typeof tasks!=='undefined'?tasks:[]).find(t=>String(t.id)===String(id));}

  function renderBlock(ws,page,b,idx,numIdx){
    const bid=b.id;
    const isNum=b.type==='numbered';
    const num=isNum?(numIdx+1):'';
    const gutter=`<div class="flux-ws-block-gutter">
      <button type="button" class="flux-ws-icon-btn" data-act="b-up" data-bid="${bid}" aria-label="Move block up">↑</button>
      <button type="button" class="flux-ws-icon-btn" data-act="b-down" data-bid="${bid}" aria-label="Move block down">↓</button>
      <button type="button" class="flux-ws-icon-btn" data-act="b-menu" data-bid="${bid}" aria-label="Block menu">▾</button>
    </div>`;
    let inner='';
    if(b.type==='divider')inner=`<div class="flux-ws-block-body flux-ws-b-divider"><hr aria-hidden="true"></div>`;
    else if(b.type==='taskLink'){
      const tid=b.meta&&b.meta.taskId;
      const t=tid!=null?taskById(tid):null;
      const miss=!t;
      inner=`<div class="flux-ws-block-body flux-ws-tasklink ${miss?'missing':''}">
        <input type="checkbox" class="flux-ws-tl-check" ${t&&t.done?'checked':''} data-act="tl-toggle" data-tid="${esc(String(tid))}" aria-label="Toggle task done" ${miss?'disabled':''}>
        <div class="flux-ws-tl-body">
          <div class="flux-ws-tl-title">${t?esc(t.name):'Missing task'}</div>
          <div class="flux-ws-tl-meta">${t?esc(((typeof getSubjects==='function'?getSubjects():{})[t.subject]?.short||t.subject||'')+' · '+(t.date||'—')):''}</div>
        </div>
        <button type="button" class="flux-ws-btn" data-act="tl-open" data-tid="${esc(String(tid))}" ${miss?'disabled':''}>Open</button>
      </div>`;
    }
    else if(b.type==='aiSummary'){
      inner=`<div class="flux-ws-block-body flux-ws-b-aiSummary"><div class="flux-ws-ai-h">AI summary</div><div>${fmtAI?fmtAI(b.text||''):esc(b.text||'')}</div>
        <button type="button" class="flux-ws-btn" data-act="ai-sum" data-bid="${bid}" style="margin-top:8px">Refresh</button></div>`;
    }
    else if(b.type==='code'){
      inner=`<div class="flux-ws-block-body flux-ws-b-code"><div class="ws-code-lang">${esc(b.language||'code')}</div>
        <pre class="ws-code-input" contenteditable="true" spellcheck="false" data-bid="${bid}">${esc(b.text||'')}</pre></div>`;
    }
    else if(b.type==='toggle'){
      inner=`<details class="flux-ws-block-body flux-ws-b-toggle" ${b.collapsed?'':'open'} data-bid="${bid}">
        <summary>Toggle</summary>
        <textarea class="ws-block-input" rows="2" data-bid="${bid}">${esc(b.text||'')}</textarea>
      </details>`;
    }
    else if(b.type==='todo'){
      inner=`<div class="flux-ws-block-body flux-ws-b-todo">
        <input type="checkbox" class="ws-todo-check" ${b.checked?'checked':''} aria-label="Todo done">
        <textarea class="ws-block-input" rows="2" placeholder="Todo…">${esc(b.text||'')}</textarea>
      </div>`;
    }
    else{
      const cls=({
        heading1:'flux-ws-h1',heading2:'flux-ws-h2',heading3:'flux-ws-h3',
        bullet:'flux-ws-b-bullet',numbered:'flux-ws-b-numbered',quote:'flux-ws-b-quote',callout:'flux-ws-b-callout',
      })[b.type]||'';
      inner=`<div class="flux-ws-block-body ${cls}">
        ${isNum?`<span class="flux-ws-num-prefix" aria-hidden="true">${num}.</span>`:''}
        <textarea class="ws-block-input" rows="${b.type&&b.type.startsWith('heading')?1:2}" placeholder="Write, or type / for commands…">${esc(b.text||'')}</textarea>
      </div>`;
    }
    return`<div class="flux-ws-block flux-ws-b-${b.type}" data-block-id="${bid}" data-idx="${idx}">
      ${gutter}${inner}
    </div>`;
  }

  function renderBlocksEditor(ws,page){
    let nIdx=0;
    return page.blocks.map((b,i)=>{
      let k;
      if(b.type==='numbered')k=nIdx++;
      return renderBlock(ws,page,b,i,k);
    }).join('');
  }

  function renderEditor(ws,page){
    const subjs=getSubjects&&getSubjects()||{};
    const subOpts=['<option value="">—</option>'].concat(Object.keys(subjs).map(k=>`<option value="${esc(k)}">${esc(subjs[k].name||k)}</option>`)).join('');
    const st=page.properties.status||'';
    const chips=[];
    (page.properties.linkedTaskIds||[]).forEach(tid=>{
      const t=taskById(tid);
      chips.push(`<span class="flux-ws-chip">${t?esc(t.name):'#'+esc(String(tid))}
        <button type="button" data-act="rm-task" data-tid="${esc(String(tid))}" aria-label="Remove link">×</button></span>`);
    });
    (page.properties.linkedNoteIds||[]).forEach(nid=>{
      const n=(typeof notes!=='undefined'?notes:[]).find(x=>String(x.id)===String(nid));
      chips.push(`<span class="flux-ws-chip">📝 ${n?esc(n.title):'Note #'+esc(String(nid))}
        <button type="button" data-act="rm-note" data-nid="${esc(String(nid))}" aria-label="Remove note link">×</button></span>`);
    });
    return`
      <div class="flux-ws-cover" data-empty="${page.cover?0:1}" style="${page.cover?`background-image:url(${esc(page.cover)})`:''}"></div>
      <div class="flux-ws-title-row">
        <button type="button" class="flux-ws-page-icon" id="fluxWsIcon" title="Change icon">${esc(page.icon||'📄')}</button>
        <input type="text" class="flux-ws-title-input" id="fluxWsTitle" value="${esc(page.title||'')}" aria-label="Page title" autocomplete="off">
        <button type="button" class="flux-ws-btn" data-act="fav" title="Favorite" aria-label="Favorite">${page.favorite?'★':'☆'}</button>
        <button type="button" class="flux-ws-btn" data-act="arch" title="Archive">${page.archived?'Restore':'Archive'}</button>
        <button type="button" class="flux-ws-btn" data-act="dup-page" title="Duplicate page">Duplicate</button>
        <button type="button" class="flux-ws-btn" data-act="del-page" title="Delete page">Delete</button>
      </div>
      <div class="flux-ws-props">
        <label>Status<select id="fluxWsPropStatus">${['','Not started','In progress','Done','Paused'].map(v=>`<option ${st===v?'selected':''}>${esc(v||'—')}</option>`).join('')}</select></label>
        <label>Subject<select id="fluxWsPropSubject">${subOpts}</select></label>
        <label>Due<input type="date" id="fluxWsPropDue" value="${esc(page.properties.due||'')}"></label>
        <label style="flex:1;min-width:140px">Tags<input type="text" id="fluxWsPropTags" placeholder="comma,separated" value="${esc((page.properties.tags||[]).join(', '))}"></label>
        <div style="width:100%;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px">
          <button type="button" class="flux-ws-btn" data-act="pick-task">+ Link task</button>
          <button type="button" class="flux-ws-btn" data-act="pick-note">+ Link note</button>
          <button type="button" class="flux-ws-btn" data-act="pick-class">+ Link class</button>
        </div>
        <div class="flux-ws-chips">${chips.join('')||''}</div>
      </div>
      <div id="fluxWsBlocks" class="flux-ws-blocks">${renderBlocksEditor(ws,page)}</div>
    `;
  }

  function bind(root){
    root.onclick=e=>{
      const wsLive=loadWorkspace();
      const page=wsLive.pages.find(p=>p.id===wsLive.activePageId);
      const bUp=e.target.closest('[data-act="b-up"]');
      if(bUp&&page){e.stopPropagation();moveBlock(page.id,bUp.getAttribute('data-bid'),-1);return;}
      const bDn=e.target.closest('[data-act="b-down"]');
      if(bDn&&page){e.stopPropagation();moveBlock(page.id,bDn.getAttribute('data-bid'),1);return;}
      const t=e.target.closest('[data-page-id]');
      if(t&&!e.target.closest('[data-act]')){setActivePage(t.getAttribute('data-page-id'));return;}
      const act=(e.target.closest('[data-act]')||{}).dataset?.act;
      const pid=(e.target.closest('[data-pid]')||{}).dataset?.pid;
      const bid=(e.target.closest('[data-bid]')||{}).dataset?.bid;
      if(act==='p-up'&&pid)movePageDir(pid,-1);
      if(act==='p-down'&&pid)movePageDir(pid,1);
      if(act==='fav'&&page){page.favorite=!page.favorite;saveWorkspace(wsLive);render();}
      if(act==='arch'&&page){if(page.archived)restorePage(page.id);else archivePage(page.id);}
      if(act==='dup-page'&&page)duplicatePage(page.id);
      if(act==='del-page'&&page){if(confirm('Delete this page permanently?'))deletePageHard(page.id);}
      if(act==='pick-task'&&page)openTaskPicker(page.id);
      if(act==='pick-note'&&page)openNotePicker(page.id);
      if(act==='pick-class'&&page)openClassPicker(page.id);
      if(act==='rm-task'&&page){
        const tid=e.target.closest('[data-tid]').dataset.tid;
        page.properties.linkedTaskIds=(page.properties.linkedTaskIds||[]).filter(x=>String(x)!==String(tid));
        saveWorkspace(wsLive);render();
      }
      if(act==='rm-note'&&page){
        const nid=e.target.closest('[data-nid]').dataset.nid;
        page.properties.linkedNoteIds=(page.properties.linkedNoteIds||[]).filter(x=>String(x)!==String(nid));
        saveWorkspace(wsLive);render();
      }
      if(act==='tl-toggle'){
        const tid=e.target.closest('[data-tid]').dataset.tid;
        const tt=tid&&(typeof tasks!=='undefined'?tasks:[]).find(x=>String(x.id)===String(tid));
        if(tt&&typeof toggleTask==='function')toggleTask(tt.id);
        debounceSave();render();
      }
      if(act==='tl-open'){
        const tid=e.target.closest('[data-tid]').dataset.tid;
        const tt=tid&&(typeof tasks!=='undefined'?tasks:[]).find(x=>String(x.id)===String(tid));
        if(tt&&typeof openEdit==='function')openEdit(tt.id);
      }
      if(act==='b-menu'&&bid&&page)openBlockMenu(e.target,page.id,bid);
      if(act==='ai-sum'&&bid&&page)runAISummarizePage(page.id,bid);
    };

    root.addEventListener('toggle',e=>{
      const d=e.target.closest&&e.target.closest('details.flux-ws-b-toggle');
      if(!d||e.target!==d)return;
      const wsT=loadWorkspace();
      const pg=wsT.pages.find(p=>p.id===wsT.activePageId);
      const b=pg&&pg.blocks.find(x=>x.id===d.dataset.bid);
      if(b)b.collapsed=!d.open;
      debounceSave();
    },true);

    root.oninput=e=>{
      if(e.target.matches('#fluxWsTitle, #fluxWsPropStatus, #fluxWsPropSubject, #fluxWsPropDue, #fluxWsPropTags'))debounceSave();
      if(e.target.classList&&e.target.classList.contains('ws-block-input'))debounceSave();
      if(e.target.classList&&e.target.classList.contains('ws-code-input'))debounceSave();
    };

    root.onkeydown=e=>{
      if(e.key==='Escape'){closePopovers();closeDrawer();}
      const ta=e.target.closest('textarea.ws-block-input');
      if(!ta)return;
      const row=ta.closest('.flux-ws-block');
      if(!row)return;
      const page=loadWorkspace().pages.find(p=>p.id===loadWorkspace().activePageId);
      if(!page)return;
      const bid=row.getAttribute('data-block-id');
      const blk=page.blocks.find(b=>b.id===bid);
      if(!blk)return;
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        gatherFromDOM();
        insertBlockAfter(page.id,bid,createBlock('paragraph',''));
      }
      if(e.key==='Backspace'&&ta.selectionStart===0&&ta.selectionEnd===0&&!ta.value){
        e.preventDefault();
        if(page.blocks.length>1)deleteBlock(page.id,bid);
      }
      if(ta.value.startsWith('/')&&ta.selectionStart<=2)queueSlash(ta,bid);
    };

    root.onkeyup=e=>{
      const ta=e.target.closest('textarea.ws-block-input');
      if(!ta)return;
      if(ta.value.startsWith('/'))queueSlash(ta,ta.closest('.flux-ws-block').getAttribute('data-block-id'));
    };
  }

  let _slashTimer=null;
  function queueSlash(ta,bid){
    clearTimeout(_slashTimer);
    _slashTimer=setTimeout(()=>openSlashMenu(ta,bid),120);
  }

  function openSlashMenu(anchor,bid){
    closePopovers();
    const page=loadWorkspace().pages.find(p=>p.id===loadWorkspace().activePageId);
    if(!page)return;
    const rect=anchor.getBoundingClientRect();
    const m=document.createElement('div');
    m.className='flux-ws-pop';
    m.setAttribute('role','listbox');
    const cmds=[
      ['paragraph','Text'],['heading1','Heading 1'],['heading2','Heading 2'],['heading3','Heading 3'],
      ['todo','Todo'],['bullet','Bullet'],['numbered','Numbered'],['quote','Quote'],['callout','Callout'],
      ['divider','Divider'],['code','Code'],['taskLink','Link task'],['aiSummary','AI summarize page'],['aiStudy','AI make study plan'],
      ['insTasks',"Insert today’s tasks"],['insClass','Insert class schedule'],
    ];
    m.innerHTML='<div class="flux-ws-pop-h">Turn into / insert</div>'+cmds.map(([id,lab])=>
      `<button type="button" data-slash="${id}" role="option">${esc(lab)}</button>`).join('');
    m.style.left=Math.min(rect.left,innerWidth-240)+'px';
    m.style.top=(rect.bottom+4)+'px';
    document.body.appendChild(m);
    slashEl=m;
    m.addEventListener('mousedown',ev=>ev.stopPropagation());
    m.onclick=ev=>{
      const id=ev.target.closest('[data-slash]')?.dataset?.slash;
      if(!id)return;
      runSlashCommand(id,bid,anchor);
    };
  }

  function openBlockMenu(anchor,pageId,bid){
    closePopovers();
    const rect=anchor.getBoundingClientRect();
    const m=document.createElement('div');
    m.className='flux-ws-pop';
    m.innerHTML=`
      <div class="flux-ws-pop-h">Turn into</div>
      ${['paragraph','heading1','heading2','heading3','todo','bullet','numbered','quote','callout','code'].map(t=>
        `<button type="button" data-bt="${t}">${esc(t)}</button>`).join('')}
      <div class="flux-ws-pop-h">Actions</div>
      <button type="button" data-bdup>Duplicate</button>
      <button type="button" data-bdel>Delete</button>
    `;
    m.style.left=Math.min(rect.left,innerWidth-240)+'px';
    m.style.top=(rect.bottom+4)+'px';
    document.body.appendChild(m);
    blockMenuEl=m;
    m.onclick=ev=>{
      const t=ev.target.closest('[data-bt]')?.dataset?.bt;
      if(t){changeBlockType(pageId,bid,t);closePopovers();}
      if(ev.target.closest('[data-bdup]')){duplicateBlock(pageId,bid);closePopovers();}
      if(ev.target.closest('[data-bdel]')){deleteBlock(pageId,bid);closePopovers();}
    };
  }

  function runSlashCommand(cmd,bid,ta){
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===ws.activePageId);
    if(!page)return;
    const blk=page.blocks.find(b=>b.id===bid);
    if(!blk)return;
    closePopovers();
    if(cmd==='insTasks'){
      blk.type='paragraph';
      blk.text='';
      const today=todayStr&&todayStr();
      const due=(typeof tasks!=='undefined'?tasks:[]).filter(t=>!t.done&&t.date===today);
      let insertAt=page.blocks.indexOf(blk)+1;
      due.slice(0,12).forEach(t=>{page.blocks.splice(insertAt++,0,normalizeBlock({type:'taskLink',text:'',meta:{taskId:t.id}},0));});
      if(!due.length)page.blocks.splice(insertAt,0,createBlock('paragraph','No tasks due today.'));
      page.blocks=page.blocks.filter(b=>b!==blk);
      saveWorkspace(ws);render();return;
    }
    if(cmd==='insClass'){
      blk.type='paragraph';blk.text='';
      const ix=page.blocks.indexOf(blk);
      const lines=(typeof classes!=='undefined'?classes:[]).filter(c=>c.name).map(c=>`P${c.period}: ${c.name}${c.teacher?' — '+c.teacher:''}`);
      page.blocks.splice(ix,1,createBlock('callout','Today’s schedule'),createBlock('bullet',lines.join('\n')||'No classes set up.'));
      saveWorkspace(ws);render();return;
    }
    if(cmd==='taskLink'){openTaskPickerForBlock(page.id,bid);return;}
    if(cmd==='aiSummary'){blk.type='aiSummary';blk.text='Summarizing…';ta.value='';saveWorkspace(ws);render();runAISummarizePage(page.id,blk.id);return;}
    if(cmd==='aiStudy'){
      blk.type='paragraph';blk.text='';saveWorkspace(ws);render();
      runAIStudyPlan(page.id);return;
    }
    if(TYPES.has(cmd)){blk.type=cmd;if(cmd!=='todo')delete blk.checked;blk.text=(ta.value||'').replace(/^\//,'').trim();saveWorkspace(ws);render();}
  }

  async function runAISummarizePage(pageId,blockId){
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    const text=pageToPlainText(page,12000);
    try{
      const res=await fetch(API.ai,{method:'POST',headers:await fluxAuthHeaders(),body:JSON.stringify({
        system:'Summarize the student workspace page briefly in markdown-ish plain text. Be concrete. No JSON.',
        messages:[{role:'user',content:text}],
      })});
      const data=await res.json();
      const out=data.content?.[0]?.text||'Could not summarize.';
      const b=page.blocks.find(x=>x.id===blockId);
      if(b){b.type='aiSummary';b.text=out;}
      page.updatedAt=now();
      saveWorkspace(ws);
      render();
      if(typeof showToast==='function')showToast('Summary updated','success');
    }catch(err){
      if(typeof showToast==='function')showToast(err.message||'AI error','error');
    }
  }

  async function runAIStudyPlan(pageId){
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    const text=pageToPlainText(page,8000);
    try{
      const res=await fetch(API.ai,{method:'POST',headers:await fluxAuthHeaders(),body:JSON.stringify({
        system:'Create a short study plan (bullets, timed blocks if possible) from this page. Plain text only.',
        messages:[{role:'user',content:text}],
      })});
      const data=await res.json();
      const out=data.content?.[0]?.text||'';
      page.blocks.push(createBlock('callout','Study plan (AI)'));
      page.blocks.push(createBlock('paragraph',out));
      page.updatedAt=now();
      saveWorkspace(ws);render();
    }catch(e){showToast&&showToast(e.message,'error');}
  }

  function openTaskPickerForBlock(pageId,bid){
    closePopovers();
    const ov=document.createElement('div');
    ov.className='flux-ws-pop';
    ov.style.maxHeight='50vh';
    ov.innerHTML='<div class="flux-ws-pop-h">Pick task</div>'+(typeof tasks!=='undefined'?tasks:[]).filter(t=>!t.done).slice(0,40).map(t=>
      `<button type="button" data-tpick="${esc(String(t.id))}">${esc(t.name)}</button>`).join('')||'<div style="padding:8px;color:var(--muted2)">No open tasks</div>';
    document.body.appendChild(ov);
    taskPickerEl=ov;
    ov.style.left='50%';ov.style.top='30%';ov.style.transform='translate(-50%,0)';
    ov.onclick=e=>{
      const id=e.target.closest('[data-tpick]')?.dataset?.tpick;
      if(!id)return;
      gatherFromDOM();
      const ws=loadWorkspace();
      const page=ws.pages.find(p=>p.id===pageId);
      const b=page&&page.blocks.find(x=>x.id===bid);
      if(b){b.type='taskLink';b.text='';b.meta={taskId:id};}
      saveWorkspace(ws);closePopovers();render();
    };
  }

  function openTaskPicker(pageId){
    closePopovers();
    const ov=document.createElement('div');
    ov.className='flux-ws-pop';
    ov.innerHTML='<div class="flux-ws-pop-h">Link task to page</div>'+(typeof tasks!=='undefined'?tasks:[]).slice(0,50).map(t=>
      `<button type="button" data-lpick="${esc(String(t.id))}">${esc(t.name)}${t.done?' ✓':''}</button>`).join('');
    document.body.appendChild(ov);taskPickerEl=ov;
    ov.style.left='50%';ov.style.top='25%';ov.style.transform='translate(-50%,0)';
    ov.onclick=e=>{
      const id=e.target.closest('[data-lpick]')?.dataset?.lpick;
      if(!id)return;
      gatherFromDOM();
      const ws=loadWorkspace();
      const page=ws.pages.find(p=>p.id===pageId);
      if(!page)return;
      page.properties.linkedTaskIds=page.properties.linkedTaskIds||[];
      if(!page.properties.linkedTaskIds.some(x=>String(x)===String(id)))page.properties.linkedTaskIds.push(id);
      saveWorkspace(ws);closePopovers();render();
    };
  }

  function openNotePicker(pageId){
    const id=prompt('Note ID to link (number from Notes tab):');
    if(!id)return;
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    page.properties.linkedNoteIds=page.properties.linkedNoteIds||[];
    const n=parseInt(id,10);
    if(!page.properties.linkedNoteIds.includes(n))page.properties.linkedNoteIds.push(n);
    saveWorkspace(ws);render();
  }

  function openClassPicker(pageId){
    const list=(typeof classes!=='undefined'?classes:[]).map((c,i)=>`${i}: ${c.name||''}`).join('\n');
    const idx=prompt('Class index (0-based):\n'+list);
    if(idx==null||idx==='')return;
    gatherFromDOM();
    const ws=loadWorkspace();
    const page=ws.pages.find(p=>p.id===pageId);
    if(!page)return;
    page.properties.linkedClassIds=page.properties.linkedClassIds||[];
    const id=classes[parseInt(idx,10)]?.id??parseInt(idx,10);
    if(id!=null&&!page.properties.linkedClassIds.includes(id))page.properties.linkedClassIds.push(id);
    saveWorkspace(ws);render();
  }

  function openTemplateMenu(btn){
    closePopovers();
    const rect=btn.getBoundingClientRect();
    const m=document.createElement('div');
    m.className='flux-ws-pop';
    m.innerHTML=['blank','weekly','class','project','study','college'].map(k=>`<button type="button" data-tpl="${k}">${esc(k)}</button>`).join('');
    m.style.left=Math.min(rect.left,innerWidth-200)+'px';
    m.style.top=(rect.bottom+4)+'px';
    document.body.appendChild(m);
    templateMenuEl=m;
    m.onclick=e=>{
      const tpl=e.target.closest('[data-tpl]')?.dataset?.tpl;
      if(tpl){createPage({title:'Untitled',template:tpl});closePopovers();}
    };
  }

  function closeDrawer(){
    const d=document.getElementById('fluxWsDrawer');
    if(d)d.classList.remove('open');
  }
  function openDrawer(){
    const d=document.getElementById('fluxWsDrawer');
    if(d)d.classList.add('open');
  }

  function render(){
    const root=document.getElementById('fluxWorkspaceRoot');
    if(!root)return;
    gatherFromDOM();
    closePopovers();
    let ws=loadWorkspace();
    if(ws.activePageId&&!getPage(ws,ws.activePageId))ws.activePageId=null;
    if(!ws.activePageId){
      const first=ws.pages.find(p=>!p.archived);
      if(first)ws.activePageId=first.id;
    }
    saveWorkspace(ws,{skipSync:true});
    const page=ws.activePageId?getPage(ws,ws.activePageId):null;
    root.dataset.activePage=page?page.id:'';
    const treeHtml=renderTreeRows(ws)+(!showArchived?`<div class="flux-ws-sec-title">Archived</div><button type="button" class="flux-ws-btn" style="width:100%;margin-top:6px" data-act="tog-arch">Show archived</button>`:`<button type="button" class="flux-ws-btn" style="width:100%;margin-top:6px" data-act="tog-arch">Hide archived</button>`);
    root.innerHTML=`
      <div class="flux-ws">
        <header class="flux-ws-topbar">
          <span class="flux-ws-brand">Workspace</span>
          <button type="button" class="flux-ws-btn flux-ws-btn-primary" id="fluxWsNewTop">+ New page</button>
          <button type="button" class="flux-ws-btn flux-ws-mob-tree" id="fluxWsOpenTree" aria-label="Open page list">Pages ☰</button>
          <input type="search" id="fluxWsSearch" placeholder="Search pages…" value="${esc(searchQ)}" aria-label="Search workspace pages">
          <button type="button" class="flux-ws-btn" id="fluxWsTpl">Templates ▾</button>
          <button type="button" class="flux-ws-btn" id="fluxWsAskAi" ${page?'':'disabled'} title="Open Flux AI">Ask Flux AI</button>
        </header>
        <div class="flux-ws-body">
          <aside class="flux-ws-sidebar" aria-label="Page tree">
            <div class="flux-ws-sidebar-scroll">
              <button type="button" class="flux-ws-btn flux-ws-btn-primary" style="width:100%;margin-bottom:8px" id="fluxWsNewSide">+ New page</button>
              ${renderFavorites(ws)}
              <div class="flux-ws-sec-title">Pages</div>
              <div id="fluxWsTree">${treeHtml}</div>
            </div>
          </aside>
          <main class="flux-ws-main" id="fluxWsMain">
            <div class="flux-ws-main-inner">
              ${page?renderEditor(ws,page):`<div class="flux-ws-empty">No pages yet.<br><button type="button" class="flux-ws-btn flux-ws-btn-primary" id="fluxWsEmptyCreate">Create page</button></div>`}
            </div>
          </main>
        </div>
        <div class="flux-ws-drawer" id="fluxWsDrawer" aria-hidden="true">
          <div class="flux-ws-drawer-back" id="fluxWsDrawerBack"></div>
          <div class="flux-ws-drawer-panel" role="dialog" aria-label="Pages">
            <div class="flux-ws-drawer-head"><span>Pages</span><button type="button" class="flux-ws-icon-btn" id="fluxWsDrawerX" aria-label="Close">✕</button></div>
            <div class="flux-ws-sidebar-scroll" id="fluxWsTreeMob">${renderFavorites(ws)+'<div class="flux-ws-sec-title">All</div>'+renderTreeRows(ws)}</div>
          </div>
        </div>
      </div>`;

    document.getElementById('fluxWsSearch')?.addEventListener('input',e=>{searchQ=e.target.value;render();});
    document.getElementById('fluxWsNewTop')?.addEventListener('click',()=>createPage({title:'Untitled',template:'blank'}));
    document.getElementById('fluxWsNewSide')?.addEventListener('click',()=>createPage({title:'Untitled',template:'blank'}));
    document.getElementById('fluxWsEmptyCreate')?.addEventListener('click',()=>createPage({title:'Untitled',template:'blank'}));
    document.getElementById('fluxWsTpl')?.addEventListener('click',e=>openTemplateMenu(e.currentTarget));
    document.getElementById('fluxWsAskAi')?.addEventListener('click',()=>{
      if(!page)return;
      const prefill='About my workspace page "'+(page.title||'')+'":\n'+pageToPlainText(page,3500);
      if(typeof openFluxAgent==='function')openFluxAgent({prefill});
      else if(typeof nav==='function'){nav('ai',null);const inp=document.getElementById('aiInput');if(inp){inp.value=prefill;inp.focus();}}
    });
    document.getElementById('fluxWsOpenTree')?.addEventListener('click',openDrawer);
    document.getElementById('fluxWsDrawerBack')?.addEventListener('click',closeDrawer);
    document.getElementById('fluxWsDrawerX')?.addEventListener('click',closeDrawer);
    document.getElementById('fluxWsTreeMob')?.addEventListener('click',e=>{
      const t=e.target.closest('[data-page-id]');
      if(t){setActivePage(t.getAttribute('data-page-id'));closeDrawer();}
    });
    root.querySelector('[data-act="tog-arch"]')?.addEventListener('click',()=>{showArchived=!showArchived;render();});
    document.getElementById('fluxWsIcon')?.addEventListener('click',()=>{
      const ic=prompt('Page icon (emoji):',page.icon||'📄');
      if(ic!=null){page.icon=ic;saveWorkspace(loadWorkspace());render();}
    });
    const subSel=document.getElementById('fluxWsPropSubject');
    if(subSel&&page)subSel.value=page.properties.subject||'';

    bind(root);

    root.querySelectorAll('#fluxWsTree [data-page-id]').forEach(el=>{
      el.addEventListener('click',()=>setActivePage(el.getAttribute('data-page-id')));
    });
  }

  document.addEventListener('mousedown',e=>{
    const pops=[slashEl,blockMenuEl,templateMenuEl,taskPickerEl].filter(Boolean);
    if(pops.length&&!pops.some(p=>p.contains(e.target)))closePopovers();
  });

  window.FluxWorkspace={
    render,
    createPage,
    getData:()=>loadWorkspace(),
    saveData:d=>saveWorkspace(normalizeWorkspace(d)),
    buildAIContext,
    applyAIAction,
    pageToPlainText,
  };
})();
