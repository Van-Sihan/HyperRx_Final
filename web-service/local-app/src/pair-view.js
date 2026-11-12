// "약 쌍" view, next to 2D, 점·선 and 행렬. Only the asked drugs are drawn. For every two of them it says how many shown
// relations hold both and how many source records those relations cite. With three or more drugs, the relations holding at
// least three asked drugs get their own box; they are also counted in each of their pairs. A pair with no shared relation is
// drawn dashed and says so, because no record here is not the same as safe. Numbers are record counts, never a risk score,
// and colors stay neutral (only verdict badges carry risk). A DUR 병용금기 record counts as "between these drugs" only when
// its sentence puts them on opposite sides; one drug against some other drug is counted apart.
// Two or three drugs are drawn as a line or a triangle; four or more as a grid of pair boxes.
import {esc,INFO_ICON} from './sources.js';
import {durPairDrugs,durReason} from './record-flow.js';
import {edgeSources} from './edge-list.js';
import {edgeButton,sourceArticle} from './relation-explorer.js';
import {el,panZoom,interact} from './hyperviews.js';

const holds=(edge,drug)=>edge.members.some(id=>drug.ids?.has(id));
const UNREAD='병용금기 · 짝 확인 못 함',OTHER='다른 약과의 병용금기',PART='복합제 성분으로 적힌 병용금기';

// One group of asked drugs (indexes in set): its relations, their records by kind, and the counts the screen shows.
function summarize(graph,drugs,set,edges,cited){
 const known=new Set((graph.evidenceDocuments||[]).map(d=>d.id)),rows=new Map(),missing=new Set();
 for(const e of edges){for(const r of edgeSources(e,graph))if(!rows.has(r.id))rows.set(r.id,{...r,cited:cited.has(r.id)});for(const id of e.sourceIds||[])if(!known.has(id))missing.add(id);}
 const within=set.length===2?'두 약끼리의 병용금기':'질문한 약끼리의 병용금기';
 const kindOf=doc=>{
  if(doc.category!=='병용금기')return doc.category||'분류 없음';
  const p=durPairDrugs(doc.excerpt,drugs);if(!p)return UNREAD;
  // Two different drugs of the group on opposite sides; with named=true both must be the sides' own ingredients.
  const across=named=>set.some(i=>set.some(j=>j!==i&&p.a.some(x=>x.i===i&&(!named||x.how==='named'))&&p.b.some(x=>x.i===j&&(!named||x.how==='named'))));
  return across(true)?within:across(false)?PART:OTHER;
 };
 const kinds=new Map();for(const r of rows.values()){const k=kindOf(r.doc);if(!kinds.has(k))kinds.set(k,[]);kinds.get(k).push(r);}
 const groups=[...kinds].map(([label,list])=>({label,rows:list,within:label===within})).sort((a,b)=>b.within-a.within||b.rows.length-a.rows.length||a.label.localeCompare(b.label,'ko'));
 const rest=groups.filter(g=>!g.within),more=rest.slice(2).reduce((n,g)=>n+g.rows.length,0);
 return {names:set.map(i=>drugs[i].name),edges,rows:[...rows.values()],groups,missing:missing.size,withinLabel:within,
  direct:groups.find(g=>g.within)?.rows.length||0,cited:[...rows.values()].filter(r=>r.cited).length,
  kinds:[...rest.slice(0,2).map(g=>`${g.label} ${g.rows.length}`),...(more?[`외 ${more}건`]:[])].join(' · ')};
}
export function drugPairs(graph,drugs,citations=[]){
 const g=graph||{},edges=g.hyperedges||[],cited=new Set(citations.map(c=>c.id)),pairs=[];
 for(let i=0;i<drugs.length;i++)for(let j=i+1;j<drugs.length;j++)
  pairs.push({key:`${i}|${j}`,drugs:[i,j],title:`${drugs[i].name} + ${drugs[j].name}`,...summarize(g,drugs,[i,j],edges.filter(e=>holds(e,drugs[i])&&holds(e,drugs[j])),cited)});
 let multi=null;
 if(drugs.length>=3){const all=drugs.map((_,i)=>i);multi={key:'multi',multi:true,drugs:all,title:drugs.length===3?'세 약이 모두 든 관계':'질문한 약 3개 이상이 든 관계',...summarize(g,drugs,all,edges.filter(e=>drugs.filter(d=>holds(e,d)).length>=3),cited)};}
 return {drugs:drugs.map((d,i)=>({i,name:d.name,ids:d.ids,total:edges.filter(e=>holds(e,d)).length})),pairs,multi,all:[...pairs,...(multi?[multi]:[])]};
}

// How to read the view, shown behind the ⓘ button.
export const PAIR_GUIDE=['질문한 약을 두 개씩 짝지어, 두 약이 함께 든 관계의 수와 그 관계들이 인용한 원문의 수를 적었습니다.','"두 약끼리의 병용금기"는 DUR 병용금기 문장에서 두 약이 서로 반대쪽에 적힌 기록만 셉니다. 한 약과 다른 약 사이의 기록은 "다른 약과의 병용금기"로, 한 약이 복합제의 구성 성분으로만 적힌 기록은 "복합제 성분으로 적힌 병용금기"로 따로 셉니다.','점선은 두 약이 함께 든 관계를 찾지 못한 쌍입니다. 기록이 없다는 뜻이며, 함께 써도 안전하다는 뜻은 아닙니다.','세 약 이상이 함께 든 관계는 각 쌍에도 한 번씩 세어지므로, 따로 한 번 더 보여 줍니다.','선이나 상자를 누르면 오른쪽에 그 쌍의 관계와 원문이 나옵니다. 숫자는 기록의 개수이며 위험도가 아닙니다.'];

export function pairCardHTML(p,{heading=false}={}){
 const lines=p.edges.length?[`<b>관계 ${p.edges.length}개 · 원문 ${p.rows.length}건</b>`,p.direct?`<b>${esc(p.withinLabel)} ${p.direct}건</b>`:'',p.kinds?`<span>${esc(p.kinds)}</span>`:'',p.cited?`<span>답변 인용 원문 ${p.cited}건</span>`:'']
  :[`<b>${p.multi?'해당 관계 없음':'함께 든 관계 없음'}</b>`,'<span>기록이 없다는 뜻이며, 안전하다는 뜻은 아닙니다.</span>'];
 return `<div class="pv-card${p.edges.length?'':' none'}" role="button" tabindex="0" data-pair="${esc(p.key)}" aria-label="${esc(p.title)}">${heading||p.multi?`<strong>${esc(p.title)}</strong>`:''}${lines.filter(Boolean).join('')}</div>`;
}

// Right sidebar for a chosen pair (or the all-drugs box): summary first, then the records by kind, then the relations.
export function pairExplorerHTML(p){
 const who=p.multi?'질문한 약 3개 이상이':'두 약이',badge=`<span class="badge">${p.multi?'질문한 약 묶음':'선택한 약 쌍'}</span><h3>${esc(p.title)}</h3>${p.multi?`<p>${esc(p.names.join(' · '))}</p>`:''}`;
 if(!p.edges.length)return `${badge}<h4>한눈에 보기</h4><p class="explorer-takeaway">이 답변의 관계 중에서 ${who} 함께 든 관계를 찾지 못했습니다.</p><p class="hint">이 화면에서 기록을 찾지 못했다는 뜻이며, 함께 써도 안전하다는 뜻은 아닙니다.</p>`;
 const summary=`${who} 함께 든 관계 ${p.edges.length}개가 원문 ${p.rows.length}건을 인용합니다.${p.direct?` 그중 ${p.withinLabel} 기록은 ${p.direct}건입니다.`:''}${p.cited?` 답변이 인용한 원문은 ${p.cited}건입니다.`:''}`;
 const note=r=>[r.cited?'답변 인용 원문':'',r.doc.category==='병용금기'&&durReason(r.doc.excerpt)?`금기·주의 내용: ${durReason(r.doc.excerpt)}`:''].filter(Boolean).join(' · ');
 // The pair's own 병용금기 opens first; otherwise the first kind opens only when short, so every kind stays in view.
 const groups=p.groups.map((g,i)=>`<details class="explorer-fold"${(p.direct?g.within:i===0&&g.rows.length<=5)?' open':''}><summary>${esc(g.label)} ${g.rows.length}건</summary>${g.rows.map(r=>sourceArticle(r,note(r))).join('')}</details>`).join('');
 const tier=e=>e.evidencePriority?.tier||0,edges=[...p.edges].sort((a,b)=>tier(b)-tier(a)||(b.evidencePriority?.cited||0)-(a.evidencePriority?.cited||0)||a.members.length-b.members.length);
 return `${badge}<h4>한눈에 보기</h4><p class="explorer-takeaway">${esc(summary)}</p><p class="hint">같은 관계에 들었다는 것은 DB가 이 약들을 같은 관계 레코드의 구성원으로 기록했다는 뜻이며, 약 사이에 상호작용이 있다는 뜻은 아닙니다. 숫자는 기록의 개수이며 위험도가 아닙니다.</p><h4>근거 자료 ${p.rows.length}건 · 원문 종류별</h4>${groups||'<p>이 관계들에 연결된 원문이 없습니다. 다른 검색 문서를 출처로 대신 붙이지 않습니다.</p>'}${p.missing?`<p class="hint">DB에 기록된 원문 ${p.missing}건은 찾지 못했습니다.</p>`:''}<h4>${who} 함께 든 관계 ${p.edges.length}개</h4>${edges.map(edgeButton).join('')}`;
}

// Drug positions and box anchors in viewBox units (1 unit = 1 screen pixel when the panel is at least MIN_W x MIN_H). Pair
// boxes on the triangle's upper sides sit nearer the top drug, so the all-drugs box fits between them and the bottom pair.
export const MIN_W=680,MIN_H=560,BOX_W=196;
export function pairGeometry(n,W,H){
 if(n===2){const y=H*.46,pos=[[W*.16,y],[W*.84,y]];return {pos,anchors:{'0|1':[W/2,y]},labelBelow:[true,true]};}
 const pos=[[W/2,90],[W*.14,H-110],[W*.86,H-110]],along=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 return {pos,anchors:{'0|1':along(pos[0],pos[1],.42),'0|2':along(pos[0],pos[2],.42),'1|2':along(pos[1],pos[2],.5),multi:[W/2,H-110-105]},labelBelow:[false,true,true]};
}

export function pairView(container,data,{drugs,citations=[],activeHub=null,onSelectPair=()=>{},onSelectHub=()=>{},onHover=()=>{}}){
 const none={destroy(){},fitView(){},zoomBy(){},resize(){},filter(){}};
 if(!drugs.length){container.innerHTML='<div class="empty">질문에서 약 이름을 찾지 못했습니다.<br>약 이름을 정확하게 입력해 다시 질문해 주세요.</div>';return none;}
 if(drugs.length<2){container.innerHTML='<div class="empty">질문한 약이 하나라서 약 쌍을 만들 수 없습니다.<br>이 약의 관계는 관계 지도·연결 흐름·관계 표에서 확인하세요.</div>';return none;}
 const P=drugPairs(data,drugs,citations),byKey=new Map(P.all.map(p=>[p.key,p])),wrap=document.createElement('div');wrap.className='hv-pairs';container.append(wrap);
 const boxes=new Map(),hubs=[];let pz={fitView(){wrap.scrollTop=0;},zoomBy(){}};
 if(drugs.length<=3){
  const W=Math.max(MIN_W,container.clientWidth||0),H=Math.max(MIN_H,container.clientHeight||0),G=pairGeometry(drugs.length,W,H),vb={x:0,y:0,w:W,h:H};
  const svg=el('svg',{viewBox:`0 0 ${W} ${H}`,width:'100%',height:'100%',role:'img','aria-label':`약 쌍 보기: 질문한 약 ${drugs.length}개, 약 쌍 ${P.pairs.length}개`,style:'display:block;font-family:Pretendard,sans-serif;touch-action:none'},wrap);
  const world=el('g',{},svg),items=[];
  const box=(g,p,[x,y])=>{const w=BOX_W,h=150,fo=el('foreignObject',{x:x-w/2,y:y-h/2,width:w,height:h},g);fo.innerHTML=`<div xmlns="http://www.w3.org/1999/xhtml" class="pv-slot">${pairCardHTML(p)}</div>`;};
  for(const p of P.pairs){const [a,b]=p.drugs.map(i=>G.pos[i]),g=el('g',{class:`pv-pair${p.edges.length?'':' none'}`,'data-k':items.length},world);items.push({kind:'pair',pair:p});boxes.set(p.key,g);
   el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:'pv-hit'},g);el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:'pv-line'},g);}
  // Boxes go above every line, so a line never crosses another pair's numbers.
  for(const p of P.pairs)box(boxes.get(p.key),p,G.anchors[p.key]);
  if(P.multi){const g=el('g',{class:`pv-multi${P.multi.edges.length?'':' none'}`,'data-k':items.length},world);items.push({kind:'pair',pair:P.multi});boxes.set('multi',g);box(g,P.multi,G.anchors.multi);}
  for(const d of P.drugs){const [x,y]=G.pos[d.i],below=G.labelBelow[d.i],g=el('g',{class:'pv-drug','data-k':items.length},world);items.push({kind:'drug',hub:d});hubs.push({d,g});
   el('circle',{cx:x,cy:y,r:24,class:`pv-hub${d.total?'':' empty'}`},g);
   el('text',{x,y:below?y+46:y-50,'text-anchor':'middle','dominant-baseline':'central',class:'pv-name'},g).textContent=d.name;
   el('text',{x,y:below?y+66:y-32,'text-anchor':'middle','dominant-baseline':'central',class:'pv-count'},g).textContent=`관계 ${d.total}개`;}
  pz=panZoom(svg,world,vb);
  interact(svg,items,{onHover:(it,x,y)=>onHover(it?.kind==='drug'?{kind:'drug',hub:it.hub}:null,x,y),onClick:it=>it.kind==='drug'?onSelectHub(it.hub):onSelectPair(it.pair)});
 }else{
  const grid=document.createElement('div');grid.className='pv-grid';grid.innerHTML=P.all.map(p=>`<div class="pv-cell" data-cell="${esc(p.key)}">${pairCardHTML(p,{heading:true})}</div>`).join('');wrap.append(grid);
  grid.querySelectorAll('[data-cell]').forEach(c=>boxes.set(c.dataset.cell,c));
  grid.onclick=e=>{const c=e.target.closest('[data-pair]');if(c)onSelectPair(byKey.get(c.dataset.pair));};
 }
 // Keyboard: Enter or Space on a focused box chooses it, as a click does.
 wrap.addEventListener('keydown',e=>{const c=e.target.closest?.('[data-pair]');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelectPair(byKey.get(c.dataset.pair));}});
 const info=document.createElement('button');info.type='button';info.className='info-button hv-info';info.title='약 쌍 보는 법';info.innerHTML=INFO_ICON;info.setAttribute('aria-label','약 쌍 보는 법');info.setAttribute('aria-expanded','false');wrap.append(info);
 const pop=document.createElement('div');pop.className='hv-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','약 쌍 보는 법');pop.hidden=true;pop.style.left='8px';pop.style.top='40px';
 pop.append(Object.assign(document.createElement('strong'),{textContent:'약 쌍 보는 법'}),...PAIR_GUIDE.map(t=>Object.assign(document.createElement('p'),{textContent:t})));wrap.append(pop);
 const show=open=>{pop.hidden=!open;info.setAttribute('aria-expanded',String(open));};
 info.onclick=()=>show(pop.hidden);
 const onDown=e=>{if(!pop.hidden&&!pop.contains(e.target)&&!info.contains(e.target))show(false);},onKey=e=>{if(e.key==='Escape')show(false);};
 document.addEventListener('pointerdown',onDown,true);document.addEventListener('keydown',onKey);
 // key: the chosen pair, if any. Otherwise a chosen drug keeps its pairs, and a relation selection keeps the pairs holding it.
 function filter(ids,active=null,key=null){
  for(const [k,g] of boxes){const p=byKey.get(k),on=key?k===key:active!=null?p.drugs.some(i=>P.drugs[i].name===active):!ids||p.edges.some(e=>ids.has(e.id));g.classList.toggle('on',k===key);g.classList.toggle('off',!on);}
  const chosen=key&&byKey.get(key);for(const {d,g} of hubs)g.classList.toggle('on',d.name===active||!!(chosen&&!chosen.multi&&chosen.drugs.includes(d.i)));
 }
 filter(null,activeHub);
 return {destroy(){document.removeEventListener('pointerdown',onDown,true);document.removeEventListener('keydown',onKey);wrap.remove();},fitView:pz.fitView,zoomBy:pz.zoomBy,resize(){},filter};
}
