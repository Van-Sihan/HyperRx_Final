import {Graph} from '@antv/g6';
import {sphereView,hull,distanceToShape} from './sphere.js';
import {evidenceTarget} from './evidence-state.js';
import {entityColors,SHARED_CORE} from './colors.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const names={llm:'LLM',rag:'RAG',hyperrag:'HyperRAG'},colors={llm:'#728096',rag:'#b47b26',hyperrag:'#4a78d0'};
const palette=['#F6BD16','#00C9C9','#F08F56','#D580FF','#FF3D00','#16f69c','#004ac9','#f056d1','#a680ff','#c8ff00'];
let results={},question='',runDemo=true,graph=null,currentGraph=null,controllers=new Map(),generation=0,hasRun=false;
let dimension='2d',selectedEdges=[],fullGraph=null,evidenceMode='hyperrag',evidencePreference='auto',shownEvidenceResult=null,lastSelected=new Set(['hyperrag']);
const prefer=values=>values.includes('hyperrag')?'hyperrag':values.includes('rag')?'rag':values[0];
const selected=()=>$$('.menu input:checked').map(e=>e.value);
const tip=Object.assign(document.createElement('div'),{id:'graph-tip',hidden:true});tip.setAttribute('role','tooltip');document.body.append(tip);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function theme(){const mode=$('#theme').value;document.body.classList.toggle('dark',mode==='dark');document.body.classList.toggle('light',mode==='light');localStorage.setItem('galyaksi-theme',mode);if(currentGraph)renderGraphView();}
$('#theme').value=localStorage.getItem('galyaksi-theme')||'default';document.body.classList.add('home');theme();$('#theme').onchange=theme;
function updateSelection(){
 const values=selected(),added=values.filter(m=>!lastSelected.has(m));lastSelected=new Set(values);
 $('#mode-label').textContent=values.length===1?names[values[0]]:`${values.length}개 선택`;$('#run-selected').hidden=!hasRun;
 for(const [mode,controller] of controllers){if(!values.includes(mode)){controllers.delete(mode);controller.abort();if(results[mode]?.pending)delete results[mode];}}
 if(!hasRun){renderAnswers();return;}
 if(evidencePreference!=='auto'&&!values.includes(evidencePreference))evidencePreference='auto';
 const needed=values.filter(m=>!results[m]||results[m].cancelled||(added.includes(m)&&results[m].error));
 renderAnswers();execute(needed);refreshEvidence();
}
function refreshEvidence(){
 if(!hasRun)return;
 evidenceMode=evidenceTarget(selected(),evidencePreference);
 syncEvidenceSelector();
 const result=results[evidenceMode];
 if(result&&!result.pending&&!result.error){if(result!==shownEvidenceResult)showEvidence(evidenceMode);return;}
 shownEvidenceResult=null;currentGraph=null;fullGraph=null;selectedEdges=[];$('#evidence-guide').hidden=evidenceMode!=='hyperrag';$('#inspector').classList.remove('provenance-inspector');
 $('#edge-picker').innerHTML='';$('#reset-edge').hidden=true;$('#focus-label').hidden=true;
 const message=!evidenceMode?'검색 근거를 보려면 RAG 또는 HyperRAG를 선택하세요. LLM 답변은 위 카드에서 확인할 수 있습니다.':result?.error?'선택한 근거 방식의 답변을 완료하지 못했습니다. 다시 실행해 주세요.':`${names[evidenceMode]} 근거를 불러오는 중입니다. LLM·RAG 답변이 먼저 완료되어도 이 근거 화면은 유지됩니다.`;
 clearGraph(message);$('#documents-panel').textContent=message;$('#relations-panel').textContent=message;$('#inspector').innerHTML=evidenceMode?'<h3>선택한 방식의 근거를 기다립니다</h3>':'<h3>검색 방식 선택</h3><p>HyperRAG를 선택하면 관계와 원문 출처를 함께 살펴볼 수 있습니다.</p>';
 $('#graph-meta').textContent=evidenceMode?`${names[evidenceMode]} · ${result?.error?'확인 필요':'실행 중'}`:'검색 방식 미선택';
}
$$('.menu input').forEach(e=>e.onchange=()=>{if(!selected().length){e.checked=true;$('#notice').textContent='최소 한 가지 답변 방식을 선택해 주세요.';}updateSelection();});
$('#select-all').onclick=()=>{$$('.menu input').forEach(e=>e.checked=true);updateSelection();};
// Color rules: verdict badges carry risk only (red 금기, orange 주의, gray 근거 부족, plum 상충, outline 설명/미확인); citation chips use the link blue; mode colors stay on card borders.
const verdictClass={'금기':'contra','주의':'caution','근거 부족':'insufficient','상충':'conflict','설명':'info','분류 미확인':'unknown','화면 예시':'demo'};
const verdictHelp={'금기':'자료상 함께 쓰거나 해당 조건에 쓰면 안 된다고 판단했습니다.','주의':'조건에 따라 주의가 필요하다고 판단했습니다.','근거 부족':'현재 자료만으로는 판단할 수 없습니다. 안전하다는 뜻이 아닙니다.','상충':'자료끼리 내용이 엇갈립니다.','설명':'금기 여부 판단이 아닌 일반 설명입니다.','분류 미확인':'모델이 정해진 판단 값을 반환하지 않았습니다.','화면 예시':'예시 체험 화면이며 판단하지 않습니다.'};
function verdictBadge(r,mode){
 const v=verdictClass[r.assessment]?r.assessment:'분류 미확인',label=v==='화면 예시'?'예시':v;
 return `<span class="verdict verdict-${verdictClass[v]}" title="${esc(verdictHelp[v])}">판단: ${esc(label)}${mode==='llm'&&!r.demo?' · 근거 미검증':''}</span>`;
}
// Escapes first, then turns validated markers into buttons. Only refs returned by the server become links.
function withCitations(text,r,mode){
 const byRef=new Map((r.citations||[]).map(c=>[c.ref,c]));
 return esc(text).replace(/\[(S\d+)(?:\.\d+)?\]/g,(m,ref)=>{const c=byRef.get(ref);return c?`<button type="button" class="cite" data-cite-mode="${mode}" data-ref="${ref}" title="${esc(c.title)}" aria-label="근거 ${ref.slice(1)}번: ${esc(c.title)}">${ref.slice(1)}</button>`:m;})
  .replace(/\[근거 없음\]/g,'<span class="cite-none" title="제공된 자료로 뒷받침되지 않는다고 모델이 표시한 문장입니다.">근거 없음</span>')
  .replace(/\[인용 확인 불가\]/g,'<span class="cite-invalid" title="제공하지 않은 자료 번호를 모델이 적어서 제거했습니다.">인용 확인 불가</span>');
}
function citationSummary(r){
 const s=r.citationStats;if(!s||!s.sentences)return '';
 return `<p class="cite-stats" title="모델이 문장마다 붙인 표시를 센 값입니다. 내용이 원문으로 뒷받침되는지는 원문을 열어 확인하세요.">근거 번호 문장 ${s.cited}/${s.sentences} · 근거 없음 ${s.uncited}${s.unmarked?` · 표시 없음 ${s.unmarked}`:''}${s.invalidRefs?` · 잘못된 번호 ${s.invalidRefs}개 제거`:''}</p>`;
}
function renderAnswers(){
 $('#answers').style.setProperty('--columns',selected().length);
 $('#answers').innerHTML=selected().map(mode=>{
  const r=results[mode];let content;
  if(!r)content='<p class="headline">선택한 방식으로 답변을 받아보세요.</p><p class="meta">상단의 선택한 방식 실행 버튼을 눌러 주세요.</p>';
  else if(r.pending)content='<p class="headline loading">답변을 준비하고 있습니다…</p><p class="meta">검색과 생성이 끝나면 핵심 한 줄을 먼저 보여드립니다.</p>';
  else if(r.error)content=`<p class="headline">${r.cancelled?'생성을 중지했습니다.':'답변을 완료하지 못했습니다.'}</p><p>${esc(r.error)}</p><button data-retry="${mode}">다시 실행</button>`;
  else content=`${verdictBadge(r,mode)}<p class="headline">${withCitations(r.headline,r,mode)}</p>${citationSummary(r)}<details class="answer-detail"><summary>상세보기</summary><p class="detail">${withCitations(r.details,r,mode)}</p>${r.citations?.length?'<p class="cite-note">숫자를 누르면 그 문장의 근거로 든 원문이 열립니다. 번호는 모델이 붙인 표시이므로, 내용이 실제로 뒷받침되는지는 원문으로 확인하세요.</p>':''}${r.originalAnswer?`<details><summary>원저자 엔진 답변 원문</summary><p class="detail">${esc(r.originalAnswer)}</p></details>`:''}</details><div class="meta">${esc(r.model)} · ${(r.elapsed/1000).toFixed(1)}초<br>${esc(r.notice||'화면 확인용 예시 · 의료 답변 아님')}</div>${mode==='llm'?'<p class="llm-search-note">검색 미사용 · 근거탐색은 RAG / HyperRAG에서 제공됩니다.</p>':`<button class="source-button" data-source="${mode}">근거 보기 ↗ · 문서 ${r.documents.length} · 관계 ${r.graph.hyperedges.length}</button>`}`;
  return `<article class="answer ${mode}" style="--accent:${colors[mode]}"><div class="answer-top"><strong>${names[mode]}</strong><span class="badge">${r?.pending?'실행 중':r?.demo?'예시 체험':r?.error?'확인 필요':r?'생성 완료':'대기'}</span></div>${content}</article>`;
 }).join('');
 $$('[data-retry]').forEach(e=>e.onclick=()=>execute([e.dataset.retry]));$$('[data-source]').forEach(e=>e.onclick=()=>{evidencePreference=e.dataset.source;refreshEvidence();});
 $$('[data-ref]').forEach(e=>e.onclick=()=>openCitation(e.dataset.citeMode,e.dataset.ref));
 $('#cancel').hidden=controllers.size===0;
}
function openCitation(mode,ref){
 const r=results[mode],c=r?.citations?.find(x=>x.ref===ref);if(!c)return;
 const doc=r.documents?.find(d=>d.id===c.id);
 openSource(c.id,doc?{id:doc.id,title:doc.title,source_label:doc.sourceLabel,content:doc.content,source_url:doc.url,record_id:doc.recordId}:null,ref);
}
async function execute(modes){
 const gen=generation;
 await Promise.all(modes.map(async mode=>{
  if(controllers.has(mode))return;
  const controller=new AbortController();controllers.set(mode,controller);results[mode]={pending:true};renderAnswers();
  const current=()=>gen===generation&&controllers.get(mode)===controller;
  try{const response=await fetch('/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,mode,demo:runDemo,...(runDemo?{demoScale:$('#demo-scale').value}:{})}),signal:controller.signal});const r=await response.json();if(!current())return;results[mode]=response.ok?r:{error:r.error};}
  catch(e){if(!current())return;results[mode]={error:e.name==='AbortError'?'다시 실행할 수 있습니다.':'로컬 서버 연결을 확인해 주세요.',cancelled:e.name==='AbortError'};}
  finally{if(current()){controllers.delete(mode);renderAnswers();refreshEvidence();}}
 }));
}
function cancel(){for(const c of controllers.values())c.abort();}
$('#cancel').onclick=cancel;
function submit(){const q=$('#question').value.trim();if(!q)return;syncDemoScale();cancel();controllers=new Map();generation++;results={};question=q;runDemo=$('#execution').value==='demo';hasRun=true;evidencePreference='auto';evidenceMode=evidenceTarget(selected());shownEvidenceResult=null;document.body.classList.remove('home');$('#welcome').hidden=true;$('#suggestions').hidden=true;$('#workspace').hidden=false;$('#mode-menu').open=true;$('#submitted-question').textContent=q;$('#question-summary').hidden=false;document.body.classList.remove('editing');window.scrollTo({top:0,behavior:'instant'});$('#notice').textContent=runDemo?'예시 체험 중 · 모든 답변과 관계는 가상 예시이며 API 비용이 발생하지 않습니다.':'실제 연결 · 선택한 방식별로 검색·생성 API를 호출합니다.';$('#run-selected').hidden=false;clearGraph();currentGraph=null;fullGraph=null;selectedEdges=[];$('#inspector').innerHTML='<h3>근거를 기다리고 있습니다</h3>';execute(selected());refreshEvidence();}
$('#question-form').onsubmit=e=>{e.preventDefault();submit();};$('#question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#question-form').requestSubmit();}};
$('#run-selected').onclick=()=>{if($('#question').value.trim()!==question||($('#execution').value==='demo')!==runDemo)submit();else execute(selected().filter(m=>!results[m]||results[m].error));};
$$('#suggestions button').forEach((e,i)=>e.onclick=()=>{$('#question').value=e.textContent;if(i===1)$('#select-all').click();submit();});
$('#expand-all').onclick=()=>{const open=$$('.answer-detail').some(e=>!e.open);$$('.answer-detail').forEach(e=>e.open=open);$('#expand-all').textContent=open?'모든 상세 접기':'모든 상세 보기';};
function tab(name){$$('[data-tab]').forEach(e=>e.classList.toggle('active',e.dataset.tab===name));for(const n of ['graph','documents','relations'])$(`#${n}-panel`).hidden=n!==name;if(name==='graph'&&currentGraph)requestAnimationFrame(()=>{graph?.resize();graph?.fitView();});}
$$('[data-tab]').forEach(e=>e.onclick=()=>tab(e.dataset.tab));
function provenanceLabel(edge){const p=edge.provenance||{};return p.status==='demo'?'가상 문서':p.status==='linked'?`원문 ${p.resolved_count}건 연결`:p.status==='partial'?`원문 일부 연결 · ${p.resolved_count}/${p.source_count}건`:'원문 연결 확인 필요';}
function sourceCard(edge,doc){
 const span=edge.sourceSpans?.find(x=>x.id===doc.id),quote=span?.excerpt??doc.excerpt,matched=span?.matched_members||doc.matchedMembers||[];
 return `<article class="edge-source"><span class="badge">${esc(doc.sourceLabel||'로컬 원문')}</span><h4>${esc(doc.title)}</h4><blockquote>${esc(quote||'미리보기 없음')}</blockquote><p class="source-location">원문 인용${Number.isFinite(span?.excerpt_start??doc.excerptStart)?` · ${(span?.excerpt_start??doc.excerptStart)+1}–${span?.excerpt_end??doc.excerptEnd}자`:''}</p><p class="source-match">동일 표기 확인: ${matched.length?matched.map(esc).join(' · '):'번역·약어 등 원문 표기 대조 필요'}</p><button data-open-document="${esc(doc.id)}">원문 전체 보기 ↗</button>${doc.url?` <a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">외부 출처 ↗</a>`:''}${doc.recordId?`<details class="source-metadata"><summary>자료 식별 정보</summary><p>${esc(doc.recordId)}</p></details>`:''}</article>`;
}
// Relation buttons, map areas and the relation list toggle a relation in or out of the selection; several can be shown together.
function toggleEdge(edge){if(!edge)return;const i=selectedEdges.findIndex(e=>e.id===edge.id);if(i>=0)selectedEdges.splice(i,1);else selectedEdges.push(edge);tab('graph');renderGraphView();const last=selectedEdges.at(-1);if(last)showEdgeDetails(last);else showOverview();}
// From an entity's panel: add the relation (never removes it) and show its details.
function selectEdge(edge){if(!edge)return;if(!selectedEdges.some(e=>e.id===edge.id))selectedEdges.push(edge);tab('graph');renderGraphView();showEdgeDetails(edge);}
function showOverview(){$('#inspector').classList.remove('provenance-inspector');$('#inspector').innerHTML='<h3>전체 관계</h3><p>관계 버튼이나 색 영역을 누르면 그 관계만 보입니다. 다시 누르면 해제되고, 여러 개를 함께 고를 수 있습니다.</p>';}
function showEdgeDetails(edge){
 const source=fullGraph||currentGraph,docs=(source.evidenceDocuments||[]).filter(d=>edge.sourceIds?.includes(d.id)),p=edge.provenance||{},demo=p.method==='demo';
 const spans=edge.sourceSpans||[],matched=new Set(spans.length?spans.flatMap(s=>s.matched_members||[]):docs.flatMap(d=>d.matchedMembers||[]));
 $('#inspector').classList.add('provenance-inspector');
 $('#inspector').innerHTML=`${selectedEdges.length>1?`<p class="selection-note">선택한 관계 ${selectedEdges.length}개 중 마지막으로 고른 관계입니다.</p>`:''}<span class="badge provenance-status ${esc(p.status||'unresolved')}">${esc(provenanceLabel(edge))}</span><h3>${esc(edge.label)}</h3>
 <div class="evidence-flow" aria-label="관계 생성 경로"><span>원문 <b>${docs.length}</b>건</span><i>→</i><span>${demo?'가상 관계':'DB 관계 추출·병합'}</span><i>→</i><span>개체 <b>${edge.members.length}</b>개</span></div>
 <div class="source-origin"><strong>이 관계의 출처</strong>${docs.length?docs.slice(0,3).map(d=>`<button data-open-document="${esc(d.id)}">${esc(d.title)} ↗</button>`).join(''):'<p>원문 연결 확인 필요</p>'}${docs.length>3?`<small>외 ${docs.length-3}건 · 아래 출처 목록 참조</small>`:''}</div>
 <p class="extraction-note">${demo?'화면 체험을 위해 만든 가상 관계입니다.': 'DB 구축 시 자동 추출된 관계입니다. 아래 설명·태그를 원문 인용과 비교해 확인하세요. 색은 관계를 구분하며, 구성원 수는 약물 수와 다를 수 있습니다.'}</p>
 <h4>이 개체들이 묶인 이유</h4><p>DB의 하나의 관계 레코드에 아래 개체들이 함께 저장되어 있습니다. 연결 근거는 이 관계의 원문 참조이며, 화면의 거리나 색으로 관계를 만들지 않습니다.</p><h4>연결된 개체</h4><div class="members">${edge.members.map(id=>`<span class="${matched.has(id)?'literal-match':''}" title="${matched.has(id)?'연결된 원문에서 동일 표기 확인':'원문 표기 대조 필요'}">${esc(source.nodes.find(n=>n.id===id)?.label||id)}</span>`).join('')}</div>
 <p class="source-location">강조된 개체는 원문에서 같은 표기를 확인했습니다. 번역·별칭·의미 관계는 원문 대조가 필요합니다.</p>
 <h4>${demo?'가상 설명':'관계를 설명하는 DB 추출문'}</h4><p class="source-location">${demo?'가상 예시입니다.':'아래 문장은 원문을 자동 추출·요약한 결과입니다. 원문 인용과 구분해 표시하며, 모든 문장이 검증되었다는 뜻은 아닙니다.'}</p>${parts(edge.description).map(t=>`<p class="extracted-description">${esc(t)}</p>`).join('')||'<p class="extracted-description">설명 미제공</p>'}
 <h4>원문 분류</h4><div class="evidence-tags source-classification">${[...new Set(docs.map(d=>d.category||d.sourceLabel).filter(Boolean))].map(t=>`<span>${esc(t)}</span>`).join('')||'<span>원문 분류 확인 필요</span>'}</div><h4>${demo?'예시 태그':'DB 추출 태그'}</h4><div class="evidence-tags">${(edge.tags||[]).length?edge.tags.map(t=>`<span>${esc(t)}</span>`).join(''):'<span>추출 태그 없음</span>'}</div>
 <h4>개체별 원문 대조</h4>${memberEvidence(edge,docs,source)}<h4>출처와 원문 인용</h4>${docs.length?docs.slice(0,3).map(d=>sourceCard(edge,d)).join('')+(docs.length>3?`<details class="more-sources"><summary>다른 출처 ${docs.length-3}건 보기</summary>${docs.slice(3).map(d=>sourceCard(edge,d)).join('')}</details>`:''):'<p class="unlinked-source">이 관계의 원문을 연결하지 못했습니다. 질문 검색 문서를 관계의 출처로 대신 연결하지 않습니다.</p>'}
 ${p.missing_ids?.length?`<p class="unlinked-source">DB에 기록된 원문 ${p.missing_ids.length}건을 찾지 못했습니다.</p>`:''}
 <details class="source-metadata"><summary>관계 생성 정보</summary><p>생성 방식: ${demo?'가상 데이터':'사전 구축 DB의 자동추출·병합'}<br>DB 버전: ${esc(p.database||'예시')}<br>연결 원문: ${p.resolved_count||0} / ${p.source_count||0}건${edge.weight!=null?`<br>DB 가중치: ${esc(edge.weight)} · 임상 위험도나 신뢰도 점수가 아닙니다.`:''}</p><a href="https://github.com/iMoonLab/Hyper-RAG/blob/main/web-ui/backend/db.py" target="_blank" rel="noopener noreferrer">원저자 관계 상세 조회 코드 ↗</a></details>`;
 bindSourceButtons($('#inspector'));
}
let drawing=0,renderQueue=Promise.resolve();
function clearGraph(message=''){const ticket=++drawing;renderQueue=renderQueue.catch(()=>{}).then(()=>{if(ticket!==drawing)return;try{graph?.destroy();}catch{}graph=null;$('#graph').innerHTML=message?`<div class="empty">${esc(message)}</div>`:'';});}
function drawGraph(data){const ticket=++drawing;renderQueue=renderQueue.catch(()=>{}).then(()=>{if(ticket!==drawing)return;return drawGraphNow(data,ticket);});return renderQueue;}
async function drawGraphNow(data,ticket){
 try{graph?.destroy();}catch{}graph=null;hideTip();$('#graph').innerHTML='';$('#graph').onclick=null;$('#graph').onpointerdown=null;currentGraph=data;
 if(!data.nodes.length){$('#graph').innerHTML='<div class="empty">이 답변에는 검색된 하이퍼그래프가 없습니다.<br>HyperRAG를 선택해 실행해 주세요.</div>';return;}
 const dark=document.body.classList.contains('dark'),nodeColors=entityColors(data,palette);
 if(dimension==='3d'){graph=sphereView($('#graph'),data,{palette,dark,labels:$('#show-labels').checked,onSelect:toggleEdge,onSelectNode:node=>inspectNode(node.id,fullGraph||data),onHover:(hit,x,y)=>hit?showTip(hit.kind==='node'?nodeTip(hit.node,fullGraph||data):edgeTip(hit.edge,fullGraph||data,hit.overlap),x,y):hideTip()});return;}
 try{
  graph=new Graph({container:'graph',height:470,autoResize:true,data:{nodes:data.nodes.map(n=>({id:n.id,data:{label:n.label}})),edges:[]},node:{type:d=>(nodeColors.get(d.id)||[]).length>1?'donut':'circle',style:{size:d=>(nodeColors.get(d.id)||[]).length>1?20:16,innerR:'50%',donuts:d=>(nodeColors.get(d.id)||[]).map(color=>({value:1,color})),labelText:d=>$('#show-labels').checked?d.data.label:'',labelFontSize:10,labelFill:dark?'#e8eef7':'#506078',fill:d=>{const c=nodeColors.get(d.id)||[];return c.length===1?c[0]:dark?SHARED_CORE.dark:SHARED_CORE.light;}},state:{selected:{lineWidth:3,stroke:'#245FCB',size:22}}},layout:{type:'force-atlas2',preventOverlap:true,kr:80,gravity:20},behaviors:['zoom-canvas','drag-canvas','drag-element'],autoFit:'view',animate:false,plugins:data.hyperedges.map((e,i)=>({key:e.id,type:'bubble-sets',members:e.members,fill:palette[(e.colorIndex??i)%palette.length],stroke:palette[(e.colorIndex??i)%palette.length],fillOpacity:.18,strokeOpacity:.12,maxRoutingIterations:100,maxMarchingIterations:20,pixelGroup:4,edgeR0:10,edgeR1:60,nodeR0:15,nodeR1:50,morphBuffer:10,threshold:4,memberInfluenceFactor:1,edgeInfluenceFactor:4,nonMemberInfluenceFactor:-.8,virtualEdges:true}))});
  graph.on('node:click',e=>inspectNode(e.target.id,fullGraph||data));
  const ownedGraph=graph;await ownedGraph.render();if(ticket===drawing)await ownedGraph.fitView();
  let pointerStart=null,pressed=false,frame=0;
  $('#graph').onpointerdown=e=>{pointerStart=[e.clientX,e.clientY];pressed=true;hideTip();};
  $('#graph').onpointerup=()=>{pressed=false;};
  $('#graph').onpointerleave=()=>{pressed=false;hideTip();};
  $('#graph').onpointermove=e=>{if(pressed||frame)return;const x=e.clientX,y=e.clientY;frame=requestAnimationFrame(()=>{frame=0;if(graph!==ownedGraph)return;const hit=graphHit(ownedGraph,data,x,y);$('#graph').style.cursor=hit?'pointer':'';if(!hit)return hideTip();showTip(hit.kind==='node'?nodeTip(hit.node,fullGraph||data):edgeTip(hit.edge,fullGraph||data,hit.overlap),x,y);});};
  $('#graph').onclick=e=>{if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;const hit=graphHit(graph,data,e.clientX,e.clientY);if(hit?.kind==='node')inspectNode(hit.node.id,fullGraph||data);else if(hit)toggleEdge(hit.edge);};
 }catch(e){if(ticket!==drawing)return;$('#graph').innerHTML='<div class="empty">그래프를 표시하지 못했습니다.<br>관계 목록에서 동일한 데이터를 확인할 수 있습니다.</div>';console.error(e);}
}
function showEvidence(mode){
 if(mode==='llm')return;
 const r=results[mode];if(!r||r.error||r.pending)return;evidenceMode=mode;shownEvidenceResult=r;$('#inspector').classList.remove('provenance-inspector');
 $('#graph-meta').textContent=`${names[mode]} ${r.demo?'· 가상 예시':''} · 개체 ${r.graph.nodes.length} · 하이퍼엣지 ${r.graph.hyperedges.length}${mode==='hyperrag'?` · 원문 연결 ${r.graph.hyperedges.filter(e=>e.provenance?.resolved_count>0).length}/${r.graph.hyperedges.length}`:''}`;
 $('#evidence-guide').hidden=mode!=='hyperrag';
 $('#documents-panel').innerHTML=r.documents.length?(r.retrieval?.strategy==='exact-medication-anchor'?`<p class="retrieval-note">질문에 나온 약명을 확인해 직접 언급된 문서 ${r.documents.length}건을 표시합니다. 자료 범위는 각 문서에서 확인하세요.</p>`:'')+r.documents.map(d=>`<article class="document">${d.sourceLabel?`<span class="badge">${esc(d.sourceLabel)}</span>`:''}<h3>${esc(d.title)}</h3><p>${esc(d.content)}</p>${d.recordId?`<details class="source-metadata"><summary>자료 식별 정보</summary><p>내부 관리번호: <code>${esc(d.recordId)}</code></p></details>`:''}${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>`:''}</article>`).join(''):`<div class="empty">${mode==='llm'?'LLM 단독은 검색을 사용하지 않습니다.':'검색 엔진에서 문서 본문을 반환하지 않았습니다. 출처를 확인할 수 없습니다.'}</div>`;
 $('#relations-panel').innerHTML=r.graph.hyperedges.length?r.graph.hyperedges.map(e=>`<button class="relation" data-edge="${esc(e.id)}">${esc(e.label)} <small>· 구성원 ${e.members.length}개 · ${esc(provenanceLabel(e))}</small></button>`).join(''):'<div class="empty">반환된 관계가 없습니다.</div>';
 fullGraph=r.graph;selectedEdges=[];currentGraph=r.graph;$('#inspector').innerHTML='<span class="badge">관계 상세</span><h3>연결을 선택해 보세요</h3><p>지도 위 노드 또는 관계 목록을 선택하면 구성원과 설명을 볼 수 있습니다.</p>';
 $$('[data-edge]').forEach(e=>e.onclick=()=>toggleEdge(r.graph.hyperedges.find(x=>x.id===e.dataset.edge)));
 tab(mode==='hyperrag'?'graph':'documents');renderGraphView();
}
$('#fit').onclick=()=>graph?.fitView();$('#zoom-in').onclick=()=>graph?.zoomBy(1.25);$('#zoom-out').onclick=()=>graph?.zoomBy(.8);
$('#settings').onclick=async()=>{try{const r=await(await fetch('/api/status')).json();$('#status-content').innerHTML=`<div class="status-row">OpenAI API <b>${r.openai?'설정됨':'키 미설정'}</b></div><div class="status-row">검색 백엔드 <b>${r.db?.ready?`연결됨 · 문서 ${r.db.documents.toLocaleString()}건`:r.backend?'주소 설정됨 · DB 서버 확인 필요':'미설정'}</b></div><div class="status-row">모델 <b>${esc(r.model)}</b></div>`;}catch{$('#status-content').textContent='로컬 서버에 연결할 수 없습니다.';}$('#status-dialog').showModal();};$('#close-dialog').onclick=()=>$('#status-dialog').close();
async function boot(){try{const status=await(await fetch('/api/status')).json();if(status.openai&&status.db?.ready){$('#execution').value='live';syncDemoScale();$('#notice').textContent=`팀 DB 연결됨 · 문서 ${status.db.documents.toLocaleString()}건 · 실제 답변 모드`;}}catch{} const carried=sessionStorage.getItem('galyaksi-question');if(carried){sessionStorage.removeItem('galyaksi-question');$('#question').value=carried;submit();}} boot();

function renderGraphView(){
 const source=fullGraph||currentGraph;if(!source)return;
 const chosen=new Set(selectedEdges.map(e=>e.id));
 const data=chosen.size?{nodes:source.nodes.filter(n=>selectedEdges.some(e=>e.members.includes(n.id))),hyperedges:source.hyperedges.filter(e=>chosen.has(e.id))}:source;
 $('#reset-edge').hidden=!chosen.size;$('#focus-label').hidden=!chosen.size;
 $('#focus-label').textContent=chosen.size===1?`선택한 관계 · ${selectedEdges[0].label} · 구성원 ${selectedEdges[0].members.length}개 · 버튼을 다시 누르면 해제`:chosen.size?`선택한 관계 ${chosen.size}개 · 개체 ${data.nodes.length}개 · 버튼을 다시 누르면 해제`:'';
 $('#edge-picker').innerHTML=source.hyperedges.map((e,i)=>`<button data-pick="${esc(e.id)}" style="--edge-color:${palette[(e.colorIndex??i)%palette.length]}" aria-pressed="${chosen.has(e.id)}" title="${esc(e.label)}">${i+1}. ${esc(e.label)} · ${esc(provenanceLabel(e))}</button>`).join('');
 $$('[data-pick]').forEach(b=>b.onclick=()=>toggleEdge(source.hyperedges.find(e=>e.id===b.dataset.pick)));
 drawGraph(data);
}
$$('[data-dimension]').forEach(b=>b.onclick=()=>{dimension=b.dataset.dimension;$$('[data-dimension]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderGraphView();});
$('#reset-edge').onclick=()=>{selectedEdges=[];showOverview();renderGraphView();};
$('#show-labels').onchange=renderGraphView;
$('#sidebar-options').append(document.querySelector('.controls'));$('#mode-menu').open=true;
function editQuestion(){document.body.classList.add('editing');$('#hero').hidden=false;$('#question').focus();window.scrollTo({top:0,behavior:'smooth'});}
$('#edit-question').onclick=editQuestion;
function newQuestion(){cancel();generation++;controllers=new Map();results={};hasRun=false;shownEvidenceResult=null;$('#question').value='';document.body.classList.add('home');document.body.classList.remove('editing');$('#welcome').hidden=false;$('#suggestions').hidden=false;$('#question-summary').hidden=true;$('#workspace').hidden=true;$('#run-selected').hidden=true;window.scrollTo({top:0,behavior:'instant'});}
$('#new-question').onclick=newQuestion;
$$('header a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{if(hasRun)newQuestion();}));
$('#try-demo').onclick=()=>{newQuestion();$('#execution').value='demo';$('#question').value='가상 약물 A·B·C의 관계를 보여줘';$('#select-all').click();submit();};
document.body.classList.add('js-reveal');const reveal=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');reveal.unobserve(e.target);}}),{threshold:.12});$$('.reveal').forEach(e=>reveal.observe(e));
let ticking=false;window.addEventListener('scroll',()=>{if(ticking||matchMedia('(prefers-reduced-motion: reduce)').matches)return;ticking=true;requestAnimationFrame(()=>{document.documentElement.style.setProperty('--parallax',`${Math.min(window.scrollY,900)*.2}px`);ticking=false;});},{passive:true});

$('.evidence-meta').insertAdjacentHTML('afterend','<div id="evidence-guide" class="evidence-guide" hidden><b>원문 문서 → DB에서 개체·관계 추출 → 하이퍼엣지</b><p>색 영역이나 관계 버튼을 선택하면 그 관계에 기록된 출처와 원문 인용을 확인할 수 있습니다. 원문 연결 여부와 관계 설명의 정확성은 별도로 확인해야 합니다.</p></div>');
document.body.insertAdjacentHTML('beforeend','<dialog id="source-dialog"><button id="close-source" aria-label="원문 닫기">×</button><div id="source-dialog-body"></div></dialog>');
let sourceLoad=0;const sourceCache=new Map();
$('#close-source').onclick=()=>{sourceLoad++;$('#source-dialog').close();};
function bindSourceButtons(root){root.querySelectorAll('[data-open-document]').forEach(b=>b.onclick=()=>openSource(b.dataset.openDocument));}
async function openSource(id,preloaded=null,ref=null){
 const ticket=++sourceLoad;const dialog=$('#source-dialog');$('#source-dialog-body').innerHTML='<p>원문을 불러오는 중입니다…</p>';if(!dialog.open)dialog.showModal();
 try{
  let d=preloaded||sourceCache.get(id);
  if(!d){if(id==='demo-doc')d={title:'화면 확인용 가상 문서',source_label:'가상 데이터',content:'약물 A·B·C 및 조건을 연결한 UI 예시입니다. 실제 의학 문서가 아닙니다.'};else{const response=await fetch('/api/evidence/'+encodeURIComponent(id));if(!response.ok)throw new Error('원문을 불러오지 못했습니다. DB 서버 연결을 확인해 주세요.');d=await response.json();}sourceCache.set(id,d);}
  if(ticket!==sourceLoad)return;
  const external=typeof d.source_url==='string'&&/^https?:\/\//.test(d.source_url)?d.source_url:null;
  $('#source-dialog-body').innerHTML=`${ref?`<p class="eyebrow">근거 ${esc(ref.slice(1))}번</p>`:''}<span class="badge">${esc(d.source_label||'로컬 원문')}</span><h2>${esc(d.title)}</h2><p class="source-location">DB에 저장된 원문 청크입니다. 외부 원문 주소가 있는 자료는 별도 링크로 표시합니다.</p><pre class="source-fulltext">${esc(d.content||'본문 없음')}</pre>${external?`<a href="${esc(external)}" target="_blank" rel="noopener noreferrer">외부 원문 열기 ↗</a>`:''}${d.record_id?`<details class="source-metadata"><summary>자료 식별 정보</summary><p>${esc(d.record_id)}<br>${esc(d.id||id)}</p></details>`:''}`;
 }catch(error){if(ticket===sourceLoad)$('#source-dialog-body').textContent=error.message;}
}

function syncEvidenceSelector(){
 const selector=$('#evidence-mode');if(!selector)return;
 for(const option of selector.options)option.disabled=option.value!=='auto'&&!selected().includes(option.value);
 selector.value=evidencePreference;
}
$('.evidence-meta').insertAdjacentHTML('beforebegin','<div class="evidence-navigation"><label>근거 기준 <select id="evidence-mode"><option value="auto">자동 · HyperRAG 우선</option><option value="hyperrag">HyperRAG 관계·원문</option><option value="rag">RAG 검색 문서</option></select></label><span>답변 방식을 추가해도 보고 있는 근거는 유지됩니다.</span></div>');
$('#evidence-mode').onchange=()=>{evidencePreference=$('#evidence-mode').value;refreshEvidence();};
syncEvidenceSelector();
function memberEvidence(edge,docs,source){
 return '<div class="member-evidence">'+edge.members.map(id=>{
  const hits=(edge.sourceSpans||[]).flatMap(span=>(span.member_evidence||[]).filter(m=>m.member===id).map(m=>({...m,doc:docs.find(d=>d.id===span.id)})));
  return `<details><summary>${esc(source.nodes.find(n=>n.id===id)?.label||id)} <span class="badge">${hits.length?`원문 표기 ${hits.length}건`:'표기 대조 필요'}</span></summary>${hits.length?hits.map(m=>`<article><strong>${esc(m.doc?.title||'연결 원문')}</strong><blockquote>${esc(m.excerpt)}</blockquote><p class="source-location">원문 ${m.start+1}–${m.end}자 · 동일 표기는 관계의 의미 검증과 별개입니다.</p><button data-open-document="${esc(m.doc?.id||'')}">이 원문 보기 ↗</button></article>`).join(''):'<p>연결 원문에서 같은 표기를 확인하지 못했습니다. 별칭·번역 또는 추출 오류인지 원문을 검토해야 합니다.</p>'}</details>`;
 }).join('')+'</div>';
}

// Hover tooltip for the relation map. Fixed to the viewport so it can float above the cursor without being clipped by the graph panel.
function showTip(html,x,y){tip.innerHTML=html;tip.hidden=false;const r=tip.getBoundingClientRect();const left=Math.max(8,Math.min(x-r.width/2,innerWidth-r.width-8));let top=y-r.height-16;if(top<8)top=Math.min(y+20,innerHeight-r.height-8);tip.style.left=left+'px';tip.style.top=top+'px';}
function hideTip(){tip.hidden=true;}
addEventListener('scroll',hideTip,{passive:true});
const parts=text=>String(text??'').split('<SEP>').map(x=>x.trim()).filter(Boolean);
const clip=(text,n)=>text.length>n?text.slice(0,n).trimEnd()+'…':text;
function descriptionHTML(text,limit){const p=parts(text);return p.length?`<p>${esc(clip(p[0],limit))}</p>${p.length>1?`<small>다른 원문에서 추출된 설명 ${p.length-1}개 더 있음</small>`:''}`:'';}
function nodeTip(node,source){
 const linked=source.hyperedges.filter(e=>e.members.includes(node.id)).length,demo=!!shownEvidenceResult?.demo;
 return `<span class="tip-kind">개체${node.type&&node.type!=='UNKNOWN'?` · ${esc(node.type)}`:''}</span><strong>${esc(node.label||node.id)}</strong>${descriptionHTML(node.description,220)||'<p class="tip-empty">DB에 개체 설명이 없습니다.</p>'}<small>연결된 관계 ${linked}개 · ${demo?'가상 예시':'DB 추출 설명'} · 클릭하면 관계 목록</small>`;
}
function edgeTip(edge,source,overlap=1){
 const index=source.hyperedges.indexOf(edge),color=palette[(edge.colorIndex??index)%palette.length];
 const names=edge.members.map(id=>source.nodes.find(n=>n.id===id)?.label||id);
 return `<span class="tip-kind tip-edge" style="--edge-color:${color}">관계 ${index+1} · ${esc(provenanceLabel(edge))}</span><strong>${esc(edge.label)}</strong>${descriptionHTML(edge.description,260)||'<p class="tip-empty">관계 설명이 없습니다.</p>'}<small>구성 개체 ${names.length}개: ${esc(clip(names.join(' · '),110))}</small>${overlap>1?`<small>이 위치에 관계 ${overlap}개가 겹쳐 있어 구성원이 가장 적은 관계를 보여 줍니다.</small>`:''}<small>${edge.provenance?.method==='demo'?'가상 예시':'자동 추출 설명'} · 클릭하면 원문 출처</small>`;
}
// Node if the cursor is on a drawn node, otherwise the relation with the fewest members whose area (hull + padding) contains the cursor.
function graphHit(g,data,clientX,clientY){
 if(!g?.getCanvasByClient)return null;
 let point;try{const c=g.getCanvasByClient([clientX,clientY]);point={x:c[0],y:c[1]};}catch{return null;}
 const zoom=g.getZoom?.()||1,pos=new Map();
 for(const n of data.nodes){try{const v=g.getElementPosition(n.id);pos.set(n.id,{x:v[0],y:v[1]});}catch{}}
 const near=data.nodes.map(n=>({n,d:pos.has(n.id)?Math.hypot(pos.get(n.id).x-point.x,pos.get(n.id).y-point.y):Infinity})).filter(x=>x.d<=11+4/zoom).sort((a,b)=>a.d-b.d)[0];
 if(near)return {kind:'node',node:near.n};
 const hits=data.hyperedges.map(edge=>({edge,d:distanceToShape(point,hull(edge.members.map(id=>pos.get(id)).filter(Boolean)))})).filter(x=>x.d<=22).sort((a,b)=>a.edge.members.length-b.edge.members.length||a.d-b.d);
 return hits.length?{kind:'edge',edge:hits[0].edge,overlap:hits.length}:null;
}
function inspectNode(id,source){const node=source.nodes.find(n=>n.id===id);const edges=source.hyperedges.filter(x=>x.members.includes(id));$('#inspector').innerHTML=`<span class="badge">개체 · ${esc(node?.type||'유형 미제공')}</span><h3>${esc(node?.label||id)}</h3>${parts(node?.description).map(t=>`<p>${esc(t)}</p>`).join('')||'<p>DB에 개체 설명이 제공되지 않았습니다.</p>'}<p class="source-location">개체 설명도 DB 추출문입니다. 아래 관계를 선택해 해당 관계의 출처를 대조하세요.</p><p>연결된 관계 ${edges.length}개</p>${edges.map(x=>`<button class="relation" data-inspect="${esc(x.id)}">${esc(x.label)} · ${esc(provenanceLabel(x))}</button>`).join('')}`;$$('[data-inspect]').forEach(b=>b.onclick=()=>selectEdge(edges.find(x=>x.id===b.dataset.inspect)));}
// Demo size only applies to 예시 체험. Changing it re-runs the current demo question with the same answer modes.
function syncDemoScale(){$('#demo-scale-label').hidden=$('#execution').value!=='demo';}
$('#execution').addEventListener('change',syncDemoScale);syncDemoScale();
$('#demo-scale').onchange=()=>{if(hasRun&&runDemo)submit();};
