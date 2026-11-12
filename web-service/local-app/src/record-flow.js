// Right-sidebar "원문 기록" view: asked drug -> official source record -> what that record says.
// Boxes come from the records themselves (their category and, for DUR 병용금기, the two drugs the sentence names), never from
// extracted keywords, so a box can only say what its records say. Numbers are record counts, never a risk score.
import {esc,INFO_ICON} from './sources.js';
import {norm} from './medications.js';

const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
// The text after DUR's "금기·주의 내용:" marker, as written; a leading list dash or stray quote is dropped.
export function durReason(text){const m=String(text||'').match(/금기·주의 내용:\s*([\s\S]*)$/);return m?clean(m[1]).replace(/^[-"'\s]+/,''):'';}
// "심바스타틴(Simvastatin)(복합제; 복합 구성 성분: [D000152]Amlodipine (암로디핀)/[D000972]Olmesartan(올메사르탄))"
function durSide(raw){
 const s=clean(raw),name=s.match(/^[^(]+/)?.[0].trim()||s,english=s.match(/^[^(]+\(([^)]*)\)/)?.[1].trim()||'';
 const listed=s.match(/복합 구성 성분:\s*(.*)\)$/)?.[1]||'';
 const parts=listed.split('/').map(p=>p.replace(/\[[^\]]*\]/g,'').trim()).filter(Boolean).map(p=>{const m=p.match(/^([^(]+?)\s*\(([^)]*)\)$/);return m?[m[1].trim(),m[2].trim()]:[p];});
 return {name,names:[name,english].filter(Boolean),combination:/\(복합제/.test(s),parts};
}
// DUR 병용금기 has one fixed sentence naming the two sides. Anything else returns null and is never guessed at.
export function durPair(text){
 const m=clean(text).match(/^\[병용금기\]\s*(.+?)과\(와\)\s*(.+?)은 함께 쓰지 않습니다/);
 return m?{a:durSide(m[1]),b:durSide(m[2]),reason:durReason(text)}:null;
}
// A name counts for a drug when it equals the alias or is a salt form that starts with it ("암로디핀베실산염"), not when it merely contains it.
const sameDrug=(name,alias)=>{const n=norm(name),a=norm(alias);return n.length>=2&&a.length>=2&&(n.startsWith(a)||a.startsWith(n));};
const aliasesOf=d=>d.aliases?.length?d.aliases:[d.name];
const hasName=(names,d)=>names.some(n=>aliasesOf(d).some(a=>sameDrug(n,a)));
// Which asked drugs a side holds: named as the side's own ingredient, or only listed as a component of its combination product.
const askedOn=(side,drugs)=>drugs.flatMap((d,i)=>hasName(side.names,d)?[{i,how:'named'}]:side.parts.some(p=>hasName(p,d))?[{i,how:'part'}]:[]);
function sideLabel(found,drugs){
 if(found.length>1)return [...found].sort((x,y)=>(x.how==='named'?0:1)-(y.how==='named'?0:1)||x.i-y.i).map(f=>drugs[f.i].name).join('·')+' 복합제';
 return found[0].how==='part'?`${drugs[found[0].i].name} 포함 복합제`:drugs[found[0].i].name;
}
// For a DUR 병용금기 record: the asked drugs on each of its two sides as {i,how} (how: 'named' as the side's own ingredient,
// 'part' only as a component of its combination product), or null when the sentence has no readable pair.
export function durPairDrugs(text,drugs){const pair=durPair(text);return pair?{a:askedOn(pair.a,drugs),b:askedOn(pair.b,drugs)}:null;}
const writtenSide=s=>s.combination?`${s.name} 복합제${s.parts.length?`(${s.parts.map(p=>p[1]||p[0]).join('·')})`:''}`:s.name;
const distinct=list=>[...new Set(list.filter(Boolean))];

export function recordFlow(graph,drugs){
 const docs=[...new Map((graph?.evidenceDocuments||[]).map(d=>[d.id,d])).values()],groups=new Map(),edges=graph?.hyperedges||[];
 const add=(key,make,record,links)=>{
  if(!groups.has(key))groups.set(key,{key,records:[],links:new Map(),...make()});
  const g=groups.get(key);g.records.push(record);
  for(const {i,how} of links)if(how==='named'||!g.links.has(i))g.links.set(i,how==='named'?'solid':'dashed');
 };
 for(const doc of docs){
  const pair=doc.category==='병용금기'?durPair(doc.excerpt):null,a=pair?askedOn(pair.a,drugs):[],b=pair?askedOn(pair.b,drugs):[];
  if(a.length||b.length){
   const record={doc,reason:pair.reason,written:`${writtenSide(pair.a)} + ${writtenSide(pair.b)}`},distinctDrugs=new Set([...a,...b].map(x=>x.i)).size;
   if(a.length&&b.length&&distinctDrugs>=2){
    const labels=[sideLabel(a,drugs),sideLabel(b,drugs)];
    add(`direct|${[...labels].sort().join('+')}`,()=>({section:'direct',title:'병용금기',pair:labels.join(' + ')}),record,[...a,...b]);
   }else{
    const found=a.length?a:b,label=sideLabel(found,drugs),other=(a.length?pair.b:pair.a).name;
    add(`other|${label}`,()=>({section:'other',title:'병용금기',side:label,others:[]}),{...record,other},found);
   }
   continue;
  }
  // Records without a readable pair go by their category, joined to the drugs of the relations that cite them.
  const links=drugs.flatMap((d,i)=>edges.some(e=>(e.sourceIds||[]).includes(doc.id)&&e.members.some(id=>d.ids?.has(id)))?[{i,how:'named'}]:[]);
  const category=doc.category||'분류 없음',unread=doc.category==='병용금기';
  add(`info|${category}|${unread}`,()=>({section:'info',title:category,pair:unread?'원문에서 질문한 약의 짝을 확인하지 못함':'',permit:/허가/.test(doc.sourceLabel||'')}),{doc,reason:durReason(doc.excerpt),written:doc.title},links);
 }
 const list=[...groups.values()];
 for(const g of list)if(g.section==='other'){g.others=distinct(g.records.map(r=>r.other));g.pair=g.others.length===1?`${g.side} + ${g.others[0]}`:`${g.side} + 다른 약 ${g.others.length}종`;}
 const byCount=(x,y)=>y.records.length-x.records.length||String(x.pair||x.title).localeCompare(String(y.pair||y.title),'ko');
 const sections=[
  {key:'direct',title:'질문한 약끼리 적힌 기록',groups:list.filter(g=>g.section==='direct').sort((x,y)=>y.links.size-x.links.size||byCount(x,y))},
  {key:'other',title:'질문한 약과 다른 약의 기록',groups:list.filter(g=>g.section==='other').sort(byCount)},
  {key:'info',title:'약별 정보',groups:list.filter(g=>g.section==='info').sort(byCount)},
 ].filter(s=>s.groups.length);
 const known=new Set(docs.map(d=>d.id));
 return {drugs:drugs.map((d,i)=>({i,name:d.name})),sections,total:docs.length,boxes:list.length,unlinked:edges.filter(e=>!(e.sourceIds||[]).some(id=>known.has(id))).length};
}

const GUIDE=['왼쪽 약에서 출발해 선을 따라 읽습니다. 이 약이 이 기록에 나오고, 그 기록에 오른쪽 내용이 적혀 있다는 뜻입니다. 약을 누르면 그 약의 선만 강조됩니다.','실선은 원문에 그 약이 직접 적힌 경우이고, 점선은 복합제의 구성 성분으로만 적힌 경우입니다. 약별 정보 상자의 선은 묶음의 일부 문서가 그 약의 관계와 이어져 있다는 뜻입니다.','선은 원인이나 결과를 뜻하지 않습니다. 건수는 원문 기록의 개수이며 위험도가 아닙니다. 여기에 기록이 없다고 해서 안전하다는 뜻도 아닙니다.'];
function reasonHTML(g){
 if(g.section==='other'&&g.others.length>1)return `<p class="rf-reason">${esc(g.others[0])} 외 ${g.others.length-1}종</p>`;
 if(g.section==='info'&&g.permit)return '<p class="rf-reason">제품별 문서</p>';
 const reasons=distinct(g.records.map(r=>r.reason));if(!reasons.length)return '<p class="rf-reason"></p>';
 return `<p class="rf-reason">${reasons.slice(0,2).map(r=>`<span>${esc(r)}</span>`).join('')}${reasons.length>2?`<small>외 ${reasons.length-2}개</small>`:''}</p>`;
}
const recordHTML=r=>`<article class="rf-record"><strong>${esc(r.written)}</strong>${r.reason?`<p>${esc(r.reason)}</p>`:''}<small>${esc(r.doc.citation?.text||r.doc.sourceLabel||'출처 명칭 미제공')}</small><button type="button" data-open-document="${esc(r.doc.id)}">원문 전체 보기 ↗</button></article>`;
export function recordFlowHTML(flow){
 if(!flow)return '<div class="explorer-empty"><h3>원문 기록으로 살펴보세요</h3><p>질문에 답변한 뒤 이 답변과 이어진 원문 기록을 약, 기록, 내용 순서로 보여 줍니다.</p></div>';
 if(!flow.total)return '<div class="explorer-empty"><h3>연결된 원문 기록이 없습니다</h3><p>이 답변의 관계에서 원문을 찾지 못했습니다. 기록이 없다는 것이 안전하다는 뜻은 아닙니다.</p></div>';
 let k=0;
 const rows=flow.sections.map(s=>`<h4 class="rf-section">${esc(s.title)}</h4>${s.groups.map(g=>{const id=k++,links=[...g.links].map(([drug,style])=>({drug,style}));
  return `<article class="rf-row rf-${s.key}" data-rf-links="${esc(JSON.stringify(links))}"><button type="button" class="rf-box" aria-expanded="false" aria-controls="rf-detail-${id}"><strong>${esc(g.title)} ${g.records.length}건</strong>${g.pair?`<span>${esc(g.pair)}</span>`:''}</button>${reasonHTML(g)}<div class="rf-detail" id="rf-detail-${id}" hidden>${g.records.map(recordHTML).join('')}</div></article>`;}).join('')}`).join('');
 const unlinked=flow.unlinked?`<p class="rf-note">원문이 연결되지 않은 관계 ${flow.unlinked}개는 여기에 나오지 않습니다.</p>`:'';
 return `<div class="rf-head"><p class="rf-summary">원문 기록 ${flow.total}건 · 상자 ${flow.boxes}개</p><button type="button" id="rf-info" class="info-button" aria-expanded="false" aria-controls="rf-guide" aria-label="원문 기록 보는 법" title="원문 기록 보는 법">${INFO_ICON}</button></div><div id="rf-guide" class="rf-guide" hidden>${GUIDE.map(t=>`<p>${esc(t)}</p>`).join('')}</div><div class="rf-flow"><svg class="rf-lines" aria-hidden="true"></svg><div class="rf-drugs">${flow.drugs.map(d=>`<button type="button" class="rf-drug" data-rf-drug="${d.i}" aria-pressed="false">${esc(d.name)}</button>`).join('')}</div><div class="rf-groups">${rows}</div></div>${unlinked}`;
}

// Lines follow the rows' measured positions, so they stay right when a box opens or the sidebar changes width.
export function drawRecordLines(flow,active=null){
 const svg=flow.querySelector('.rf-lines'),base=flow.getBoundingClientRect();if(!svg||!base.width)return;
 const paths=[];
 for(const row of flow.querySelectorAll('.rf-row')){
  const box=row.querySelector('.rf-box').getBoundingClientRect(),x2=box.left-base.left,y2=box.top-base.top+box.height/2;
  for(const {drug,style} of JSON.parse(row.dataset.rfLinks)){
   const pill=flow.querySelector(`[data-rf-drug="${drug}"]`)?.getBoundingClientRect();if(!pill)continue;
   const x1=pill.right-base.left,y1=pill.top-base.top+pill.height/2,mid=(x1+x2)/2,state=active==null?'':active===drug?' on':' off';
   paths.push(`<path class="rf-line${style==='dashed'?' dashed':''}${state}" d="M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}"/>`);
  }
 }
 svg.innerHTML=paths.join('');
}
let observer=null;
export function mountRecordFlow(root){
 observer?.disconnect();observer=null;
 const info=root.querySelector('#rf-info');
 if(info)info.onclick=()=>{const guide=root.querySelector('#rf-guide'),open=guide.hidden;guide.hidden=!open;info.setAttribute('aria-expanded',String(open));};
 const flow=root.querySelector('.rf-flow');if(!flow)return;
 root.querySelectorAll('.rf-box').forEach(b=>b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));root.querySelector(`#${b.getAttribute('aria-controls')}`).hidden=!open;});
 let active=null;
 const paint=()=>{
  root.querySelectorAll('.rf-drug').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rfDrug)===active)));
  root.querySelectorAll('.rf-row').forEach(r=>r.classList.toggle('dim',active!=null&&!JSON.parse(r.dataset.rfLinks).some(l=>l.drug===active)));
  drawRecordLines(flow,active);
 };
 root.querySelectorAll('.rf-drug').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.rfDrug);active=active===i?null:i;paint();});
 observer=new ResizeObserver(()=>drawRecordLines(flow,active));observer.observe(flow);
 paint();
}
