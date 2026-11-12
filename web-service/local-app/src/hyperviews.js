// Hyperedge-first example views for ver.chatbot2, next to the network view. Each view shows relations (hyperedges) as their
// own marks instead of overlapping colored areas:
//   bipartite: asked drugs (left) - relation labels (middle) - other members (right), joined by lines; same-named boxes on
//              the same drugs share a box (×n), and boxes the answer did not cite fold into one dashed box
//   matrix:    entities as rows, relations as columns, membership as dots joined by a vertical line (PAOH style)
//   cards:     one card per relation with its members as chips
// Same rules as the other views: a relation keeps its palette color, asked drugs get the neutral ring, sizes and numbers are
// counts only (never a risk score). Selection hides parts of the drawing (filter) and never moves anything.
// Every view returns {destroy, fitView, zoomBy, resize, filter}.
import {relationColor} from './colors.js';
import {INFO_ICON} from './sources.js';

const SVG='http://www.w3.org/2000/svg';
// The fold button once opened (2D, 점·선, 행렬): pressing it again goes back to the default view.
export const FOLD_OPEN_TEXT='간단하게 보기 ▴',FOLD_OPEN_TITLE='누르면 답변에 쓰인 관계만 남긴 처음 화면으로 돌아갑니다.';
export function el(tag,attrs={},parent){const e=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))if(v!=null)e.setAttribute(k,v);if(parent)parent.append(e);return e;}
const cut=(t,n)=>{t=String(t||'');return t.length>n?t.slice(0,n-1)+'…':t;};
const inks=dark=>dark?{label:'#e8eef7',muted:'#adbed5',line:'#3a475c',key:'#f4f7fb',hub:'#1b2433',band:'#ffffff'}:{label:'#3d4a5e',muted:'#65758b',line:'#d9dee6',key:'#1f2937',hub:'#ffffff',band:'#1f2937'};
// Which asked drugs (indexes into drugs) a relation contains, by any of their node ids.
const drugHits=(edge,drugs)=>drugs.map((d,i)=>edge.members.some(id=>d.ids.has(id))?i:-1).filter(i=>i>=0);
// Relations that join more asked drugs first, then smaller (more specific) ones, then by the relation's own number.
const byFocus=(a,b)=>(b.edge.evidencePriority?.tier||0)-(a.edge.evidencePriority?.tier||0)||(b.edge.evidencePriority?.cited||0)-(a.edge.evidencePriority?.cited||0)||b.hit.length-a.hit.length||a.edge.members.length-b.edge.members.length||a.index-b.index;
const hubOf=(d,data)=>({name:d.name,ids:d.ids,total:data.hyperedges.filter(e=>e.members.some(id=>d.ids.has(id))).length});

// Pan (drag on empty space) and wheel zoom for an SVG whose content sits in `world`; the viewBox always fits the layout.
export function panZoom(svg,world,vb){
 let k=1,tx=0,ty=0,drag=null;const cx=vb.x+vb.w/2,cy=vb.y+vb.h/2;
 const apply=()=>world.setAttribute('transform',`translate(${cx+tx} ${cy+ty}) scale(${k}) translate(${-cx} ${-cy})`);
 const unit=()=>Math.max(vb.w/(svg.clientWidth||vb.w),vb.h/(svg.clientHeight||vb.h));
 svg.addEventListener('pointerdown',e=>{if(e.target.closest('[data-k]'))return;drag={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);svg.style.cursor='grabbing';});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const u=unit();tx+=(e.clientX-drag.x)*u;ty+=(e.clientY-drag.y)*u;drag={x:e.clientX,y:e.clientY};apply();});
 svg.addEventListener('pointerup',()=>{drag=null;svg.style.cursor='';});
 svg.addEventListener('wheel',e=>{e.preventDefault();k=Math.max(.3,Math.min(5,k*(e.deltaY<0?1.12:1/1.12)));apply();},{passive:false});
 apply();
 return {fitView(){k=1;tx=0;ty=0;apply();},zoomBy(f){k=Math.max(.3,Math.min(5,k*f));apply();}};
}
// Hover and click on marks carrying data-k (index into items); clicks are taken from pointerdown targets.
export function interact(svg,items,{onHover,onClick}){
 let down=null,start=null;
 svg.addEventListener('pointerdown',e=>{const g=e.target.closest('[data-k]');down=g?items[+g.dataset.k]:null;start=[e.clientX,e.clientY];});
 svg.addEventListener('pointerup',e=>{if(down&&start&&Math.hypot(e.clientX-start[0],e.clientY-start[1])<5)onClick(down,e);down=null;});
 svg.addEventListener('pointermove',e=>{const g=e.target.closest?.('[data-k]');if(!g)return onHover(null);onHover(items[+g.dataset.k],e.clientX,e.clientY);});
 svg.addEventListener('pointerleave',()=>onHover(null));
}

// ---------- bipartite (layered) ----------
export function bipartiteLayout(data,drugs,{maxRelations=16,maxMembers=5,fold=null}={}){
 const asked=new Set(drugs.flatMap(d=>[...d.ids]));
 const ranked=data.hyperedges.map((edge,index)=>({edge,index,hit:drugHits(edge,drugs)})).filter(r=>r.hit.length).sort(byFocus);
 // Middle boxes: relations with the same name that join the same asked drugs share one box (shown as ×n), placed where the
 // first of them ranks. A same-named relation joined to other asked drugs keeps its own box, so a box never links drugs
 // that none of its relations links. r.edge is the first relation; r.edges holds all of them.
 const boxes=[],byName=new Map();
 for(const r of ranked){
  const name=String(r.edge.label||'').replace(/\s+/g,' ').trim(),key=name&&`${name}|${r.hit.join(',')}`,box=key&&byName.get(key);
  if(box){box.edges.push(r.edge);continue;}
  const b={...r,edges:[r.edge]};if(key)byName.set(key,b);boxes.push(b);
 }
 let rels=boxes.slice(0,maxRelations);const hidden=boxes.slice(rels.length).reduce((n,b)=>n+b.edges.length,0);
 // fold 'closed' | 'open': boxes the answer cited stay as they are; the others share one dashed box after them, which lists
 // them below itself when open. Only when the answer cited at least one shown box and two or more boxes would fold.
 // Order: boxes the answer cited first, the others after. Inside each part, boxes joined to the same asked drugs sit
 // together: more drugs first, then by the drugs' order (drawn top to bottom in that order), keeping the earlier order
 // inside a combination. A small gap separates combinations and parts.
 const isCited=b=>b.edges.some(e=>e.evidencePriority?.cited>0);
 const byHit=(a,b)=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
 const order=list=>list.map((b,i)=>[b,i]).sort(([a,i],[b,j])=>b.hit.length-a.hit.length||byHit(a.hit,b.hit)||i-j).map(([b])=>b);
 const cited=order(rels.filter(isCited)),rest=order(rels.filter(b=>!isCited(b)));let folded=null;
 for(const b of cited)b.band=`c${b.hit}`;for(const b of rest)b.band=`u${b.hit}`;
 if(fold&&rest.length>=2&&cited.length){
  folded={fold:true,band:'fold',open:fold==='open',edges:rest.flatMap(b=>b.edges),boxes:rest.length,hit:[...new Set(rest.flatMap(b=>b.hit))].sort((a,b)=>a-b),shown:[],more:0};
  rels=[...cited,folded,...(folded.open?rest:[])];
 }else rels=[...cited,...rest];
 const REL_GAP=40,BAND_GAP=16,MEM_GAP=22,DRUG_GAP=64,DRUG_MAX=150;
 const membersOf=r=>[...new Set(r.edges.flatMap(e=>e.members))];
 // Members shared by several shown boxes are kept first: they are the ones that tie relations together.
 const freq=new Map();for(const r of rels)if(!r.fold)for(const id of membersOf(r))if(!asked.has(id))freq.set(id,(freq.get(id)||0)+1);
 const label=id=>data.nodes.find(n=>n.id===id)?.label||id;
 rels.forEach((r,i)=>{r.y=i?rels[i-1].y+REL_GAP+(r.band===rels[i-1].band?0:BAND_GAP):0;if(r.fold)return;const others=membersOf(r).filter(id=>!asked.has(id)).sort((a,b)=>freq.get(b)-freq.get(a)||label(a).localeCompare(label(b)));r.shown=others.slice(0,maxMembers);r.more=others.length-r.shown.length;});
 const mid=rels.length?(rels[0].y+rels.at(-1).y)/2:0,span=rels.length?rels.at(-1).y-rels[0].y:0;
 // Members sit at the mean height of their boxes, then are spread to a minimum gap (fewer crossings).
 const spread=(list,gap)=>{list.sort((a,b)=>a.y-b.y);for(let i=1;i<list.length;i++)list[i].y=Math.max(list[i].y,list[i-1].y+gap);const shift=((list[0]?.y||0)+(list.at(-1)?.y||0))/2-mid;for(const x of list)x.y-=shift;return list;};
 const mem=new Map();for(const r of rels)for(const id of r.shown){if(!mem.has(id))mem.set(id,{id,label:label(id),rels:[]});mem.get(id).rels.push(r);}
 const members=spread([...mem.values()].map(m=>({...m,y:m.rels.reduce((s,r)=>s+r.y,0)/m.rels.length})),MEM_GAP);
 // Drugs keep their order and are spaced evenly around the middle of the boxes, so their lines fan out instead of bunching.
 const step=drugs.length>1?Math.max(DRUG_GAP,Math.min(DRUG_MAX,span/(drugs.length-1))):0;
 const drugRows=drugs.map((drug,i)=>({drug,i,count:data.hyperedges.filter(r=>r.members.some(id=>drug.ids.has(id))).length,y:mid+(i-(drugs.length-1)/2)*step}));
 return {drugs:drugRows,rels,members,folded,hidden,unlinked:data.hyperedges.length-ranked.length,X:{drug:0,relL:170,relR:390,member:560}};
}

export function bipartiteView(container,data,{palette,dark,labels=true,drugs,activeHub=null,onSelect=()=>{},onSelectGroup=()=>{},onSelectHub=()=>{},onSelectNode=()=>{},onHover=()=>{},onFoldClose=()=>{}}){
 const ink=inks(dark);
 if(!drugs.length){container.innerHTML='<div class="empty">질문에서 약 이름을 찾지 못했습니다.<br>약 이름을 정확하게 입력해 다시 질문해 주세요.</div>';return {destroy(){},fitView(){},zoomBy(){},resize(){},filter(){}};}
 const previousOverflow=container.style.overflow;container.style.overflow='auto';
 const curve=(x1,y1,x2,y2)=>`M${x1} ${y1} C${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`;
 const color=r=>relationColor(r.edge,r.index,palette);
 // The dashed box of relations the answer did not cite opens in place, the drawing rebuilt with the last selection applied
 // again; pressing it once more goes back to the default view (folded, nothing selected; onFoldClose clears the selection).
 let open=false,svg=null,world=null,pz=null,relEls=[],hubEls=[],memEls=[],last=[null,activeHub];
 const toggleFold=()=>{open=!open;if(!open)last=[null,last[1]];draw();if(!open)onFoldClose();};
 function draw(){
  svg?.remove();relEls=[];hubEls=[];memEls=[];
  const L=bipartiteLayout(data,drugs,{maxRelations:data.hyperedges.length,fold:open?'open':'closed'}),X=L.X,ys=[...L.drugs,...L.rels,...L.members].map(p=>p.y);
  const vb={x:-170,y:Math.min(...ys,0)-50,w:900,h:Math.max(...ys,0)-Math.min(...ys,0)+120};
  const real=L.rels.filter(r=>!r.fold),closed=L.folded&&!L.folded.open?L.folded.edges.length:0,total=real.reduce((n,r)=>n+r.edges.length,0)+closed;
  svg=el('svg',{viewBox:`${vb.x} ${vb.y} ${vb.w} ${vb.h}`,width:'100%',height:'100%',role:'img','aria-label':`연결 흐름 보기: 질문한 약 ${drugs.length}개, 관계 ${total}개${closed?`, 더 구체적으로 알아볼 관계 ${closed}개는 접어 둠`:''}`,style:'display:block;font-family:Pretendard,sans-serif;touch-action:none'},container);
  svg.style.minWidth='700px';svg.style.height=Math.max(container.clientHeight,vb.h*.85)+'px';
  world=el('g',{},svg);const items=[];
  for(const r of L.rels){const g=el('g',{},world),n=r.edges.length;relEls.push({r,g});
   if(r.fold){
    if(!r.open)for(const i of r.hit){const d=L.drugs.find(x=>x.i===i);el('path',{d:curve(X.drug+24,d.y,X.relL,r.y),fill:'none',stroke:ink.muted,'stroke-width':1.2,'stroke-dasharray':'4 4','stroke-opacity':.7},g);}
    const pill=el('g',{'data-k':items.length,style:'cursor:pointer'},g);items.push({kind:'fold'});
    el('title',{},pill).textContent=r.open?FOLD_OPEN_TITLE:`답변에 직접 쓰이지 않은 관계 ${n}개입니다. 누르면 펼칩니다.`;
    el('rect',{x:X.relL,y:r.y-13,width:X.relR-X.relL,height:26,rx:13,fill:ink.hub,stroke:ink.muted,'stroke-width':1.3,'stroke-dasharray':'5 4'},pill);
    el('text',{x:X.relL+12,y:r.y,'dominant-baseline':'central','font-size':12,fill:ink.label},pill).textContent=r.open?FOLD_OPEN_TEXT:`더 구체적으로 알아보기 (${n}개) ▸`;
    continue;
   }
   const c=color(r);
   for(const i of r.hit){const d=L.drugs.find(x=>x.i===i);el('path',{d:curve(X.drug+24,d.y,X.relL,r.y),fill:'none',stroke:c,'stroke-width':1.8,'stroke-opacity':.75},g);}
   for(const id of r.shown){const m=L.members.find(x=>x.id===id);el('path',{d:curve(X.relR,r.y,X.member-7,m.y),fill:'none',stroke:c,'stroke-width':1.1,'stroke-opacity':.45},g);}
   const pill=el('g',{'data-k':items.length,style:'cursor:pointer'},g);items.push(n>1?{kind:'group',edges:r.edges,label:r.edge.label}:{kind:'edge',edge:r.edge});
   if(n>1)el('title',{},pill).textContent=`이름과 이어진 질문 약이 같은 관계 ${n}개를 한 상자로 묶음`;
   else if(r.edge.evidencePriority)el('title',{},pill).textContent=r.edge.evidencePriority.label+' · 임상 근거등급 아님';
   el('rect',{x:X.relL,y:r.y-12,width:X.relR-X.relL,height:24,rx:12,fill:c,'fill-opacity':.16,stroke:c,'stroke-width':1.4},pill);
   const tail=(n>1?` ×${n}`:'')+(r.more?` (+${r.more})`:'');
   el('text',{x:X.relL+12,y:r.y,'dominant-baseline':'central','font-size':12,fill:ink.label},pill).textContent=cut(r.edge.label,Math.max(8,19-tail.length))+tail;
  }
  for(const m of L.members){const g=el('g',{'data-k':items.length},world);items.push({kind:'node',node:data.nodes.find(n=>n.id===m.id)||{id:m.id,label:m.label}});memEls.push({m,g});
   const cs=new Set(m.rels.map(color)),fill=cs.size===1?[...cs][0]:(dark?'#d5deea':'#5d6d84');
   el('circle',{cx:X.member,cy:m.y,r:7,fill},g);
   if(labels)el('text',{x:X.member+13,y:m.y,'dominant-baseline':'central','font-size':12,fill:ink.label},g).textContent=cut(m.label,22);}
  for(const d of L.drugs){const g=el('g',{'data-k':items.length,style:'cursor:pointer'},world);items.push({kind:'drug',hub:hubOf(d.drug,data)});
   const on=last[1]===d.drug.name,ring=el('circle',{cx:X.drug,cy:d.y,r:22,fill:ink.hub,stroke:ink.key,'stroke-width':on?4:2.5,'stroke-dasharray':d.count?null:'5 4'},g);hubEls.push({name:d.drug.name,ring,g,drug:d.drug});
   el('text',{x:X.drug-32,y:d.y-7,'text-anchor':'end','dominant-baseline':'central','font-size':13.5,'font-weight':600,fill:ink.key},g).textContent=d.drug.name;
   el('text',{x:X.drug-32,y:d.y+11,'text-anchor':'end','dominant-baseline':'central','font-size':11,fill:ink.muted},g).textContent=`관계 ${d.count}개`;}
  const note=[L.hidden?`질문 약이 든 관계 ${L.hidden}개 더 있음`:'',L.unlinked?`질문 약이 없는 관계 ${L.unlinked}개 제외`:''].filter(Boolean).join(' · ');
  if(note)el('text',{x:X.relL,y:Math.max(...ys,0)+40,'font-size':11.5,fill:ink.muted},world).textContent=note;
  const textScale=Math.max(1,Math.min(1.6,vb.w/Math.max(1,container.clientWidth)));svg.querySelectorAll('text').forEach(t=>t.setAttribute('font-size',Number(t.getAttribute('font-size')||12)*textScale));
  pz=panZoom(svg,world,vb);
  interact(svg,items,{onHover:(it,x,y)=>onHover(it&&it.kind!=='fold'?(it.kind==='drug'?{kind:'drug',hub:it.hub}:it):null,x,y),onClick:it=>it.kind==='fold'?toggleFold():it.kind==='drug'?onSelectHub(it.hub):it.kind==='edge'?onSelect(it.edge):it.kind==='group'?onSelectGroup(it.edges):it.kind==='node'?onSelectNode(it.node):null});
  filter(...last);
 }
 // A shared box (and the dashed box) is shown when any of its relations is.
 const shown=(r,ids)=>!ids||r.edges.some(e=>ids.has(e.id));
 function filter(ids,active=null){
  last=[ids,active];
  // A selection made only of folded relations (say, one picked from the list) opens them, so it is never invisible.
  const fold=relEls.find(x=>x.r.fold)?.r;
  if(fold&&!open&&ids?.size&&[...ids].every(id=>fold.edges.some(e=>e.id===id))){open=true;draw();return;}
  for(const {r,g} of relEls){const on=shown(r,ids);g.style.opacity=on?'1':'.10';g.querySelectorAll('path').forEach(p=>{p.setAttribute('stroke-width',ids&&on?(r.fold?'3':'5'):(r.fold?'1.2':'1.8'));p.setAttribute('stroke-opacity',on?'1':'.45');});if(ids&&on)world.append(g);}
  for(const {m,g} of memEls){g.style.opacity=m.rels.some(r=>shown(r,ids))?'1':'.25';world.append(g);}
  for(const h of hubEls){h.ring.setAttribute('stroke-width',active===h.name?5:2.5);world.append(h.g);}
 }
 draw();
 return {destroy(){container.style.overflow=previousOverflow;svg?.remove();},fitView(){pz?.fitView();},zoomBy(f){pz?.zoomBy(f);},resize(){},filter};
}

// ---------- matrix (PAOH style) ----------
// How faint the columns and rows outside the current selection are drawn.
export const FADE_COL=.18,FADE_ROW=.35;
// fold 'closed' | 'open' (as in 점·선): the relations the answer cited come first; the others wait behind "더 구체적으로
// 알아보기" while closed and follow the cited ones when open. Only when the answer cited one and two or more would wait.
export function matrixLayout(data,drugs,{maxColumns=30,maxRows=24,fillRows=6,fold=null}={}){
 const asked=new Set(drugs.flatMap(d=>[...d.ids]));
 let cols=data.hyperedges.map((edge,index)=>({edge,index,hit:drugHits(edge,drugs)})).sort(byFocus),folded=null;
 const cited=cols.filter(c=>c.edge.evidencePriority?.cited>0),rest=cols.filter(c=>!(c.edge.evidencePriority?.cited>0));
 if(fold&&cited.length&&rest.length>=2){folded={open:fold==='open',edges:rest.map(c=>c.edge)};cols=folded.open?[...cited,...rest]:cited;}
 const shown=cols.slice(0,maxColumns);
 // Rows: one per asked drug (all its spellings merged), then entities that sit in two or more shown relations, then
 // entities of one relation only (in column order) until the table has fillRows rows. So a table of six members or fewer
 // names every one of them, and +n appears only past the sixth.
 const count=new Map();for(const c of shown)for(const id of new Set(c.edge.members))if(!asked.has(id))count.set(id,(count.get(id)||0)+1);
 const label=id=>data.nodes.find(n=>n.id===id)?.label||id;
 const shared=[...count].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]||label(a[0]).localeCompare(label(b[0])));
 const sharedRows=shared.slice(0,Math.max(0,maxRows-drugs.length)).map(([id])=>id);
 const fill=[...count].filter(([,n])=>n<2).map(([id])=>id).slice(0,Math.max(0,Math.min(fillRows,maxRows)-drugs.length-sharedRows.length));
 const rows=[...drugs.map((d,i)=>({kind:'drug',drug:d,i,label:d.name})),...[...sharedRows,...fill].map(id=>({kind:'node',id,label:label(id)}))];
 // Members with no row of their own cannot get a dot, so +n counts and names them. All spellings of an asked drug share its row.
 const inRow=new Set([...asked,...rows.filter(r=>r.kind==='node').map(r=>r.id)]);
 for(const c of shown){c.cells=rows.map((r,ri)=>(r.kind==='drug'?c.edge.members.some(id=>r.drug.ids.has(id)):c.edge.members.includes(r.id))?ri:-1).filter(x=>x>=0);c.hidden=[...new Set(c.edge.members)].filter(id=>!inRow.has(id)).map(id=>({id,label:label(id)})).sort((a,b)=>a.label.localeCompare(b.label));c.rest=c.hidden.length;}
 return {rows,cols:shown,folded,hiddenCols:cols.length-shown.length,hiddenNumbers:cols.slice(maxColumns).map(c=>c.index+1).sort((a,b)=>a-b),hiddenRows:count.size-(rows.length-drugs.length)};
}
// How to read the matrix, shown behind the ⓘ button.
export function matrixGuide(M){
 const n=M.hiddenNumbers.length,which=n&&n<=10?`(${M.hiddenNumbers.join(', ')}번)`:'';
 return ['답변 인용·원문 표기 확인이 있는 관계부터, 동률이면 질문한 약이 많이 든 관계, 구성원이 적은 관계 순입니다. 임상 근거등급이 아닙니다.','위 숫자는 관계 번호이며 순위가 아닙니다.','구성원이 6개 이하이면 모두 줄로 보여 줍니다. 그보다 많으면 여러 관계에 함께 나오는 구성원부터 줄을 받고, 줄을 받지 못한 구성원은 +n으로 셉니다. +n을 누르면 그 구성원이 보입니다.','세로줄을 누르면 표 아래에 그 관계의 근거 자료가 나옵니다.',...(n?[`이 순서에서 맨 뒤에 오는 관계 ${n}개${which}는 생략했습니다.`]:[])];
}

export function matrixView(container,data,{palette,dark,drugs,activeHub=null,onSelect=()=>{},onSelectHub=()=>{},onSelectNode=()=>{},onHover=()=>{},onFoldClose=()=>{}}){
 const ink=inks(dark),LABEL=170,CW=24,RH=24,TOP=34;
 if(!matrixLayout(data,drugs).cols.length){container.innerHTML='<div class="empty">표시할 관계가 없습니다.</div>';return {destroy(){},fitView(){},zoomBy(){},resize(){},filter(){}};}
 const wrap=document.createElement('div');wrap.className='hv-matrix';container.append(wrap);
 // The dashed "더 구체적으로 알아보기" button opens the relations the answer did not cite (as in 점·선), the drawing rebuilt
 // with the last selection applied again; "간단하게 보기" then goes back to the default view (folded, nothing selected).
 let open=false,M=null,svg=null,pz=null,colEls=new Map(),rowEls=[],rowGroups=[],last=[null,activeHub];
 const fold=document.createElement('button');fold.type='button';fold.className='hv-fold';wrap.append(fold);
 fold.onclick=()=>{open=!open;if(!open)last=[null,last[1]];closePop();draw();if(!open)onFoldClose();};
 function draw(){
 svg?.remove();colEls=new Map();rowEls=[];rowGroups=[];
 M=matrixLayout(data,drugs,{fold:open?'open':'closed'});
 fold.hidden=!M.folded;
 if(M.folded){const n=M.folded.edges.length;fold.textContent=open?FOLD_OPEN_TEXT:`더 구체적으로 알아보기 (${n}개) ▸`;fold.title=open?FOLD_OPEN_TITLE:`답변에 직접 쓰이지 않은 관계 ${n}개입니다. 누르면 펼칩니다.`;fold.setAttribute('aria-expanded',String(open));}
 const W=LABEL+M.cols.length*CW+20,H=TOP+M.rows.length*RH+24,vb={x:-10,y:-10,w:W+20,h:H+20};
 svg=el('svg',{viewBox:`${vb.x} ${vb.y} ${vb.w} ${vb.h}`,width:'100%',height:'100%',role:'img','aria-label':`관계 표 보기: 행 ${M.rows.length}개, 관계 ${M.cols.length}개${M.folded&&!open?`, 더 구체적으로 알아볼 관계 ${M.folded.edges.length}개는 접어 둠`:''}`,style:`display:block;font-family:Pretendard,sans-serif;touch-action:none;margin:0 auto;max-width:${Math.round(vb.w*1.6)}px;max-height:${Math.round(vb.h*1.6)}px`},wrap); // a few columns are not blown up to fill the panel
 const world=el('g',{},svg),items=[];
 M.rows.forEach((r,ri)=>{const y=TOP+ri*RH;
  if(ri%2===0)el('rect',{x:0,y:y-RH/2,width:W-10,height:RH,fill:ink.band,'fill-opacity':.035},world);
  const g=el('g',{'data-k':items.length,style:r.kind==='drug'?'cursor:pointer':null},world);items.push(r.kind==='drug'?{kind:'drug',hub:hubOf(r.drug,data)}:{kind:'node',node:data.nodes.find(n=>n.id===r.id)});rowGroups.push({ri,g});g.style.cursor='pointer';
  const badge=r.kind==='drug'?el('rect',{y:y-11,height:22,rx:11,fill:ink.key,display:'none'},g):null;
  const t=el('text',{x:LABEL-14,y,'text-anchor':'end','dominant-baseline':'central','font-size':r.kind==='drug'?13:12,'font-weight':r.kind==='drug'?600:400,fill:r.kind==='drug'?ink.key:ink.label},g);t.textContent=cut(r.label,16);
  if(r.kind==='drug')rowEls.push({name:r.drug.name,t,badge});
 });
 if(drugs.length)el('line',{x1:0,x2:W-10,y1:TOP+(drugs.length-.5)*RH,y2:TOP+(drugs.length-.5)*RH,stroke:ink.line,'stroke-width':1},world);
 M.cols.forEach((c,ci)=>{const x=LABEL+ci*CW+CW/2,col=relationColor(c.edge,c.index,palette),g=el('g',{'data-k':items.length,style:'cursor:pointer'},world);items.push({kind:'edge',edge:c.edge});colEls.set(c.edge.id,g);
  el('rect',{x:x-CW/2,y:TOP-RH,width:CW,height:M.rows.length*RH+RH+18,fill:col,'fill-opacity':0},g); // hover target for the whole column
  el('text',{x,y:TOP-RH+2,'text-anchor':'middle','dominant-baseline':'central','font-size':10.5,fill:ink.muted},g).textContent=String(c.index+1);
  if(c.cells.length>1)el('line',{x1:x,x2:x,y1:TOP+c.cells[0]*RH,y2:TOP+c.cells.at(-1)*RH,stroke:col,'stroke-width':2.4},g);
  for(const ri of c.cells)el('circle',{cx:x,cy:TOP+ri*RH,r:ri<drugs.length?6:5,fill:col,stroke:ri<drugs.length?ink.key:'none','stroke-width':1.5},g);
  if(c.rest>0){
   const more=el('g',{'data-k':items.length,class:'hv-rest',role:'button',tabindex:0,'aria-label':`관계 ${c.index+1}번에서 표에 없는 구성원 ${c.rest}개 보기`,style:'cursor:pointer'},g);items.push({kind:'rest',col:c});
   el('rect',{x:x-CW/2,y:TOP+M.rows.length*RH-6,width:CW,height:20,fill:col,'fill-opacity':0},more);
   el('text',{x,y:TOP+M.rows.length*RH+4,'text-anchor':'middle','dominant-baseline':'central','font-size':11,'font-weight':600},more).textContent=`+${c.rest}`;
   more.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const r=more.getBoundingClientRect();showRest(c,r.left+r.width/2,r.top);}});
  }
 });
 svg.addEventListener('wheel',closePop,{passive:true});
 const textScale=Math.max(1,Math.min(1.6,vb.w/Math.max(1,container.clientWidth)));svg.querySelectorAll('text').forEach(t=>t.setAttribute('font-size',Number(t.getAttribute('font-size')||12)*textScale));
 pz=panZoom(svg,world,vb);
 interact(svg,items,{onHover:(it,x,y)=>onHover(it?.kind==='rest'?null:it,x,y),onClick:(it,e)=>it.kind==='rest'?showRest(it.col,e.clientX,e.clientY):it.kind==='drug'?onSelectHub(it.hub):it.kind==='edge'?onSelect(it.edge):it.kind==='node'?onSelectNode(it.node):null});
 filter(...last);
 }
 // One small panel at a time over the matrix: the reading guide behind ⓘ, or the members behind +n.
 const info=document.createElement('button');info.type='button';info.className='info-button hv-info';info.title='관계 표 보는 법';info.innerHTML=INFO_ICON;info.setAttribute('aria-label','관계 표 보는 법');info.setAttribute('aria-expanded','false');wrap.append(info);
 let pop=null,openKey=null,closedKey=null;
 function closePop(){pop?.remove();pop=null;openKey=null;info.setAttribute('aria-expanded','false');}
 function openPop(key,heading,fill,place){
  if(closedKey===key){closedKey=null;return false;} // the press on this same button has just closed it
  closePop();
  pop=document.createElement('div');pop.className='hv-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',heading);
  pop.append(Object.assign(document.createElement('strong'),{textContent:heading}));fill(pop);wrap.append(pop);openKey=key;place(pop);
  return true;
 }
 function showRest(c,x,y){
  openPop(c.edge.id,`관계 ${c.index+1}번 · 표에 없는 구성원 ${c.rest}개`,box=>{
   const chips=document.createElement('div');chips.className='hv-chips';
   for(const m of c.hidden)chips.append(Object.assign(document.createElement('span'),{className:'hv-chip',textContent:m.label}));
   box.append(chips);
  },box=>{
   const r=wrap.getBoundingClientRect(),w=box.offsetWidth,h=box.offsetHeight,above=y-r.top-h-12;
   box.style.left=`${Math.max(8,Math.min(r.width-w-8,x-r.left-w/2))}px`;box.style.top=`${above>=8?above:y-r.top+12}px`;
  });
 }
 info.onclick=()=>{
  if(openPop('guide','관계 표 보는 법',box=>{for(const line of matrixGuide(M))box.append(Object.assign(document.createElement('p'),{textContent:line}));},box=>{box.style.left='8px';box.style.top='40px';}))info.setAttribute('aria-expanded','true');
 };
 const onDown=e=>{closedKey=null;if(pop&&!pop.contains(e.target)){closedKey=openKey;closePop();}};
 const onKey=e=>{if(e.key==='Escape')closePop();};
 document.addEventListener('pointerdown',onDown,true);document.addEventListener('keydown',onKey);
 // The selected asked drug reads as a neutral badge; only verdict badges carry risk colors.
 function markRow({t,badge},on){
  if(on){const b=t.getBBox();badge.setAttribute('x',b.x-9);badge.setAttribute('width',b.width+18);}
  badge.setAttribute('display',on?'inline':'none');t.setAttribute('fill',on?ink.hub:ink.key);
 }
 function filter(ids,active=null){
  last=[ids,active];
  // A selection made only of folded relations (say, one picked from the list) opens them, so it is never invisible.
  if(M.folded&&!open&&ids?.size&&[...ids].every(id=>M.folded.edges.some(e=>e.id===id))){open=true;draw();return;}
  // The chosen relations keep their colors; the other columns and rows stay in place, faded (2026-11-09: they used to
  // disappear), so the table keeps its shape and a faded column can be clicked next.
  for(const [id,g] of colEls)g.style.opacity=!ids||ids.has(id)?'1':String(FADE_COL);
  for(const {ri,g} of rowGroups)g.style.opacity=!ids||M.cols.some(c=>ids.has(c.edge.id)&&c.cells.includes(ri))?'1':String(FADE_ROW);
  for(const r of rowEls)markRow(r,active===r.name);
 }
 draw();
 return {destroy(){document.removeEventListener('pointerdown',onDown,true);document.removeEventListener('keydown',onKey);wrap.remove();},fitView(){pz?.fitView();},zoomBy(f){pz?.zoomBy(f);},resize(){},filter};
}

// ---------- cards ----------
export function cardsView(container,data,{palette,drugs,onSelect=()=>{},onSelectHub=()=>{},onSelectNode=()=>{},onHover=()=>{}}){
 const wrap=document.createElement('div');wrap.className='hv-cards';container.append(wrap);
 const asked=new Map();drugs.forEach(d=>{for(const id of d.ids)asked.set(id,d);});
 const rows=data.hyperedges.map((edge,index)=>({edge,index,hit:drugHits(edge,drugs)})).sort(byFocus);
 const label=id=>data.nodes.find(n=>n.id===id)?.label||id,esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
 const cards=new Map();
 for(const r of rows){
  const members=[...new Set(r.edge.members)].sort((a,b)=>asked.has(b)-asked.has(a)),chips=members.slice(0,10),docs=(r.edge.sourceIds||[]).length;
  const card=document.createElement('div');card.className='hv-card';card.tabIndex=0;card.setAttribute('role','button');card.style.setProperty('--c',relationColor(r.edge,r.index,palette));
  card.innerHTML=`<div class="hv-head"><span class="hv-num">${r.index+1}</span><b>${esc(r.edge.label)}</b></div><div class="hv-chips">${chips.map(id=>asked.has(id)?`<span class="hv-chip asked" data-drug="${esc(asked.get(id).name)}">${esc(label(id))}</span>`:`<span class="hv-chip">${esc(label(id))}</span>`).join('')}${members.length>chips.length?`<span class="hv-more">+${members.length-chips.length}</span>`:''}</div><small>구성원 ${members.length}개 · 원문 ${docs}건${r.hit.length>1?` · 질문 약 ${r.hit.length}개 함께`:''}</small>`;
  card.onclick=e=>{const chip=e.target.closest('[data-drug]');if(chip){const d=drugs.find(x=>x.name===chip.dataset.drug);if(d)return onSelectHub(hubOf(d,data));}onSelect(r.edge);};
  card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(r.edge);}};
  card.onmousemove=e=>onHover({kind:'edge',edge:r.edge},e.clientX,e.clientY);card.onmouseleave=()=>onHover(null);
  wrap.append(card);cards.set(r.edge.id,card);
 }
 function filter(ids){for(const [id,c] of cards)c.hidden=!!ids&&!ids.has(id);}
 return {destroy(){wrap.remove();},fitView(){wrap.scrollTop=0;},zoomBy(){},resize(){},filter};
}
