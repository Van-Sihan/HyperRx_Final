import {esc,INFO_ICON,sourceName} from './sources.js';
import {edgeSources} from './edge-list.js';

// Traceability to this answer, never a clinical evidence grade or DB weight.
export function evidencePriority(edge,graph,citations=[]){
 const ids=new Set(citations.map(c=>c.id)),rows=edgeSources(edge,graph);
 const cited=rows.filter(r=>ids.has(r.id)).length;
 const matches=r=>(edge.sourceSpans?.find(s=>s.id===r.id)?.matched_members||r.doc.matchedMembers||[]).length;
 const matched=Math.max(0,...rows.map(matches)),citedMatched=Math.max(0,...rows.filter(r=>ids.has(r.id)).map(matches));
 const tier=edge.provenance?.status==='demo'?0:cited?(citedMatched>=2?5:4):rows.length?(matched>=2?3:2):1;
 const label=tier===5?'답변 인용 · 구성원 표기 확인':tier===4?'답변 인용 · 표기 대조 필요':tier===3?'원문 연결 · 구성원 표기 확인':tier===2?'원문 연결 · 표기 대조 필요':tier===1?'출처 연결 확인 필요':'가상 예시';
 return {tier,label,cited,sources:rows.length,matched};
}
export function focusQuestionGraph(graph,keys,{demo=false,citations=[],groups=[]}={}){
 const relevant=e=>groups.length>1?groups.filter(g=>e.members.some(id=>g.ids.has(id))).length>=2:e.members.some(id=>keys.has(id));
 const hyperedges=graph.hyperedges.filter(e=>demo||relevant(e)).map(e=>({...e,evidencePriority:evidencePriority(e,graph,citations)}));
 const used=new Set(hyperedges.flatMap(e=>e.members)),sourceIds=new Set(hyperedges.flatMap(e=>e.sourceIds||[]));
 return {...graph,nodes:graph.nodes.filter(n=>used.has(n.id)),hyperedges,evidenceDocuments:(graph.evidenceDocuments||[]).filter(d=>sourceIds.has(d.id)),excluded:graph.hyperedges.length-hyperedges.length};
}
export function nodeConnections(graph,ids){
 const selected=new Set(ids),edges=graph.hyperedges.filter(e=>e.members.some(id=>selected.has(id)));
 const others=new Set(edges.flatMap(e=>e.members).filter(id=>!selected.has(id)));
 return {edges,nodes:graph.nodes.filter(n=>others.has(n.id))};
}
const excerpt=(text,n=180)=>{const s=String(text||'').split('<SEP>')[0];return s.length>n?s.slice(0,n)+'…':s;};
const paragraphs=text=>String(text||'').split('<SEP>').filter(Boolean).map(t=>`<p>${esc(t)}</p>`).join('');
export const edgeButton=e=>`<button type="button" class="explorer-edge" data-explore-edge="${esc(e.id)}"><strong>${esc(e.label)}</strong><small>${esc(e.evidencePriority?.label||'출처 확인 필요')}</small></button>`;
const nodeButton=n=>`<button type="button" class="explorer-node" data-explore-node="${esc(n.id)}">${esc(n.label||n.id)}<small>${esc(n.type||'유형 미제공')}</small></button>`;
export function tagExplanation(edge,tag){
 const needle=String(tag).toLocaleLowerCase();
 const glossary={'drug interaction':'약물 상호작용: 약물을 함께 사용할 때 효과나 안전성에 영향을 줄 수 있는 관계를 분류하는 태그입니다.','efficacy risk':'효과 저하 관련 분류: 기대하는 치료 효과의 변화에 관한 추출 태그입니다.','special populations':'특정 환자군: 고령자 등 설명에 명시된 환자군과 관련한 분류입니다. 구체적인 대상은 아래 추출문을 확인하세요.'};
 const context=String(edge.description||'').split(/<SEP>|(?<=[.!?。])\s+|\n/).filter(t=>t.toLocaleLowerCase().includes(needle)).join(' ');
 return context||glossary[needle]||'';
}
// One source card from an edgeSources row. note: an extra line under the citation, such as the DUR reason or "답변 인용".
// The title and source name, then one row of actions: "발췌 읽기" opens the excerpt under the card, "전체 보기" the whole record.
// no: the card's number in its relation's list ("근거 1"), the number the sentence chips of that relation use.
export const sourceArticle=(r,note='',no=null)=>`<article class="explorer-source"><div class="es-head"><strong>${no?`<span class="es-no">근거 ${no}</span>`:''}${esc(r.doc.title)}</strong><small>${esc(r.doc.citation?.text||r.doc.sourceLabel||'출처 명칭 미제공')}</small></div>${note?`<p class="hint">${esc(note)}</p>`:''}<div class="es-actions"><button type="button" class="es-btn" data-quote aria-expanded="false">발췌 읽기</button><button type="button" class="es-btn" data-open-document="${esc(r.id)}">전체 보기 ↗</button>${r.doc.url?`<a class="es-btn" href="${esc(r.doc.url)}" target="_blank" rel="noopener noreferrer">외부 출처 ↗</a>`:''}</div><blockquote class="es-quote" hidden>${esc(r.quote)}</blockquote></article>`;
// What kind of records a relation rests on, for its source line: "DUR 성분정보 병용금기 4건", at most three kinds.
function sourceKinds(rows){
 const n=new Map();for(const r of rows){const k=[sourceName(r.doc)||'출처 명칭 미제공',r.doc.category].filter(Boolean).join(' ');n.set(k,(n.get(k)||0)+1);}
 const kinds=[...n].sort((a,b)=>b[1]-a[1]),rest=kinds.slice(3).reduce((s,[,c])=>s+c,0);
 return kinds.slice(0,3).map(([k,c])=>`${k} ${c}건`).join(', ')+(rest?` 외 ${rest}건`:'');
}
// Where the sentences of a relation's explanation came from, said once per block (not after every sentence). The DB
// stores the explanation as the sentences it extracted from each of the relation's source records, joined with <SEP>.
// One source record: every sentence came from it, and "근거 1" opens it. Several: each sentence came from one of them but
// the DB does not keep which, so the line names them all ("근거 1–4", what kind of records) and opens the list.
// list=false (an entity's view, where the relation's own list is not shown): "원문 열기", or "근거 n건" opening the relation.
function sourceLine(edge,rows,list=true){
 if(!rows.length)return '';
 const line=(button,text)=>`<p class="xp-src"><span class="xp-src-label">출처</span>${button}<span class="xp-src-text">${esc(text)}</span></p>`;
 if(rows.length===1){const r=rows[0];return line(`<button type="button" class="xp-cite" data-cite-source="${esc(r.id)}" data-cite-names="${esc(r.names.join('|'))}" title="원문 열기">${list?'근거 1':'원문 열기'}</button>`,r.doc.title);}
 const n=rows.length;
 return line(list?`<button type="button" class="xp-cite" data-show-sources title="누르면 아래 근거 자료 목록을 펼칩니다.">근거 1–${n}</button>`:`<button type="button" class="xp-cite" data-explore-edge="${esc(edge.id)}" title="누르면 이 관계의 근거 자료를 봅니다.">근거 ${n}건</button>`,sourceKinds(rows));
}
const parts=text=>String(text||'').split('<SEP>').map(s=>s.trim()).filter(Boolean);
const cut=(s,n)=>s.length>n?s.slice(0,n)+'…':s;
// The first sentence with its source line under it; the whole explanation folded below, its source line on top.
function longDescription(edge,rows=[],{list=true}={}){
 const ps=parts(edge.description),src=sourceLine(edge,rows,list);
 if(!ps.length)return '<p class="explorer-takeaway">상세 설명이 제공되지 않았습니다.</p>';
 const takeaway=`<div class="explorer-takeaway"><p>${esc(cut(ps[0],240))}</p>${src}</div>`;
 if(ps.length<2&&ps[0].length<=240)return takeaway;
 return takeaway+`<details class="explorer-fold"><summary>관계 설명 전체 읽기 (${ps.length}문장)</summary>${src}<ul class="xp-sentences">${ps.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></details>`;
}
// How to read the source line, behind ⓘ next to "한눈에 보는 관계".
const citeGuide=`<details class="xp-info"><summary title="출처 표시 보는 법" aria-label="출처 표시 보는 법">${INFO_ICON}</summary><div class="xp-info-body"><p>설명 아래 '출처' 줄은 이 설명을 추출한 근거 자료입니다. 번호는 아래 근거 자료의 번호이고, 누르면 원문이나 목록이 열립니다.</p><p>근거가 여러 건인 관계는 각 근거에서 추출한 문장을 합쳐 저장합니다. 문장마다 어느 건에서 왔는지는 DB에 따로 저장되어 있지 않아 '근거 1–4'처럼 범위로 적습니다.</p><p>관계 설명은 DB가 원문에서 자동으로 추출한 문장입니다. 임상 판단에는 원문을 함께 확인하세요.</p></div></details>`;
// A relation's source records behind "근거 자료 n건 ▼"; pressing it opens the numbered cards.
function sourceList(rows,empty,tag='h4'){
 const title=`<${tag}>근거 자료 <span class="xp-count">${rows.length}건</span></${tag}>`;
 return rows.length?`<details class="xp-sources"><summary>${title}<span class="xp-caret" aria-hidden="true"></span></summary>${rows.map((r,i)=>sourceArticle(r,'',i+1)).join('')}</details>`:`${title}<p>${empty}</p>`;
}
const tagsHTML=edge=>`<div class="explorer-tags">${(edge.tags||[]).map(tag=>{const explanation=tagExplanation(edge,tag);return `<details class="explorer-tag"><summary>${esc(tag)}</summary><p>${explanation?esc(explanation):'이 태그는 DB가 이 관계에 붙인 추출 키워드입니다. 제공된 설명에 태그를 직접 설명하는 문장이 없어 의미를 확정할 수 없습니다.'}</p><small>관계 추출문에서 찾은 문맥입니다. 태그 자체는 병용금기 판정이나 별도의 근거가 아닙니다.</small></details>`;}).join('')||'<p>추출 태그가 없습니다.</p>'}</div>`;
// The first line of a relation's explanation: every member of the relation, the asked drugs first (in the question's
// order, one name for all of a drug's spellings). Members typed as something other than a medicine (an adverse event, a
// patient group, a disease) follow as "함께 든 항목"; most members carry no type, so they count with the medicines.
const MEDICINE=/ACTIVE_INGREDIENT|DRUG_PRODUCT|DRUG_CLASS|약물|성분|제품/i;
const notMedicine=t=>!!t&&t!=='UNKNOWN'&&!MEDICINE.test(t);
export function relationLead(edges,graph,drugs=[],cap=5){
 const members=[...new Set(edges.flatMap(e=>e.members))],asked=drugs.filter(d=>members.some(id=>d.ids?.has(id))).map(d=>d.name);
 const askedIds=new Set(drugs.flatMap(d=>[...(d.ids||[])])),node=id=>graph.nodes.find(n=>n.id===id);
 const rest=members.filter(id=>!askedIds.has(id)).map(id=>({label:node(id)?.label||id,other:notMedicine(node(id)?.type)})).sort((a,b)=>a.label.localeCompare(b.label));
 const main=[...asked,...rest.filter(m=>!m.other).map(m=>m.label)],items=rest.filter(m=>m.other).map(m=>m.label);
 const list=(names,n)=>names.slice(0,n).map(x=>`<strong>${esc(x)}</strong>`).join(' - ')+(names.length>n?` 외 ${names.length-n}개`:'');
 // With two or more medicines the other items go on a second line; otherwise everything is named in one line.
 const split=main.length>=2,names=split?main:[...main,...items];
 if(!names.length)return '';
 return `<p class="explorer-lead">${list(names,cap)}의 관계에 대한 설명입니다.${split&&items.length?`<span class="explorer-lead-items">함께 든 항목: ${items.slice(0,3).map(esc).join(', ')}${items.length>3?` 외 ${items.length-3}개`:''}</span>`:''}</p>`;
}
// A chosen entity's evidence: the source records of the relations it belongs to, each once, the ones backing more of those
// relations first, behind "근거 자료 n건 ▼"; once open, the first five show and the rest wait behind "더 보기".
function nodeSources(edges,graph,open=5){
 const byId=new Map();
 for(const e of edges)for(const r of edgeSources(e,graph)){if(!byId.has(r.id))byId.set(r.id,{r,n:0});byId.get(r.id).n++;}
 const rows=[...byId.values()].sort((a,b)=>b.n-a.n),card=({r,n})=>sourceArticle(r,n>1?`이 개체가 든 관계 ${n}개의 근거입니다.`:'');
 if(!rows.length)return '<h4>근거 자료 <span class="xp-count">0건</span></h4><p>이 개체가 든 관계에 연결된 원문이 없습니다.</p>';
 return `<details class="xp-sources"><summary><h4>근거 자료 <span class="xp-count">${rows.length}건</span></h4><span class="xp-caret" aria-hidden="true"></span></summary><p class="hint">이 개체가 든 관계의 원문입니다.</p>${rows.slice(0,open).map(card).join('')}${rows.length>open?`<details class="explorer-fold"><summary>근거 자료 ${rows.length-open}건 더 보기</summary>${rows.slice(open).map(card).join('')}</details>`:''}</details>`;
}
export function explorerHTML(graph,selection,drugs=[]){
 if(!graph)return '<div class="explorer-empty"><h3>연결의 이유를 살펴보세요</h3><p>질문에 답변한 뒤 관계 지도·연결 흐름·관계 표의 노드 또는 관계를 누르면 여기에 연결 설명과 실제 출처가 표시됩니다.</p></div>';
 if(!selection)return '<div class="explorer-empty"><h3>어떤 연결이 궁금하신가요?</h3><p>시각화에서 약이나 관계를 누르면 여기에 설명과 원문이 나옵니다.</p></div>';
 if(selection.kind==='node'){
  const ids=selection.ids||[selection.id],nodes=graph.nodes.filter(n=>ids.includes(n.id)),linked=nodeConnections(graph,ids);
  return `<header class="xp-head"><span class="badge">선택한 개체 · ${esc(nodes[0]?.type||'유형 미제공')}</span><h3>${esc(selection.name||nodes[0]?.label||selection.id)}</h3></header><h4>개체 설명</h4>${nodes.map(n=>`<p>${esc(excerpt(n.description)||'DB에 개체 설명이 없습니다.')}</p>`).join('')}<details class="node-description"><summary>DB 개체 설명 전체 보기</summary>${nodes.map(n=>paragraphs(n.description)).join('')||'<p>설명 미제공</p>'}</details><p class="hint">개체 설명은 DB 추출문입니다. 아래 원문과 함께 확인하세요.</p>${nodeSources(linked.edges,graph)}<h4>어떻게 연결되어 있나요?</h4><p>이 개체는 현재 질문과 관련된 관계 ${linked.edges.length}개에 포함되어, 다른 개체 ${linked.nodes.length}개와 연결됩니다. 연결은 원문에서 추출한 관계 레코드의 공동 구성원이라는 뜻이며, 모두 직접적인 약물 상호작용이라는 뜻은 아닙니다.</p><h4>연결된 개체</h4><div class="explorer-nodes">${linked.nodes.map(n=>`<article class="explorer-neighbour">${nodeButton(n)}<p class="hint">${esc(excerpt(n.description||'DB에 개체 설명이 없습니다.',120))}</p></article>`).join('')||'<p>연결된 개체가 없습니다.</p>'}</div><h4>연결 관계와 설명</h4>${linked.edges.map(e=>`<article class="explorer-relation">${edgeButton(e)}${longDescription(e,edgeSources(e,graph),{list:false})}<details class="explorer-fold"><summary>추출 태그 해설</summary>${tagsHTML(e)}</details></article>`).join('')}`;
 }
 // A 점·선 box holding same-named relations (×n): the summary first, then each relation with its own sources.
 if(selection.kind==='group'){
  const edges=(selection.ids||[]).map(id=>graph.hyperedges.find(e=>e.id===id)).filter(Boolean);if(!edges.length)return explorerHTML(graph,null);
  const unique=new Set(edges.flatMap(e=>edgeSources(e,graph).map(r=>r.id)));
  return `<header class="xp-head"><span class="badge">묶은 관계 · ${edges.length}개</span>${relationLead(edges,graph,drugs)}<h3>${esc(edges[0].label)}</h3></header><h4>한눈에 보기</h4><p class="explorer-takeaway">이름이 같고 이어진 질문 약도 같은 관계 ${edges.length}개를 연결 흐름에서 한 상자로 묶었습니다. 관계마다 설명과 원문이 다를 수 있어 관계별로 따로 보여 줍니다.</p><div class="xp-sec-head"><h4>관계별 설명과 근거 자료 <span class="xp-count">${unique.size}건</span></h4>${citeGuide}</div>${edges.map(e=>{const rows=edgeSources(e,graph);return `<article class="explorer-relation">${edgeButton(e)}${longDescription(e,rows)}${sourceList(rows,'이 관계에 연결된 원문이 없습니다.','h5')}</article>`;}).join('')}<p class="hint">이름이 같다는 것은 DB가 붙인 추출 주제가 같다는 뜻이며, 같은 원문이나 같은 내용이라는 뜻은 아닙니다. 관계 이름을 누르면 그 관계 하나만 봅니다.</p>`;
 }
 const edge=graph.hyperedges.find(e=>e.id===selection.id);if(!edge)return explorerHTML(graph,null);
 const rows=edgeSources(edge,graph);
 // Order: the chosen relation, its explanation (each sentence ending in its source number), then its source records
 // behind "근거 자료 n건 ▼" (excerpt or whole record each).
 const head=`<header class="xp-head"><span class="badge">선택한 관계</span>${relationLead([edge],graph,drugs)}<h3>${esc(edge.label)}</h3></header>`;
 const glance=`<section class="xp-sec"><div class="xp-sec-head"><h4>한눈에 보는 관계</h4>${citeGuide}</div>${longDescription(edge,rows)}</section>`;
 const sources=`<section class="xp-sec">${sourceList(rows,'이 관계에 연결된 원문이 없습니다. 다른 검색 문서를 출처로 대신 붙이지 않습니다.')}</section>`;
 return head+glance+sources;
}
