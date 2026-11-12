// ver.chatbot2 network view: a drug-centred star layout of the retrieved hypergraph.
// Centre = the question. Around it, one hub per drug the question asks about. Around each hub, the relations (hyperedges)
// that contain only that drug. Relations that contain two or more asked drugs sit between those hubs and link to each of them,
// so the relations an added drug shares with the current drugs gather in one place.
// Colors follow colors.js (a relation keeps its palette color); asked drugs get the same neutral ring as on the 2D/3D maps.
// Sizes only encode counts (a relation circle grows with its member count); nothing here is a risk score.
import {relationColor,SHARED_CORE} from './colors.js';

const RAD=Math.PI/180,polar=(a,r)=>({x:Math.cos(a*RAD)*r,y:Math.sin(a*RAD)*r});
export const leafRadius=members=>Math.min(16,7+2.2*Math.sqrt(members));
export const PER_PAIR=5;

// drugs: [{name, ids:Set of node ids that stand for that drug}] in display order.
export function networkModel(data,drugs,{maxLeaves=8}={}){
 const hit=e=>drugs.map((d,i)=>e.members.some(id=>d.ids.has(id))?i:-1).filter(i=>i>=0);
 const rows=data.hyperedges.map((edge,index)=>({edge,index,hubs:hit(edge)})).filter(r=>r.hubs.length);
 const bySize=(a,b)=>a.edge.members.length-b.edge.members.length||String(a.edge.label).localeCompare(String(b.edge.label));
 const hubs=drugs.map((d,i)=>{
  const own=rows.filter(r=>r.hubs.length===1&&r.hubs[0]===i).sort(bySize);
  return {name:d.name,ids:d.ids,total:rows.filter(r=>r.hubs.includes(i)).length,leaves:own.slice(0,maxLeaves),hidden:Math.max(0,own.length-maxLeaves)};
 });
 const shared=rows.filter(r=>r.hubs.length>1).sort((a,b)=>b.hubs.length-a.hubs.length||bySize(a,b));
 return {hubs,shared,unlinked:data.hyperedges.length-rows.length};
}

// One asked drug across all of its DB spellings: its relations, how many relations each spelling is in, and which other asked
// drugs share each relation (shared ones first, then smaller relations). drug/others: {name, ids:Set}.
export function drugSummary(graph,drug,others=[]){
 const edges=graph.hyperedges.filter(e=>e.members.some(id=>drug.ids.has(id)));
 const spellings=[...drug.ids].map(id=>({id,label:graph.nodes.find(n=>n.id===id)?.label||id,count:graph.hyperedges.filter(e=>e.members.includes(id)).length})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 const rows=edges.map(edge=>({edge,with:others.filter(o=>edge.members.some(id=>o.ids.has(id))).map(o=>o.name)})).sort((a,b)=>b.with.length-a.with.length||a.edge.members.length-b.edge.members.length);
 return {name:drug.name,ids:drug.ids,edges,spellings,rows};
}

// Positions in a virtual plane centred on the question. Shared relations are grouped by the set of hubs they join;
// each group shows at most PER_PAIR circles and counts the rest.
export function networkLayout(model){
 const n=model.hubs.length,RING=210,LEAF=118;
 const angles=n===2?[180,0]:model.hubs.map((_,i)=>-90+i*360/n);
 const core={kind:'core',x:0,y:0,r:40};
 const hubs=model.hubs.map((hub,i)=>({kind:'hub',...polar(angles[i],RING),r:46,angle:angles[i],hub,i}));
 const leaves=[],bridges=[],notes=[];
 for(const h of hubs){
  const k=h.hub.leaves.length,spread=Math.min(200,Math.max(0,(k-1)*24));
  h.hub.leaves.forEach((row,j)=>{const a=h.angle-spread/2+(k>1?j*spread/(k-1):0),p=polar(a,LEAF);leaves.push({kind:'leaf',x:h.x+p.x,y:h.y+p.y,r:leafRadius(row.edge.members.length),row,hub:h.i,angle:a,j});});
 } // a hub's hidden one-drug relations are counted inside the hub circle
 const groups=new Map();
 for(const row of model.shared){const key=row.hubs.join('-');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 let multi=0;
 for(const [key,rows] of groups){
  const ids=key.split('-').map(Number),shown=rows.slice(0,PER_PAIR);let last=null;
  if(ids.length===2){
   const [a,b]=ids.map(i=>hubs[i].angle),opposite=Math.abs((((b-a)%360)+360)%360-180)<1;
   const mid=opposite?a+90:Math.atan2(Math.sin(a*RAD)+Math.sin(b*RAD),Math.cos(a*RAD)+Math.cos(b*RAD))/RAD;
   shown.forEach((row,k)=>{const side=opposite&&k%2?-1:1,step=opposite?Math.floor(k/2):k,p=polar(mid,side*(96+step*36));last={kind:'bridge',x:p.x,y:p.y,r:leafRadius(row.edge.members.length)+2,row,dir:polar(mid,side),flip:step%2===1};bridges.push(last);});
  }else shown.forEach(row=>{
   // Relations with three or more asked drugs sit just off a drug spoke (pair groups use the bisectors between spokes).
   const m=multi++,a=hubs[m%n].angle+22,p=polar(a,100+Math.floor(m/n)*34);
   last={kind:'bridge',x:p.x,y:p.y,r:leafRadius(row.edge.members.length)+2,row,dir:polar(a,1),flip:false};bridges.push(last);
  });
  if(rows.length>shown.length&&last)notes.push({x:last.x+last.dir.x*44,y:last.y+last.dir.y*44,text:`외 ${rows.length-shown.length}개`});
 }
 const links=[...hubs.map(h=>({kind:'spoke',a:core,b:h})),...leaves.map(l=>({kind:'leaf',a:hubs[l.hub],b:l,row:l.row})),...bridges.flatMap(b=>b.row.hubs.map(i=>({kind:'bridge',a:hubs[i],b,row:b.row})))];
 const all=[core,...hubs,...leaves,...bridges];
 const bounds={minX:Math.min(...all.map(p=>p.x-p.r))-120,maxX:Math.max(...all.map(p=>p.x+p.r))+120,minY:Math.min(...all.map(p=>p.y-p.r))-40,maxY:Math.max(...all.map(p=>p.y+p.r))+60};
 return {core,hubs,leaves,bridges,notes,links,bounds};
}

const SVG='http://www.w3.org/2000/svg';
function el(tag,attrs={},parent){const e=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))if(v!=null)e.setAttribute(k,v);if(parent)parent.append(e);return e;}
const short=t=>{t=String(t||'');return t.length>14?t.slice(0,13)+'…':t;};

// Same interface as sphereView: {destroy, fitView, zoomBy, resize}.
// activeHub: name of the drug whose relations are the current selection; its hub gets a heavier ring.
export function networkView(container,data,{palette,dark,labels,drugs,activeHub=null,onSelect=()=>{},onSelectHub=()=>{},onHover=()=>{}}){
 const stub={destroy(){},fitView(){},zoomBy(){},resize(){}};
 if(!drugs.length){container.innerHTML='<div class="empty">질문에서 약 이름을 찾지 못했습니다.<br>2D나 3D 보기에서 관계를 확인하세요.</div>';return stub;}
 const model=networkModel(data,drugs),L=networkLayout(model),B=L.bounds,vb={x:B.minX,y:B.minY,w:B.maxX-B.minX,h:B.maxY-B.minY};
 const ink=dark?{label:'#e8eef7',muted:'#adbed5',spoke:'#7286a6',key:'#f4f7fb',hub:'#1b2433',coreText:'#111827'}:{label:'#506078',muted:'#65758b',spoke:'#a3b2c7',key:'#1f2937',hub:'#ffffff',coreText:'#ffffff'};
 const svg=el('svg',{viewBox:`${vb.x} ${vb.y} ${vb.w} ${vb.h}`,width:'100%',height:'100%',role:'img','aria-label':`약 중심 네트워크: 질문한 약 ${drugs.length}개, 관계 ${data.hyperedges.length-model.unlinked}개`,style:'display:block;cursor:grab;font-family:Pretendard,sans-serif;touch-action:none'});
 container.append(svg);
 const world=el('g',{},svg),items=[],linkEls=new Map(),color=row=>relationColor(row.edge,row.index,palette);
 // Label halo in the panel's own background so text stays readable where it crosses a line.
 const bg=getComputedStyle(container.closest('.panel')||container).backgroundColor||(dark?'#111827':'#ffffff');
 const trim=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;return {x1:a.x+ux*a.r,y1:a.y+uy*a.r,x2:b.x-ux*b.r,y2:b.y-uy*b.r};};
 for(const ln of L.links){
  const c=ln.row?color(ln.row):ink.spoke,e=el('line',{...trim(ln.a,ln.b),stroke:c,'stroke-width':ln.kind==='bridge'?2.2:ln.kind==='leaf'?1.3:1.4,'stroke-opacity':ln.kind==='spoke'?.9:.6,'stroke-dasharray':ln.kind==='spoke'?'4 4':null},world);
  const key=ln.row?ln.row.edge.id:'hub'+ln.b.i;if(!linkEls.has(key))linkEls.set(key,[]);linkEls.get(key).push(e);
  if(ln.kind!=='spoke'){const hk='hub'+ln.a.i;if(!linkEls.has(hk))linkEls.set(hk,[]);linkEls.get(hk).push(e);}
 }
 const relEls=[],hubEls=[];
 const relation=(p,shared)=>{
  const c=color(p.row),g=el('g',{'data-k':items.length,style:'cursor:pointer'},world);items.push(p);relEls.push({id:p.row.edge.id,g});
  if(shared)el('circle',{cx:p.x,cy:p.y,r:p.r+4,fill:'none',stroke:ink.key,'stroke-width':1.4},g);
  el('circle',{cx:p.x,cy:p.y,r:p.r,fill:c,'fill-opacity':.32,stroke:c,'stroke-width':1.6},g);
  if(labels){
   // One-drug relations: label points away from its drug. Shared relations sit in a radial stack, so their labels go sideways
   // (alternating sides) instead of along the stack, with a small outward nudge off the lines to the drugs.
   let ux,uy,x,y;
   if(shared){const s=p.flip?-1:1;ux=-p.dir.y*s;uy=p.dir.x*s;x=p.x+ux*(p.r+8)+p.dir.x*6;y=p.y+uy*(p.r+8)+p.dir.y*6;}
   else{const h=L.hubs[p.hub],dx=p.x-h.x,dy=p.y-h.y,d=Math.hypot(dx,dy)||1;ux=dx/d;uy=dy/d;
    // Labels of nearly vertical neighbours would sit on one line; every second one moves 14px further out.
    const off=p.r+6+(Math.abs(ux)<.35&&p.j%2?14:0);x=p.x+ux*off;y=p.y+uy*off;}
   el('text',{x,y,'text-anchor':ux>=0?'start':'end','dominant-baseline':'central','font-size':11,fill:ink.label,stroke:bg,'stroke-width':3,'paint-order':'stroke','stroke-linejoin':'round'},g).textContent=short(p.row.edge.label);
  }
 };
 L.leaves.forEach(p=>relation(p,false));L.bridges.forEach(p=>relation(p,true));
 for(const t of L.notes)el('text',{x:t.x,y:t.y,'text-anchor':'middle','dominant-baseline':'central','font-size':12,fill:ink.muted},world).textContent=t.text;
 const core=el('g',{},world);el('circle',{cx:0,cy:0,r:L.core.r,fill:dark?SHARED_CORE.dark:SHARED_CORE.light},core);
 el('text',{x:0,y:0,'text-anchor':'middle','dominant-baseline':'central','font-size':14,'font-weight':700,fill:ink.coreText},core).textContent='질문';
 for(const h of L.hubs){
  const g=el('g',{'data-k':items.length,style:'cursor:pointer'},world);items.push(h);
  const on=activeHub!=null&&h.hub.name===activeHub;
  const halo=el('circle',{cx:h.x,cy:h.y,r:h.r+(on?10:7),fill:ink.key,'fill-opacity':on?.2:.08},g);
  const ring=el('circle',{cx:h.x,cy:h.y,r:h.r,fill:ink.hub,stroke:ink.key,'stroke-width':on?5:3,'stroke-dasharray':h.hub.total?null:'6 4'},g);
  hubEls.push({name:h.hub.name,r:h.r,halo,ring});
  const top=h.hub.hidden?-14:-8;
  el('text',{x:h.x,y:h.y+top,'text-anchor':'middle','dominant-baseline':'central','font-size':h.hub.name.length>5?13:15,'font-weight':700,fill:ink.key},g).textContent=h.hub.name;
  el('text',{x:h.x,y:h.y+top+20,'text-anchor':'middle','dominant-baseline':'central','font-size':11,fill:ink.muted},g).textContent=`관계 ${h.hub.total}개`;
  if(h.hub.hidden)el('text',{x:h.x,y:h.y+top+35,'text-anchor':'middle','dominant-baseline':'central','font-size':10.5,fill:ink.muted},g).textContent=`외 ${h.hub.hidden}개`;
 }
 // Fixed legend (outside the zoomed group): circle kinds only, no explanation sentences.
 const lg=el('g',{transform:`translate(${vb.x+16} ${vb.y+vb.h-18})`},svg);
 el('circle',{cx:6,cy:0,r:6,fill:ink.spoke,'fill-opacity':.32,stroke:ink.spoke},lg);el('text',{x:18,y:0,'dominant-baseline':'central','font-size':12,fill:ink.muted},lg).textContent='한 약의 관계';
 el('circle',{cx:118,cy:0,r:6,fill:ink.spoke,'fill-opacity':.32,stroke:ink.spoke},lg);el('circle',{cx:118,cy:0,r:10,fill:'none',stroke:ink.key,'stroke-width':1.4},lg);el('text',{x:134,y:0,'dominant-baseline':'central','font-size':12,fill:ink.muted},lg).textContent='여러 약이 함께 든 관계';
 // Pan and zoom act on the world group; the viewBox itself always fits the whole layout.
 let k=1,tx=0,ty=0,drag=null,moved=false,hot=null;
 const cx=vb.x+vb.w/2,cy=vb.y+vb.h/2,apply=()=>world.setAttribute('transform',`translate(${cx+tx} ${cy+ty}) scale(${k}) translate(${-cx} ${-cy})`);
 const unit=()=>Math.max(vb.w/(svg.clientWidth||vb.w),vb.h/(svg.clientHeight||vb.h));
 const highlight=key=>{if(hot===key)return;for(const e of linkEls.get(hot)||[])e.setAttribute('stroke-opacity',e.dataset.base);hot=key;for(const e of linkEls.get(key)||[]){e.dataset.base=e.dataset.base||e.getAttribute('stroke-opacity');e.setAttribute('stroke-opacity',1);}};
 const itemAt=e=>{const g=e.target.closest?.('[data-k]');return g?items[+g.dataset.k]:null;};
 // The item under the pointer is taken at pointerdown: after setPointerCapture, pointerup targets the svg itself.
 let downItem=null;
 svg.onpointerdown=e=>{downItem=itemAt(e);drag={x:e.clientX,y:e.clientY};moved=false;onHover(null);svg.setPointerCapture(e.pointerId);};
 svg.onpointermove=e=>{
  if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(moved){const u=unit();tx+=dx*u;ty+=dy*u;drag={x:e.clientX,y:e.clientY};apply();svg.style.cursor='grabbing';}return;}
  const it=itemAt(e);if(!it){highlight(null);svg.style.cursor='grab';return onHover(null);}
  svg.style.cursor='pointer';highlight(it.kind==='hub'?'hub'+it.i:it.row.edge.id);
  onHover(it.kind==='hub'?{kind:'drug',hub:it.hub}:{kind:'edge',edge:it.row.edge},e.clientX,e.clientY);
 };
 svg.onpointerup=()=>{const was=drag,it=downItem;drag=null;downItem=null;svg.style.cursor='grab';if(!was||moved||!it)return;if(it.kind==='hub')onSelectHub(it.hub);else onSelect(it.row.edge);};
 svg.onpointerleave=()=>{if(!drag){highlight(null);onHover(null);}};
 svg.onwheel=e=>{e.preventDefault();k=Math.max(.3,Math.min(4,k*(e.deltaY<0?1.12:1/1.12)));apply();};
 apply();
 // Selection without redrawing: positions and colors stay; unselected relations and their lines are hidden, the active hub is marked.
 function filter(ids,active=null){
  for(const {id,g} of relEls)g.style.display=!ids||ids.has(id)?'':'none';
  for(const [key,els] of linkEls)if(!key.startsWith('hub'))for(const e of els)e.style.display=!ids||ids.has(key)?'':'none';
  for(const x of hubEls){const on=active!=null&&x.name===active;x.halo.setAttribute('r',x.r+(on?10:7));x.halo.setAttribute('fill-opacity',on?.2:.08);x.ring.setAttribute('stroke-width',on?5:3);}
 }
 return {destroy(){svg.remove();},fitView(){k=1;tx=0;ty=0;apply();},zoomBy(f){k=Math.max(.3,Math.min(4,k*f));apply();},resize(){},filter};
}
