// ver.chatbot2: chat (left) · relation map (centre) · evidence dashboard (right). RAG or HyperRAG by the drug count set in
// the question bar (src/method-pick.js); the answer is kept in the one slot results.hyperrag either way.
// Derived from chatbot1.js; the shared logic (citations, inspector, tooltips, 2D/3D map, selection) is the same.
import {Graph} from '@antv/g6';
import {focusQuestionGraph,explorerHTML} from './relation-explorer.js';
import {xaiHTML,xaiTarget,xaiNeeds,icon,relationSourcesHTML} from './xai-panel.js';
import {nodeHTML,clipSentence} from './node-panel.js';
import {evidenceTarget} from './evidence-state.js';
import {entityColors,SHARED_CORE,relationColor} from './colors.js';
import {aliasGroups,aliasesFor,displayName,foundMedications,keyNodeIds,nodesMatching,norm} from './medications.js';
import {drugSummary} from './network.js';
import {bipartiteView,matrixView,FOLD_OPEN_TEXT,FOLD_OPEN_TITLE} from './hyperviews.js';
import {pairView,drugPairs,pairExplorerHTML} from './pair-view.js';
import {durView,durExplorerHTML} from './dur-view.js';
import {verdictHead,verdictSection,problemSection,labelSection,flagsSection,mechanismSection,basisSection,verdictName} from './clinical-view.js';
import {apaHTML,sourceLine,sourceHeading,originHTML,markPassage,relationSentences,citationRun,citationNumbers} from './sources.js';
import {edgeRows,addEdges,edgeEvidence,edgeSources} from './edge-list.js';
import {watchTerms} from './terms.js';
// 'DUR' on its own is written out as 의약품안전사용서비스(DUR) on every screen, whatever draws it (src/terms.js).
watchTerms();
import {keyStore,keyProblem,maskKey} from './api-keys.js';
// The reader's own API keys (설정 › API 키), kept in this browser only and sent as request headers (src/api-keys.js).
const keys=keyStore();
import {METHOD_NAMES,recommended,reviewMethod,clampCount,countLabel} from './method-pick.js';
// 약물 개수 (slider, 1–3) and whether the reader moved it for this question, the drugs found in it, and the method and
// count of the run being shown.
let drugCount=3,countTouched=false,foundDrugs=[],runMethod='hyperrag',runCount=3,recommendTimer=0,recommendSeq=0;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const names={llm:'LLM',rag:'RAG',hyperrag:'HyperRAG'},colors={llm:'#728096',rag:'#b47b26',hyperrag:'#4a78d0'};
const palette=['#F6BD16','#00C9C9','#F08F56','#D580FF','#FF3D00','#16f69c','#004ac9','#f056d1','#a680ff','#c8ff00'];
let results={},question='',runDemo=true,graph=null,currentGraph=null,controllers=new Map(),generation=0,hasRun=false,savedAnswer=null;
// 2D shows only the relations the answer cited until "더 구체적으로 알아보기" opens the rest (as 점·선 and 행렬 do):
// fold2d = {rest, ids (cited), graph (cited relations and their members)} or null when nothing would fold.
let fold2d=null,open2d=false;
let dimension='2d',selectedEdges=[],fullGraph=null,evidenceMode='hyperrag',evidencePreference='auto',shownEvidenceResult=null,lastSelected=new Set(['hyperrag']);
const prefer=values=>values.includes('hyperrag')?'hyperrag':values.includes('rag')?'rag':values[0];
const selected=()=>['hyperrag'];
const tip=Object.assign(document.createElement('div'),{id:'graph-tip',hidden:true});tip.setAttribute('role','tooltip');document.body.append(tip);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isDark=()=>document.documentElement.dataset.theme==='dark';
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('galyaksi-chatbot-theme',t);}catch{}const b=$('#theme-toggle');b.setAttribute('aria-pressed',String(t==='dark'));b.querySelector('.icon').textContent=t==='dark'?'☀':'☾';b.querySelector('.label').textContent=t==='dark'?'라이트 모드':'다크 모드';$$('[data-theme-choice]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.themeChoice===t)));if(currentGraph)renderGraphView(true);}
$('#theme-toggle').onclick=()=>setTheme(isDark()?'light':'dark');
function refreshEvidence(){
 if(!hasRun)return;
 evidenceMode=evidenceTarget(selected(),evidencePreference);
 syncEvidenceSelector();
 const result=results[evidenceMode];
 if(result&&!result.pending&&!result.error){if(result!==shownEvidenceResult)showEvidence(evidenceMode);return;}
 shownEvidenceResult=null;currentGraph=null;fullGraph=null;selectedEdges=[];$('#inspector').classList.remove('provenance-inspector');
 $('#edge-picker').innerHTML='';$('#edge-count').textContent='';$('#reset-edge').hidden=true;$('#map-empty').hidden=true;
 const message=result?.error?'답변을 완료하지 못했습니다. 왼쪽에서 다시 실행해 주세요.':'근거와 관계를 불러오는 중입니다.';
 clearGraph(message);$('#documents-panel').textContent=message;$('#relations-panel').textContent=message;$('#inspector').innerHTML='<p>관계를 불러오면 여기에서 구성원과 출처를 볼 수 있습니다.</p>';
 fold2d=null;open2d=false;
}
// Color rules: verdict badges carry risk only (red 금기, orange 주의, gray 근거 부족, plum 확인 필요, outline 설명/미확인); citation chips use the link blue; mode colors stay on card borders.
const verdictClass={'금기':'contra','주의':'caution','근거 부족':'insufficient','상충':'conflict','설명':'info','분류 미확인':'unknown','화면 예시':'demo'};
const verdictHelp={'금기':'자료상 함께 쓰거나 해당 조건에 쓰면 안 된다고 판단했습니다.','주의':'조건에 따라 주의가 필요하다고 판단했습니다.','근거 부족':'현재 자료만으로는 판단할 수 없습니다. 안전하다는 뜻이 아닙니다.','상충':'자료끼리 내용이 엇갈립니다.','설명':'금기 여부 판단이 아닌 일반 설명입니다.','분류 미확인':'모델이 정해진 판단 값을 반환하지 않았습니다.','화면 예시':'예시 체험 화면이며 판단하지 않습니다.'};
function verdictBadge(r,mode){
 const v=verdictClass[r.assessment]?r.assessment:'분류 미확인',label=v==='화면 예시'?'예시':verdictName(v);
 return `<span class="verdict verdict-${verdictClass[v]}" title="${esc(verdictHelp[v])}">판단: ${esc(label)}${mode==='llm'&&!r.demo?' · 근거 미검증':''}</span>`;
}
// Escapes first, then turns validated markers into buttons. Only refs returned by the server become links.
// One button per source for adjacent markers ("[S5.1][S5.3][S2]" gives one button for S5 and one for S2); a click marks the
// sentences that number points at. The button shows the reader's number (citationNumbers: 1, 2, 3 … over the cited sources).
function citeButtons(run,byRef,mode){
 const groups=new Map(),nums=citationNumbers([...byRef.values()]);
 for(const m of run.matchAll(/\[(S\d+)(?:\.(\d+))?\]/g)){if(!groups.has(m[1]))groups.set(m[1],[]);if(m[2])groups.get(m[1]).push(m[2]);}
 return [...groups].map(([ref,sents])=>{const c=byRef.get(ref),n=nums.get(ref);return c?`<button type="button" class="cite" data-cite-mode="${mode}" data-ref="${ref}" data-sents="${sents.join(',')}" title="${esc(c.citation||c.title)}" aria-label="근거 ${n}번: ${esc(c.citation||c.title)}">${n}</button>`:`[${ref}]`;}).join('');
}
// The one-line verdict, then every source the answer cited (in number order) so its sources show before the details.
// The verdict's own markers are folded into that list instead of being shown twice.
function headlineHTML(r){
 const text=esc(String(r.headline??'').replace(/\s*\[(S\d+(?:\.\d+)?|근거 없음|인용 확인 불가)\]/g,'').trim()),run=citationRun(r.citations);
 const byRef=new Map((r.citations||[]).map(c=>[c.ref,c]));
 return run?`${text} <span class="headline-cites" title="이 답변이 인용한 근거">${citeButtons(run,byRef,'hyperrag')}</span>`:text;
}
// A number stays on the same line as the words it supports.
function withCitations(text,r,mode){
 const byRef=new Map((r.citations||[]).map(c=>[c.ref,c]));
 return esc(text).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/(\S+)(\s*)((?:\[S\d+(?:\.\d+)?\]\s*)*\[S\d+(?:\.\d+)?\])([.,。!?]*)/g,'<span class="cite-keep">$1$2$3$4</span>').replace(/(?:\[S\d+(?:\.\d+)?\]\s*)*\[S\d+(?:\.\d+)?\]/g,run=>citeButtons(run,byRef,mode))
  .replace(/\[근거 없음\]/g,'<span class="cite-none" title="제공된 자료로 뒷받침되지 않는다고 모델이 표시한 문장입니다.">근거 없음</span>')
  .replace(/\[인용 확인 불가\]/g,'<span class="cite-invalid" title="제공하지 않은 자료 번호를 모델이 적어서 제거했습니다.">인용 확인 불가</span>');
}
function renderAnswers(){
 renderChat();renderDashboard();
 const busy=controllers.size>0;$('#cancel').hidden=!busy;$('.send').hidden=busy;
}
function openCitation(mode,ref,sents=''){
 const r=results[mode],c=r?.citations?.find(x=>x.ref===ref);if(!c)return;
 const doc=r.documents?.find(d=>d.id===c.id),marks=sents.split(',').filter(Boolean).map(n=>c.sentences?.[n]).filter(Boolean);
 openSource(c.id,doc?{id:doc.id,title:doc.title,source_label:doc.sourceLabel,source_operation:doc.sourceOperation,source_page:doc.sourcePage,citation:doc.citation,origin:doc.origin,content:doc.content,source_url:doc.url,record_id:doc.recordId}:null,ref,marks,false,citationNumbers(r.citations).get(ref));
}
async function execute(modes){
 const gen=generation;
 await Promise.all(modes.map(async mode=>{
  if(controllers.has(mode))return;
  const controller=new AbortController();controllers.set(mode,controller);results[mode]={pending:true};renderAnswers();
  const current=()=>gen===generation&&controllers.get(mode)===controller;
  // A saved answer is read from a file, so no model is called. Rule lookups and source texts still come from the DB.
  try{const response=savedAnswer?await fetch(`/demo-answers/${encodeURIComponent(savedAnswer)}.json`,{signal:controller.signal}):await fetch('/api/query',{method:'POST',headers:{'Content-Type':'application/json',...(runDemo?{}:keys.headers('openai'))},body:JSON.stringify({question,mode:mode==='hyperrag'?runMethod:mode,demo:runDemo,...(runDemo?{demoScale:$('#demo-scale').value}:{})}),signal:controller.signal});const body=await response.json(),r=savedAnswer&&response.ok?savedVersion(body):body;if(!current())return;results[mode]=response.ok?r:{error:r.error};if(response.ok){const h=history.find(x=>x.gen===gen);if(h)h.result=r;}
   // A missing or wrong key: the answer says so and 설정 opens at the key fields.
   else if(r.needsKey==='openai')openKeySettings(r.error);}
  catch(e){if(!current())return;results[mode]={error:e.name==='AbortError'?'다시 실행할 수 있습니다.':'로컬 서버 연결을 확인해 주세요.',cancelled:e.name==='AbortError'};}
  finally{if(current()){controllers.delete(mode);renderAnswers();refreshEvidence();}}
 }));
}
function cancel(){for(const c of controllers.values())c.abort();}
$('#cancel').onclick=cancel;
// 구체적인 답변: on shows every section of an answer; off shows only its "핵심 정리" section, or its first section when the
// model left 핵심 정리 out (all of it when it has no sections). It changes the text only: the answer, its verdict,
// citations, map and 약물관계 설명 stay those of one run.
// A saved demo file is always read as its detailed run (body.long, else its only one); its older short answer is
// kept in the file but no longer shown, so the map no longer switches between two runs.
let longView=true;try{longView=localStorage.getItem('hyperrx-long-answer')!=='off';}catch{}
function savedVersion(body){return body.long?.response||body.response;}
function shownAnswer(r){
 if(longView)return r;
 const parts=String(r.details||'').split(/\n(?=#{1,4}\s)/),headed=parts.filter(p=>/^#{1,4}\s/.test(p.trim()));
 const summary=headed.find(p=>/^#{1,4}\s*핵심 정리/.test(p.trim()))||(headed.length>1?headed[0]:null);
 return summary?{...r,details:summary.trim()}:r;
}
function setLongView(on){
 longView=on;try{localStorage.setItem('hyperrx-long-answer',on?'on':'off');}catch{}
 $('#long-toggle').setAttribute('aria-pressed',String(on));
 renderChat();
}
// 구체적인 답변 (in the question bar): pressed = the answer by headed sections; off = only its 핵심 정리. The choice is kept.
$('#long-toggle').insertAdjacentHTML('afterbegin',icon('detail',17));
$('#long-toggle').setAttribute('aria-pressed',String(longView));
$('#long-toggle').onclick=()=>setLongView(!longView);
function submit(text,opts={}){
 const q=String(text??$('#question').value).trim();if(!q)return;
 syncDemoScale();cancel();controllers=new Map();generation++;results={};question=q;savedAnswer=opts.saved||null;runDemo=!savedAnswer&&$('#execution').value==='demo';hasRun=true;evidencePreference='auto';evidenceMode='hyperrag';shownEvidenceResult=null;selectedEdges=[];
 review=opts.added?{meds:[...(opts.meds||meds)],added:opts.added}:parseReview(q);
 if(review&&!opts.added)meds=[...review.meds];
 // The method follows the drug count: a review from 새로 추가할 약 counts its own drugs, a typed question uses the slider.
 const pick=opts.added?reviewMethod(opts.meds||meds,opts.added):{count:clampCount(opts.count??drugCount)};
 runCount=pick.count;runMethod=recommended(runCount)||'hyperrag';
 enterWorkspace();$('#question').value='';autoGrow();resetCount();
 $('#notice').textContent=runDemo?'예시 데이터':'';
 clearGraph();currentGraph=null;fullGraph=null;$('#inspector').innerHTML='';setDashTab('problem');
 addHistory(q);clinical=runDemo?null:{pending:true};renderMeds();execute(['hyperrag']);if(!runDemo)loadClinical(q,history[0]);refreshEvidence();
}
$('#question-form').onsubmit=e=>{e.preventDefault();submit();};$('#question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#question-form').requestSubmit();}};
$$('[data-saved]').forEach(e=>e.onclick=()=>submit(e.textContent,{saved:e.dataset.saved}));
$('#saved-toggle').onclick=()=>{const list=$('#saved-list');list.hidden=!list.hidden;$('#saved-toggle').setAttribute('aria-expanded',String(!list.hidden));};
$('#saved-info').onclick=()=>{const guide=$('#saved-guide');guide.hidden=!guide.hidden;$('#saved-info').setAttribute('aria-expanded',String(!guide.hidden));};
function tab(name){$$('[data-tab]').forEach(e=>e.classList.toggle('active',e.dataset.tab===name));for(const n of ['graph','documents','relations'])$(`#${n}-panel`).hidden=n!==name;if(name==='graph'&&currentGraph)requestAnimationFrame(()=>{graph?.resize();graph?.fitView();});}
$$('[data-tab]').forEach(e=>e.onclick=()=>tab(e.dataset.tab));
function provenanceLabel(edge){const p=edge.provenance||{};return p.status==='demo'?'가상 문서':p.status==='linked'?`원문 ${p.resolved_count}건 연결`:p.status==='partial'?`원문 일부 연결 · ${p.resolved_count}/${p.source_count}건`:'원문 연결 확인 필요';}
function sourceCard(edge,doc){
 const span=edge.sourceSpans?.find(x=>x.id===doc.id),quote=span?.excerpt??doc.excerpt,matched=span?.matched_members||doc.matchedMembers||[];
 return `<article class="edge-source"><span class="badge">${esc(doc.sourceLabel||'로컬 원문')}</span>${sourceHeading(doc,'h4')}${sourceLine(doc)}<blockquote>${esc(quote||'미리보기 없음')}</blockquote><p class="source-location">원문 인용${Number.isFinite(span?.excerpt_start??doc.excerptStart)?` · ${(span?.excerpt_start??doc.excerptStart)+1}–${span?.excerpt_end??doc.excerptEnd}자`:''}</p><p class="source-match">동일 표기 확인: ${matched.length?matched.map(esc).join(' · '):'번역·약어 등 원문 표기 대조 필요'}</p><button data-open-document="${esc(doc.id)}">원문 전체 보기 ↗</button>${doc.url?` <a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">외부 출처 ↗</a>`:''}${originHTML(doc)}</article>`;
}
// Relation buttons, map areas and the relation list toggle a relation in or out of the selection; several can be shown together.
// hideAll: "전체 해제" was pressed, so the map shows no relation until one is chosen again. With no selection and no hideAll every relation shows.
let hideAll=false,edgeListOpen=false,edgesInView=[];
function toggleEdge(edge){if(!edge)return;hideAll=false;const i=selectedEdges.findIndex(e=>e.id===edge.id);if(i>=0)selectedEdges.splice(i,1);else selectedEdges.push(edge);tab('graph');renderGraphView();const last=selectedEdges.at(-1);if(last){showEdgeDetails(last);focusEvidence(last);}else showOverview();renderDashboard();}
// A click on a drawn relation area. While several relations are selected (e.g. after a drug's node) it only shows that relation's
// details and hides nothing; otherwise it selects the relation, and a second click goes back to all.
function clickArea(edge){if(!edge)return;if(selectedEdges.length>1){showEdgeDetails(edge);focusEvidence(edge);return;}toggleEdge(edge);}
// 2D, 연결 흐름 and 관계 표: a relation clicked becomes the only one shown at full strength (the others turn faint);
// clicking it again shows all.
function clickRelation2d(edge){
 if(!edge)return;
 if(selectedEdges.length===1&&selectedEdges[0].id===edge.id&&explorerSelection?.kind==='edge'){selectSet([]);return;}
 selectSet([edge]);focusEvidence(edge);
}
// The relation whose sources show under 점·선 and 행렬: the only one selected, or the one clicked among several.
const EVIDENCE_VIEWS=new Set(['bipartite','matrix']);
let evidenceFocus=null;
const selectionKey=()=>selectedEdges.map(e=>e.id).join('|');
function focusEvidence(edge){evidenceFocus={edge,key:selectionKey()};renderEdgeEvidence();}
function renderEdgeEvidence(){
 const box=$('#edge-evidence'),source=fullGraph||currentGraph;
 const edge=!source||hideAll||!EVIDENCE_VIEWS.has(dimension)?null:evidenceFocus?.key===selectionKey()?evidenceFocus.edge:selectedEdges.length===1?selectedEdges[0]:null;
 box.hidden=!edge;box.innerHTML=edge?edgeEvidence(edge,source,{palette}):'';
 if(!edge)return;
 const rows=edgeSources(edge,source);
 box.querySelectorAll('[data-edge-source]').forEach(b=>b.onclick=()=>openSource(b.dataset.edgeSource,null,null,rows.find(r=>r.id===b.dataset.edgeSource)?.names||[],true));
 box.querySelector('[data-edge-details]').onclick=()=>{showEdgeDetails(edge);setDashTab('search');};
}
function showOverview(){explorerSelection=null;renderExplorer();$('#inspector').classList.remove('provenance-inspector');$('#inspector').innerHTML='<p>전체 관계를 보고 있습니다. 노드나 색 영역, 아래 목록의 카드를 누르면 그 관계만 보이고, 다시 누르면 해제됩니다.</p>';}
function showEdgeDetails(edge){
 explorerSelection={kind:'edge',id:edge.id};renderExplorer();
 const source=fullGraph||currentGraph,docs=(source.evidenceDocuments||[]).filter(d=>edge.sourceIds?.includes(d.id)),p=edge.provenance||{},demo=p.method==='demo';
 const spans=edge.sourceSpans||[],matched=new Set(spans.length?spans.flatMap(s=>s.matched_members||[]):docs.flatMap(d=>d.matchedMembers||[]));
 $('#inspector').classList.add('provenance-inspector');
 $('#inspector').innerHTML=`${selectedEdges.length>1?`<p class="selection-note">선택한 관계 ${selectedEdges.length}개 중 이 관계의 상세입니다.</p>`:''}<span class="badge provenance-status ${esc(p.status||'unresolved')}">${esc(provenanceLabel(edge))}</span><h3>${esc(edge.label)}</h3>
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
// The map is drawn once per result, view (2D/3D/network) and theme. Selecting relations afterwards only hides
// and shows parts of that drawing (viewFilter), so positions and colors stay as they were.
let viewFilter=null,drawnFrom=null,drawnDim=null;
function clearGraph(message=''){const ticket=++drawing;viewFilter=null;drawnFrom=null;renderEdgeEvidence();renderQueue=renderQueue.catch(()=>{}).then(()=>{if(ticket!==drawing)return;try{graph?.destroy();}catch{}graph=null;$('#graph').innerHTML=message?`<div class="empty">${esc(message)}</div>`:'';});}
// A relation area's grid cell and widths (bubble-sets, the K-HyperRAG values at scale 1); s is graph units per screen pixel.
// Widths grow at most 1.5 times on a reduced map, or the many areas of a large map cover one another.
const bubbleSize=s=>{const w=Math.min(s,1.5);return {pixelGroup:Math.max(1,Math.round(4*s)),edgeR0:10*w,edgeR1:60*w,nodeR0:15*w,nodeR1:50*w,morphBuffer:10*w};};
function drawGraph(data){const ticket=++drawing;renderQueue=renderQueue.catch(()=>{}).then(()=>{if(ticket!==drawing)return;return drawGraphNow(data,ticket);});return renderQueue;}
async function drawGraphNow(data,ticket){
 try{graph?.destroy();}catch{}graph=null;viewFilter=null;drawnFrom=null;hideTip();$('#graph').innerHTML='';$('#graph').onclick=null;$('#graph').onpointerdown=null;currentGraph=data;
 // 약 쌍 and DUR 점검표 start from the asked drugs, so they still draw (a pair with no shared relation shows as such).
 if(!data.nodes.length&&dimension!=='dur'&&dimension!=='pairs'){$('#graph').innerHTML='<div class="empty">현재 질문 범위에 맞는 관계를 찾지 못했습니다.<br>관계가 없다는 것이 안전하다는 뜻은 아닙니다.</div>';return;}
 const dark=isDark(),nodeColors=entityColors(data,palette);
 // Drugs asked about are drawn larger with a neutral ring and a bold label (never a risk color; only verdict badges carry risk).
 const key=keyNodeIds(askedDrugs(),questionAliases(),data),keyInk=dark?'#f4f7fb':'#1f2937';
 // ★ inside the circle: the asked drugs and the members of the relations the answer cited (closely tied to the question).
 const stars=new Set([...key,...(fullGraph?.hyperedges||[]).filter(e=>e.evidencePriority?.cited>0).flatMap(e=>e.members)]);
 let ks=1; // node size factor (all nodes): after the first fit it undoes the zoom-out, so nodes and labels keep a readable on-screen size
 const nodeSize=id=>(key.has(id)?22:(nodeColors.get(id)||[]).length>1?14:13)*ks;
 const hyperView={bipartite:bipartiteView,matrix:matrixView,pairs:pairView,dur:durView}[dimension];
 if(hyperView){const source=fullGraph||data;graph=hyperView($('#graph'),data,{palette,dark,labels:true,drugs:dimension==='pairs'?drugsWithAliases(data):askedDrugSets(data),citations:shownEvidenceResult?.citations||[],clinical,activeHub:selectedDrug(),onSelect:dimension==='bipartite'||dimension==='matrix'?clickRelation2d:EVIDENCE_VIEWS.has(dimension)?clickArea:toggleEdge,onSelectGroup:selectGroup,onFoldClose:foldClosed,onSelectPair:selectPair,onSelectDur:selectDur,onSelectHub:hub=>selectDrug(hub.name),onSelectNode:node=>clickNode(node.id,key),onHover:(hit,x,y)=>hit?showTip(hit.kind==='drug'?drugTip(hit.hub):hit.kind==='group'?groupTip(hit):hit.kind==='node'?nodeTip(hit.node,source):edgeTip(hit.edge,source),x,y):hideTip()});const view=graph;viewFilter=ids=>view.filter(ids,selectedDrug(),viewKey());drawnFrom=data;drawnDim=dimension;return;}
 try{
  graph=new Graph({container:'graph',height:$('#graph').clientHeight||520,autoResize:true,data:{nodes:data.nodes.map(n=>({id:n.id,data:{label:n.label}})),edges:[]},node:{type:'circle',style:{size:d=>nodeSize(d.id),lineWidth:d=>key.has(d.id)?2*ks:0,stroke:keyInk,halo:d=>key.has(d.id),haloStroke:keyInk,haloLineWidth:()=>6*ks,haloStrokeOpacity:.14,zIndex:d=>key.has(d.id)?3:1,labelText:d=>!d.data.hideLabel?d.data.label||'':'',opacity:d=>d.data.muted ? .28 : 1,labelOpacity:d=>d.data.muted ? .3 : 1,iconText:d=>stars.has(d.id)?'★':'',iconFill:'#ffffff',iconFontSize:d=>(key.has(d.id)?13:8.5)*ks,iconFontWeight:700,labelFontSize:d=>(key.has(d.id)?16:10.5)*ks,labelFontWeight:d=>key.has(d.id)?600:400,labelFill:d=>key.has(d.id)?keyInk:dark?'#e8eef7':'#506078',fill:d=>{const c=nodeColors.get(d.id)||[];return c.length===1&&!key.has(d.id)?c[0]:dark?SHARED_CORE.dark:SHARED_CORE.light;}},state:{selected:{lineWidth:3,stroke:'#245FCB',size:22}}},layout:{type:'force-atlas2',preventOverlap:true,kr:80,gravity:20},behaviors:['zoom-canvas','drag-canvas','drag-element'],autoFit:'view',animate:false,plugins:data.hyperedges.map((e,i)=>({key:e.id,type:'bubble-sets',members:e.members,fill:palette[(e.colorIndex??i)%palette.length],stroke:palette[(e.colorIndex??i)%palette.length],fillOpacity:fullGraph?.hyperedges.some(f=>f.id===e.id)?.22:.015,strokeOpacity:fullGraph?.hyperedges.some(f=>f.id===e.id)?.22:.015,maxRoutingIterations:100,maxMarchingIterations:20,...bubbleSize(1),threshold:4,memberInfluenceFactor:1,edgeInfluenceFactor:4,nonMemberInfluenceFactor:-.8,virtualEdges:true,zIndex:-1}))});
  // Bubble areas sit below the nodes (zIndex -1; G6 appends them over the element layer by default), so the asked drugs stay on top.
  // Node clicks go through the container handler below only; a second G6 node:click handler would toggle a drug selection twice.
  const ownedGraph=graph;
  // Relation areas hug the node circles (2026-11-10): G6 builds each area from its members' render bounds, name tag and halo
  // included, so areas ballooned around long names and the enlarged asked drugs and pinched between them. Nodes answer
  // with their circle only; the method is used by area plugins alone (bubble-sets, hull).
  const elementBounds=ownedGraph.getElementRenderBounds.bind(ownedGraph);
  ownedGraph.getElementRenderBounds=id=>{
   if(ownedGraph.getElementType(id)!=='node')return elementBounds(id);
   const [x,y]=ownedGraph.getElementPosition(id),r=nodeSize(id)/2;
   return {min:[x-r,y-r,0],max:[x+r,y+r,0],center:[x,y,0],halfExtents:[r,r,0]};
  };
  // The areas' grid and widths are set in screen pixels, like K-HyperRAG at its 1:1 scale: after the fit they are divided by
  // the zoom, so a small map shown enlarged is traced on a finer grid (no wavy edges) and a large one shown reduced keeps
  // areas as wide, next to nodes enlarged by the same factor.
  const tuneAreas=()=>{
   const s=Math.min(4,Math.max(.25,1/(ownedGraph.getZoom?.()||1)));
   for(const e of data.hyperedges){const p=ownedGraph.getPluginInstance(e.id);if(!p)continue;p.update(bubbleSize(s));p.drawBubbleSets?.();}
  };
  // Selection = strength: the chosen relations stay strong and the rest turn faint, keeping their positions and colors.
  // Rendering (layout, bubbles) and the finishing steps (fit, larger asked drugs, refit) take seconds on big results, so the
  // filter is connected at once and selections made meanwhile queue behind them instead of redrawing the whole map.
  let busy=Promise.resolve();
  const live=()=>graph===ownedGraph&&!ownedGraph.destroyed;
  // Labels never overlap: after layout, labels are placed one by one (asked drugs, then the members of the chosen relations,
  // then ★ nodes, then nodes in more relations) and one that would overlap a placed label is hidden; its name stays in the tip.
  const wide=/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/,degree=new Map();
  for(const e of data.hyperedges)for(const id of e.members)degree.set(id,(degree.get(id)||0)+1);
  const hiddenLabels=keep=>{
   const hide=new Set(),placed=[];
   const rank=n=>key.has(n.id)?0:keep?.has(n.id)?1:stars.has(n.id)?2:3;
   for(const n of [...data.nodes].sort((a,b)=>rank(a)-rank(b)||(degree.get(b.id)||0)-(degree.get(a.id)||0))){
    let p;try{p=ownedGraph.getElementPosition(n.id);}catch{continue;}
    const f=(key.has(n.id)?16:10.5)*ks,r=(key.has(n.id)?22:13)*ks/2,w=[...String(n.label||'')].reduce((s,ch)=>s+(wide.test(ch)?1:.62)*f,0);
    const b={x0:p[0]-w/2-2,x1:p[0]+w/2+2,y0:p[1]+r,y1:p[1]+r+f*1.35};
    if(placed.some(o=>b.x0<o.x1&&o.x0<b.x1&&b.y0<o.y1&&o.y0<b.y1)){hide.add(n.id);continue;} // an asked drug's other spelling too
    placed.push(b);
   }
   return hide;
  };
  const focus=new Set((fullGraph?.hyperedges||[]).map(e=>e.id));
  // What a click or hover can hit: the question's relations and their members, faint or not; background relations cannot.
  const focusMembers=new Set(data.hyperedges.filter(e=>focus.has(e.id)).flatMap(e=>e.members));
  const hitData={nodes:data.nodes.filter(n=>focusMembers.has(n.id)||key.has(n.id)),hyperedges:data.hyperedges.filter(e=>focus.has(e.id))};
  const apply=async ids=>{
   if(!live())return;
   const edges=ids?data.hyperedges.filter(e=>ids.has(e.id)):data.hyperedges,keep=new Set(edges.flatMap(e=>e.members)),hide=hiddenLabels(ids?keep:null);
   ownedGraph.updateNodeData(data.nodes.map(n=>({id:n.id,data:{label:n.label,muted:!!ids&&!keep.has(n.id)&&!key.has(n.id),hideLabel:hide.has(n.id)}})));
   await ownedGraph.draw();
   // A chosen relation is drawn darker than usual; the question's other relations stay visible but faint; background ones faintest.
   const chosen=new Set(selectedEdges.map(e=>e.id));
   for(const e of data.hyperedges){const plugin=ownedGraph.getPluginInstance(e.id),on=!ids||ids.has(e.id),off=focus.has(e.id)?{fillOpacity:.06,strokeOpacity:.12}:{fillOpacity:.015,strokeOpacity:.015},style=on?(chosen.has(e.id)?{fillOpacity:.42,strokeOpacity:.8}:{fillOpacity:.22,strokeOpacity:.22}):off;plugin?.update(style);plugin?.shape?.update(style);}
  };
  busy=(async()=>{
   await ownedGraph.render();
   if(!live())return;await ownedGraph.fitView();
   // One size factor for every node: after the fit it undoes the zoom-out, so all nodes and labels keep a readable on-screen size
   // (asked drugs 22px / 12px text, others 13px / 10.5px) instead of only the asked drugs staying large.
   // Style mappers outrank datum styles in G6, so the factor is applied by touching the nodes' data and redrawing them.
   const z=ownedGraph.getZoom?.()||1;
   if(live()&&z<1){ks=Math.min(3,1/z);ownedGraph.updateNodeData(data.nodes.map(n=>({id:n.id,data:{label:n.label,sizeScale:ks}})));await ownedGraph.draw();if(live())await ownedGraph.fitView();} // refit: the larger nodes must not be cut at the edge
   if(live())tuneAreas();
  })().catch(e=>{if(live()){$('#graph').innerHTML='<div class="empty">그래프를 표시하지 못했습니다.<br>관계 목록에서 동일한 데이터를 확인할 수 있습니다.</div>';console.error(e);}});
  if(ticket===drawing){viewFilter=ids=>(busy=busy.then(()=>apply(ids)).catch(()=>{}));drawnFrom=data;drawnDim='2d';}
  let pointerStart=null,pressed=false,frame=0;
  $('#graph').onpointerdown=e=>{pointerStart=[e.clientX,e.clientY];pressed=true;hideTip();};
  $('#graph').onpointerup=()=>{pressed=false;};
  $('#graph').onpointerleave=()=>{pressed=false;hideTip();};
  $('#graph').onpointermove=e=>{if(pressed||frame)return;const x=e.clientX,y=e.clientY;frame=requestAnimationFrame(()=>{frame=0;if(graph!==ownedGraph)return;const hit=graphHit(ownedGraph,hitData,x,y,key,ks);$('#graph').style.cursor=hit?'pointer':'';if(!hit)return hideTip();showTip(hit.kind==='node'?nodeTip(hit.node,fullGraph||data):edgeTip(hit.edge,fullGraph||data,hit.overlap),x,y);});};
  $('#graph').onclick=e=>{if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5)return;const hit=graphHit(graph,hitData,e.clientX,e.clientY,key,ks);if(hit?.kind==='node')clickNode(hit.node.id,key);else if(hit)clickRelation2d(hit.edge);};
  await busy; // keeps draws in order; selections arriving now already go through viewFilter
 }catch(e){if(ticket!==drawing)return;$('#graph').innerHTML='<div class="empty">그래프를 표시하지 못했습니다.<br>관계 목록에서 동일한 데이터를 확인할 수 있습니다.</div>';console.error(e);}
}
function showEvidence(mode){
 if(mode==='llm')return;
 const r=results[mode];if(!r||r.error||r.pending)return;evidenceMode=mode;shownEvidenceResult=r;explorerSelection=null;fullGraph=focusQuestionGraph(r.graph,keyNodeIds(askedDrugs(),questionAliases(),r.graph),{demo:r.demo,citations:r.citations,groups:askedDrugSets(r.graph)});$('#inspector').classList.remove('provenance-inspector');
 {const cited=fullGraph.hyperedges.filter(e=>e.evidencePriority?.cited>0),rest=fullGraph.hyperedges.length-cited.length;
  fold2d=cited.length&&rest>=2?{rest,ids:new Set(cited.map(e=>e.id)),graph:{...fullGraph,hyperedges:cited,nodes:fullGraph.nodes.filter(n=>cited.some(e=>e.members.includes(n.id)))}}:null;open2d=false;}
 $('#documents-panel').innerHTML=r.documents.length?(r.retrieval?.strategy==='exact-medication-anchor'?`<p class="retrieval-note">질문에 나온 약명을 확인해 직접 언급된 문서 ${r.documents.length}건을 표시합니다. 자료 범위는 각 문서에서 확인하세요.</p>`:'')+r.documents.map(d=>`<article class="document">${d.sourceLabel?`<span class="badge">${esc(d.sourceLabel)}</span>`:''}${sourceHeading(d,'h3')}${sourceLine(d)}<p>${esc(d.content)}</p>${originHTML(d)}${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>`:''}</article>`).join(''):`<div class="empty">${mode==='llm'?'LLM 단독은 검색을 사용하지 않습니다.':'검색 엔진에서 문서 본문을 반환하지 않았습니다. 출처를 확인할 수 없습니다.'}</div>`;
 $('#relations-panel').innerHTML=fullGraph.hyperedges.length?fullGraph.hyperedges.map(e=>`<button class="relation" data-edge="${esc(e.id)}">${esc(e.label)} <small>· 구성원 ${e.members.length}개 · ${esc(provenanceLabel(e))}</small></button>`).join(''):'<div class="empty">반환된 관계가 없습니다.</div>';
 $('#edge-filter').value='';hideAll=false;$('#map-empty').hidden=true;
 selectedEdges=[];evidenceFocus=null;currentGraph=fullGraph;$('#inspector').innerHTML='<p>관계도의 노드나 색 영역, 아래 관계 버튼을 누르면 구성원과 출처가 여기에 나옵니다.</p>';
 $$('[data-edge]').forEach(e=>e.onclick=()=>toggleEdge(fullGraph.hyperedges.find(x=>x.id===e.dataset.edge)));
 tab(mode==='hyperrag'?'graph':'documents');renderGraphView();if(selectedEdges.length)showEdgeDetails(selectedEdges.at(-1));renderMeds();renderDashboard();
}
$('#fit').onclick=()=>graph?.fitView();$('#zoom-in').onclick=()=>graph?.zoomBy(1.25);$('#zoom-out').onclick=()=>graph?.zoomBy(.8);
// /api/status as last read. keyMode 'user': this server has no OpenAI key of its own, so each reader brings theirs.
let serverStatus=null;
// Whose OpenAI key answers: the reader's own first, else the server's.
const openaiState=s=>keys.key('openai')?`내 키 입력됨 · ${esc(maskKey(keys.key('openai')))}`:s?.openai?'서버 키 사용':s?.keyMode==='user'?'키 필요 · 설정에서 입력':'키 없음';
$('#settings').onclick=async()=>{try{const r=await(await fetch('/api/status')).json();serverStatus=r;$('#status-content').innerHTML=`<div class="status-row">OpenAI API <b>${openaiState(r)}</b></div><div class="status-row">검색 백엔드 <b>${r.db?.ready?`연결됨 · 문서 ${r.db.documents.toLocaleString()}건`:r.backend?'주소 설정됨 · DB 서버 확인 필요':'미설정'}</b></div><div class="status-row">모델 <b>${esc(r.model)}</b></div>`;$('#status-env').hidden=r.keyMode==='user';}catch{$('#status-content').textContent='로컬 서버에 연결할 수 없습니다.';}$('#status-dialog').showModal();};$('#close-dialog').onclick=()=>$('#status-dialog').close();
async function boot(){try{const status=await(await fetch('/api/status')).json();serverStatus=status;if(status.db?.ready&&(status.openai||keys.key('openai'))){$('#execution').value='live';syncDemoScale();syncAccount();$('#notice').textContent=`팀 DB 연결됨 · 문서 ${status.db.documents.toLocaleString()}건 · 실제 답변 모드`;}else if(status.db?.ready&&status.keyMode==='user')$('#notice').textContent='팀 DB 연결됨 · 실제 답변에는 설정에서 OpenAI API 키를 넣어 주세요';}catch{} const carried=sessionStorage.getItem('galyaksi-question');if(carried){sessionStorage.removeItem('galyaksi-question');$('#question').value=carried;submit();}} boot();

// redraw=true only when the drawing itself must change (theme, an opened fold); a new result or view redraws on its own.
function renderGraphView(redraw=false){
 // A selection made only of folded relations (say, one picked from the list) opens 2D, so it is never invisible.
 if(dimension==='2d'&&fold2d&&!open2d&&selectedEdges.length&&selectedEdges.every(e=>!fold2d.ids.has(e.id)))open2d=true;
 const folded=dimension==='2d'&&fold2d&&!open2d;syncMapFold();
 // The map draws only the question's relations (2026-11-10: the 2D map drew every retrieved relation, the ones outside the
 // relation list faint, and they read as relations that do not exist).
 const source=folded?fold2d.graph:(fullGraph||currentGraph);if(!source)return;
 const ids=()=>mapEdgeIds()||(dimension==='2d'?new Set((fullGraph||source).hyperedges.map(e=>e.id)):null);
 renderEdgeList(fullGraph||source);renderEdgeEvidence();
 $('#map-empty').hidden=!hideAll;
 if(!redraw&&viewFilter&&drawnFrom===source&&drawnDim===dimension){viewFilter(ids());return;}
 drawGraph(source).then(()=>{if(viewFilter&&drawnFrom===source)viewFilter(ids());});
}
function syncMapFold(){
 const b=$('#map-fold');b.hidden=!(dimension==='2d'&&fold2d);if(b.hidden)return;
 b.textContent=open2d?FOLD_OPEN_TEXT:`더 구체적으로 알아보기 (${fold2d.rest}개) ▸`;b.setAttribute('aria-expanded',String(open2d));
 b.title=open2d?FOLD_OPEN_TITLE:`답변에 직접 쓰이지 않은 관계 ${fold2d.rest}개입니다. 누르면 펼칩니다.`;
}
// "더 구체적으로 알아보기" and "간단하게 보기" take turns: closing goes back to the default view (folded, nothing selected),
// so a relation chosen among the opened ones does not open the fold again.
$('#map-fold').onclick=()=>{if(open2d){open2d=false;foldClosed();}else{open2d=true;renderGraphView(true);}};
function foldClosed(){evidenceFocus=null;hideTip();selectSet([]);}
// Relation list under the map (src/edge-list.js). The search box and the asked-drug switch narrow the list only.
function askedEdgeIds(source){const key=keyNodeIds(askedDrugs(),questionAliases(),source);return new Set(source.hyperedges.filter(e=>e.members.some(id=>key.has(id))).map(e=>e.id));}
// What the map shows: nothing after 전체 해제, the selection if there is one, else everything.
function mapEdgeIds(){if(hideAll)return new Set();return selectedEdges.length?new Set(selectedEdges.map(e=>e.id)):null;}
function renderEdgeList(source=fullGraph||currentGraph){
 if(!source)return;
 const chosen=new Set(selectedEdges.map(e=>e.id));
 const r=edgeRows(source,{palette,keyIds:keyNodeIds(askedDrugs(),questionAliases(),source),chosen,text:$('#edge-filter').value});
 edgesInView=r.visible;
 $('#edge-picker').innerHTML=r.html;
 $('#edge-count').textContent=`관계 ${r.total}개${hideAll?' · 0개 표시':chosen.size?` · ${chosen.size}개 선택`:''}`;
 $('#reset-edge').hidden=!(chosen.size||hideAll);
 const asked=$('#edge-asked');asked.hidden=!r.withAsked;asked.textContent=`질문한 약이 든 관계 ${r.withAsked}개`;
 $$('[data-pick]').forEach(b=>b.onclick=()=>toggleEdge(source.hyperedges.find(e=>e.id===b.dataset.pick)));
}
$('#edge-filter').oninput=()=>renderEdgeList();
// Buttons above the cards. They act on the cards in view; a card click still toggles that one relation.
function setListSelection(list,hide,note){explorerSelection=null;renderExplorer();selectedEdges=list;hideAll=hide;const box=$('#inspector');box.classList.remove('provenance-inspector');box.innerHTML=`<p>${esc(note)}</p>`;tab('graph');renderGraphView();renderDashboard();}
$('#edge-asked').onclick=()=>{const source=fullGraph||currentGraph;if(!source)return;const ok=askedEdgeIds(source),list=edgesInView.filter(e=>ok.has(e.id));setListSelection(list,false,`질문한 약이 든 관계 ${list.length}개를 보고 있습니다. 카드를 누르면 그 관계를 빼거나 다시 넣을 수 있습니다.`);};
$('#edge-all').onclick=()=>{const list=addEdges(selectedEdges,edgesInView);setListSelection(list,false,`관계 ${list.length}개를 보고 있습니다. 카드를 누르면 그 관계를 빼거나 다시 넣을 수 있습니다.`);};
$('#edge-none').onclick=()=>setListSelection([],true,'표시 중인 관계가 없습니다. 아래 목록에서 카드를 누르면 그 관계가 보입니다.');
$('#edge-toggle').onclick=()=>{edgeListOpen=!edgeListOpen;$('#edge-panel').hidden=!edgeListOpen;const b=$('#edge-toggle');b.setAttribute('aria-expanded',String(edgeListOpen));b.textContent=edgeListOpen?'접기 ▾':'펼치기 ▴';};
// Another view starts from its defaults: no selection, nothing opened behind "더 구체적으로 알아보기", the overview on the right.
$$('[data-dimension]').forEach(b=>b.onclick=()=>{dimension=b.dataset.dimension;$$('[data-dimension]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});open2d=false;evidenceFocus=null;hideTip();selectSet([]);});
$('#reset-edge').onclick=()=>{selectedEdges=[];hideAll=false;showOverview();renderGraphView();renderDashboard();};
function editQuestion(text=question){$('#question').value=text||'';autoGrow();$('#question').focus();queueCheck();}
function newQuestion(){cancel();generation++;controllers=new Map();results={};clinical=null;hasRun=false;shownEvidenceResult=null;selectedEdges=[];historyIndex=-1;review=null;renderHistory();renderAnswers();renderMeds();$('#question').value='';autoGrow();leaveWorkspace();$('#question').focus();}
$('#new-question').onclick=newQuestion;

// The round close button stays in view while the record scrolls (Esc also closes it).
document.body.insertAdjacentHTML('beforeend',`<dialog id="source-dialog"><button type="button" id="close-source" aria-label="원문 닫기" title="닫기">${icon('close',20)}</button><div id="source-dialog-body"></div></dialog>`);
let sourceLoad=0;const sourceCache=new Map();
$('#close-source').onclick=()=>{sourceLoad++;$('#source-dialog').close();};
function bindSourceButtons(root){
 // data-marks: the literal sentences a 새 구성 line quoted, marked when the record opens.
 root.querySelectorAll('[data-open-document]').forEach(b=>b.onclick=()=>{let marks=[];try{marks=JSON.parse(b.dataset.marks||'[]');}catch{}openSource(b.dataset.openDocument,null,null,marks,false,null,b.dataset.match==='1');});
 // 노드 사전 '다른 제품 보기': another product's 의약품안전나라 허가정보.
 root.querySelectorAll('[data-label-product]').forEach(s=>s.onchange=()=>{if(s.value&&s.value!==s.dataset.labelDefault)labelPick.set(s.dataset.labelKey,s.value);else labelPick.delete(s.dataset.labelKey);renderExplorer();});
 // "발췌 읽기" opens the excerpt under its source card; pressing it again folds it.
 root.querySelectorAll('[data-quote]').forEach(b=>b.onclick=()=>{const q=b.closest('.explorer-source')?.querySelector('.es-quote');if(!q)return;q.hidden=!q.hidden;b.setAttribute('aria-expanded',String(!q.hidden));b.textContent=q.hidden?'발췌 읽기':'발췌 접기';});
 // Sentence chips in a relation's explanation: "근거 1" opens that record with the members' sentences marked; "근거 1–4"
 // opens the relation's numbered list below and scrolls to it.
 root.querySelectorAll('[data-cite-source]').forEach(b=>b.onclick=()=>openSource(b.dataset.citeSource,null,null,(b.dataset.citeNames||'').split('|').filter(Boolean),true));
 root.querySelectorAll('[data-show-sources]').forEach(b=>b.onclick=()=>{const list=(b.closest('.explorer-relation')||root).querySelector('details.xp-sources');if(!list)return;list.open=true;list.scrollIntoView({block:'start',behavior:'smooth'});});
}
// marks: the literal sentences to mark. With relation=true, marks holds a relation's member names instead, and the sentences naming them are marked.
// no: the reader's number for a cited source (citationNumbers); the original S number is shown beside it for checking.
// matched: the marks are the record sentences a node's description sentence was matched to (노드 사전), not copied text.
async function openSource(id,preloaded=null,ref=null,marks=[],relation=false,no=null,matched=false){
 const label=ref?esc(no??ref.slice(1)):'';
 const ticket=++sourceLoad;const dialog=$('#source-dialog');$('#source-dialog-body').innerHTML='<p>원문을 불러오는 중입니다…</p>';if(!dialog.open)dialog.showModal();
 try{
  let d=preloaded||sourceCache.get(id);
  if(!d){if(id==='demo-doc')d={title:'화면 확인용 가상 문서',source_label:'가상 데이터',content:'약물 A·B·C 및 조건을 연결한 UI 예시입니다. 실제 의학 문서가 아닙니다.'};else{const response=await fetch('/api/evidence/'+encodeURIComponent(id));if(!response.ok)throw new Error('원문을 불러오지 못했습니다. DB 서버 연결을 확인해 주세요.');d=await response.json();}sourceCache.set(id,d);}
  if(ticket!==sourceLoad)return;
  const external=typeof d.source_url==='string'&&/^https?:\/\//.test(d.source_url)?d.source_url:null;
  const marked=markPassage(d.content||'본문 없음',relation?relationSentences(d.content,marks):marks);
  const where=relation?(marked.found?'<p class="source-found">아래 표시한 문장은 이 관계의 구성원 이름이 적힌 곳입니다.</p>':'<p class="source-location">이 관계의 구성원 이름을 문장에서 찾지 못해 원문 전체를 보여 줍니다.</p>'):!ref?(marks?.length&&marked.found?(matched?'<p class="source-found">아래 표시한 문장이 노드 설명의 문장과 낱말이 가장 많이 겹치는 곳입니다. HyperRx가 대조해 찾은 것이며, 설명 문장을 그대로 옮긴 곳은 아닙니다.</p>':'<p class="source-found">아래 표시한 문장이 약물관계 설명에 옮긴 문장입니다.</p>'):''):marked.found?`<p class="source-found">아래 표시한 문장이 근거 ${label}번으로 인용된 곳입니다.</p>`:`<p class="source-location">근거 ${label}번은 문장 위치를 가리키지 않아 원문 전체를 보여 줍니다.</p>`;
  $('#source-dialog-body').innerHTML=`${ref?`<p class="eyebrow">근거 ${label}번${no!=null?` <small class="source-ref">자료 ${esc(ref)}</small>`:''}</p>`:''}<span class="badge">${esc(d.source_label||'로컬 원문')}</span><h2>${esc(d.title)}</h2>${d.citation?`<p class="apa">${apaHTML(d.citation)}</p>`:''}${sourceLine(d)}<p class="source-location">DB에 저장된 원문 청크입니다. 외부 원문 주소가 있는 자료는 별도 링크로 표시합니다.</p>${where}<pre class="source-fulltext">${marked.html}</pre>${external?`<a href="${esc(external)}" target="_blank" rel="noopener noreferrer">외부 원문 열기 ↗</a>`:''}${originHTML({...d,id:d.id||id},{open:true})}`;
  $('#source-dialog-body .source-mark')?.scrollIntoView({block:'center'});
 }catch(error){if(ticket===sourceLoad)$('#source-dialog-body').textContent=error.message;}
}

function syncEvidenceSelector(){
 const selector=$('#evidence-mode');if(!selector)return;
 for(const option of selector.options)option.disabled=option.value!=='auto'&&!selected().includes(option.value);
 selector.value=evidencePreference;
}
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
// A description in a tip ends at the last sentence that fits (clipSentence, src/node-panel.js).
function descriptionHTML(text,limit){const p=parts(text);return p.length?`<p>${esc(clipSentence(p[0],limit))}</p>${p.length>1?`<small>다른 원문에서 추출된 설명 ${p.length-1}개 더 있음</small>`:''}`:'';}
function nodeTip(node,source){
 const linked=source.hyperedges.filter(e=>e.members.includes(node.id)).length,demo=!!shownEvidenceResult?.demo;
 return `<span class="tip-kind">개체${node.type&&node.type!=='UNKNOWN'?` · ${esc(node.type)}`:''}</span><strong>${esc(node.label||node.id)}</strong>${descriptionHTML(node.description,220)||'<p class="tip-empty">DB에 개체 설명이 없습니다.</p>'}<small>연결된 관계 ${linked}개 · ${demo?'가상 예시':'DB 추출 설명'} · 누르면 오른쪽 사전에서 전체 설명</small>`;
}
function edgeTip(edge,source,overlap=1){
 const index=source.hyperedges.indexOf(edge),color=palette[(edge.colorIndex??index)%palette.length];
 const names=edge.members.map(id=>source.nodes.find(n=>n.id===id)?.label||id);
 return `<span class="tip-kind tip-edge" style="--edge-color:${color}">관계 ${index+1} · ${esc(provenanceLabel(edge))}</span><strong>${esc(edge.label)}</strong>${descriptionHTML(edge.description,260)||'<p class="tip-empty">관계 설명이 없습니다.</p>'}<small>구성 개체 ${names.length}개: ${esc(clip(names.join(' · '),110))}</small>${overlap>1?`<small>이 위치에 관계 ${overlap}개가 겹쳐 있어 구성원이 가장 적은 관계를 보여 줍니다.</small>`:''}<small>${edge.provenance?.method==='demo'?'가상 예시':'자동 추출 설명'} · 클릭하면 원문 출처</small>`;
}
// Is the point inside the relation's drawn area? The bubble plugin keeps the outline it drew, in canvas coordinates.
const hitContext=document.createElement('canvas').getContext('2d'),outlineCache=new WeakMap();
function insideDrawnArea(g,edgeId,point){
 const outline=g.getPluginInstance?.(edgeId)?.path;if(!outline||typeof outline!=='object')return false;
 let path=outlineCache.get(outline);
 if(!path){path=new Path2D(outline.map(s=>s.join(' ')).join(' '));outlineCache.set(outline,path);}
 return hitContext.isPointInPath(path,point.x,point.y);
}
// Node if the cursor is on a drawn node, otherwise the relation with the fewest members whose drawn area contains the cursor.
// A point outside every drawn area is empty space: nothing is hit, whatever lies between a relation's nodes.
function graphHit(g,data,clientX,clientY,keys=new Set(),keyScale=1){
 if(!g?.getCanvasByClient)return null;
 let point;try{const c=g.getCanvasByClient([clientX,clientY]);point={x:c[0],y:c[1]};}catch{return null;}
 const zoom=g.getZoom?.()||1,pos=new Map();
 for(const n of data.nodes){try{const v=g.getElementPosition(n.id);pos.set(n.id,{x:v[0],y:v[1]});}catch{}}
 const near=data.nodes.map(n=>({n,d:pos.has(n.id)?Math.hypot(pos.get(n.id).x-point.x,pos.get(n.id).y-point.y):Infinity})).filter(x=>x.d<=(keys.has(x.n.id)?12:7.5)*keyScale+4/zoom).sort((a,b)=>a.d-b.d)[0];
 if(near)return {kind:'node',node:near.n};
 const hits=data.hyperedges.filter(edge=>insideDrawnArea(g,edge.id,point)).map(edge=>({edge})).sort((a,b)=>a.edge.members.length-b.edge.members.length);
 return hits.length?{kind:'edge',edge:hits[0].edge,overlap:hits.length}:null;
}
function inspectNode(id,source){explorerSelection={kind:'node',id,ids:[id]};renderExplorer();const node=source.nodes.find(n=>n.id===id);const edges=source.hyperedges.filter(x=>x.members.includes(id));$('#inspector').innerHTML=`<span class="badge">개체 · ${esc(node?.type||'유형 미제공')}</span><h3>${esc(node?.label||id)}</h3>${parts(node?.description).map(t=>`<p>${esc(t)}</p>`).join('')||'<p>DB에 개체 설명이 제공되지 않았습니다.</p>'}<p class="source-location">개체 설명도 DB 추출문입니다. 아래 관계를 선택해 해당 관계의 출처를 대조하세요.</p><p>연결된 관계 ${edges.length}개</p>${edges.map(x=>`<button class="relation" data-inspect="${esc(x.id)}">${esc(x.label)} · ${esc(provenanceLabel(x))}</button>`).join('')}`;$$('[data-inspect]').forEach(b=>b.onclick=()=>selectSet([edges.find(x=>x.id===b.dataset.inspect)]));}
// Demo size only applies to 예시 체험. Changing it re-runs the current demo question with the same answer modes.
function syncDemoScale(){$('#demo-scale-label').hidden=$('#execution').value!=='demo';}
$('#execution').addEventListener('change',syncDemoScale);syncDemoScale();
$('#demo-scale').onchange=()=>{if(hasRun&&runDemo)submit(question);};


// ---- ver.chatbot2 page wiring ----
// Session history (this browser tab only): reopening a finished question reuses its answer without another API call.
const history=[];let historyIndex=-1;
// Current medications and the drug under review ("A·B 복용 중 C 추가").
let meds=[],review=null;
// Rule lookups for the dashboard (DUR 병용금기 pairs, DUR flags, label sentences) from the DB server; no OpenAI call.
let clinical=null;
async function loadClinical(q,entry){
 const gen=generation;
 try{const response=await fetch('/api/clinical',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});const d=await response.json();if(gen!==generation)return;clinical=response.ok?d:{error:d.error||'규칙 조회에 실패했습니다.'};if(response.ok&&entry)entry.clinical=d;}
 catch{if(gen!==generation)return;clinical={error:'로컬 서버 연결을 확인해 주세요.'};}
 renderDashboard();if(dimension==='dur')renderGraphView(true);
}
const shell=$('#shell'),narrow=()=>matchMedia('(max-width:900px)').matches;
let railChoice=null;
function setRail(on){shell.classList.toggle('rail',on);const b=$('#sidebar-toggle');b.setAttribute('aria-expanded',String(!on));b.setAttribute('aria-label',on?'사이드바 펼치기':'사이드바 좁히기');}
function enterWorkspace(){if(!$('#workspace').hidden)return;document.body.classList.remove('home');$('#thread').hidden=true;$('#workspace').hidden=false;$('#chat-composer').append($('#question-form'));$('#question').placeholder='이어서 질문하기';if(!narrow())setRail(railChoice??true);}
function leaveWorkspace(){document.body.classList.add('home');$('#thread').hidden=false;$('#workspace').hidden=true;$('#home-composer').prepend($('#question-form'));$('#question').placeholder='약 이름이나 성분명, 궁금한 조합을 입력하세요';railChoice=null;setRail(false);}
function addHistory(q){const scale=$('#demo-scale').value;const dup=history.findIndex(h=>h.question===q&&h.demo===runDemo&&h.scale===scale&&h.saved===savedAnswer&&h.method===runMethod);if(dup>=0)history.splice(dup,1);history.unshift({question:q,demo:runDemo,saved:savedAnswer,scale,result:null,gen:generation,review,method:runMethod,count:runCount});if(history.length>20)history.pop();historyIndex=0;renderHistory();}
function renderHistory(){$('#history-group').hidden=!history.length;$('#history').innerHTML=history.map((h,i)=>`<li><button data-history="${i}" aria-current="${i===historyIndex}" title="${esc(h.question)}">${esc(h.question)}</button></li>`).join('');$$('[data-history]').forEach(b=>b.onclick=()=>openHistory(+b.dataset.history));}
function openHistory(i){
 const h=history[i];if(!h)return;
 if(!h.result){$('#execution').value=h.demo?'demo':'live';$('#demo-scale').value=h.scale;syncAccount();submit(h.question,{...(h.review?.added?h.review:{}),saved:h.saved,count:h.count});return;}
 cancel();controllers=new Map();generation++;question=h.question;runDemo=h.demo;savedAnswer=h.saved;results={hyperrag:h.result};hasRun=true;shownEvidenceResult=null;selectedEdges=[];historyIndex=i;review=h.review||null;runMethod=h.method||runMethod;runCount=h.count||runCount;
 clinical=h.demo?null:h.clinical||{pending:true};if(!h.demo&&!h.clinical)loadClinical(h.question,h);
 enterWorkspace();$('#notice').textContent=h.demo?'예시 데이터':'';
 renderHistory();renderMeds();renderAnswers();refreshEvidence();renderDashboard();
}

// ---- chat log: every question of this session, oldest first; the active one shows its full answer ----
const ICON_EDIT='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const ICON_COPY='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_DONE='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
async function copyQuestion(button,text){
 if(!text)return;
 try{await navigator.clipboard.writeText(text);}catch{const t=Object.assign(document.createElement('textarea'),{value:text});document.body.append(t);t.select();try{document.execCommand('copy');}catch{}t.remove();}
 button.innerHTML=ICON_DONE;button.title='복사했습니다';setTimeout(()=>{button.innerHTML=ICON_COPY;button.title='복사';},1400);
}
const stripRefs=t=>String(t??'').replace(/\s*\[(S\d+(?:\.\d+)?|근거 없음|인용 확인 불가)\]/g,'');
function aiMessage(h,i,active){
 const r=active?results.hyperrag:h.result;
 if(!r)return `<div class="ai-msg"><p class="muted">답변이 없습니다.</p><button class="ghost" data-open="${i}">다시 실행</button></div>`;
 if(r.pending)return '<div class="ai-msg"><p class="headline loading">근거를 찾고 답변을 준비하고 있습니다…</p></div>';
 if(r.error)return `<div class="ai-msg"><p class="headline small">${r.cancelled?'생성을 중지했습니다.':'답변을 완료하지 못했습니다.'}</p><p class="answer-error">${esc(r.error)}</p><button data-retry="hyperrag">다시 실행</button></div>`;
 if(!active)return `<div class="ai-msg"><div class="answer-top">${verdictBadge(r,'hyperrag')}${methodTag(h,r)}</div><p class="headline small">${esc(stripRefs(r.headline))}</p><button class="ghost" data-open="${i}">이 답변의 근거 다시 보기</button></div>`;
 return `<div class="ai-msg"><div class="answer-top">${verdictBadge(r,'hyperrag')}${methodTag(h,r)}</div><p class="headline">${headlineHTML(r)}</p><div class="detail structured-answer">${answerSections(shownAnswer(r))}</div></div>`;
}
// Which search answered, and for what drug count: the server's word for the method (a saved answer says how it was made,
// and carries no count), else the run's own.
function methodTag(h,r){
 const m=['rag','hyperrag'].includes(r?.mode)?r.mode:h?.method;if(!METHOD_NAMES[m])return '';
 const n=h?.count&&!h?.saved?h.count:0;
 return `<span class="method-tag" title="${n?`약물 개수가 ${countLabel(n)}${n>=3?'이라':'라'} ${METHOD_NAMES[m]}로 답했습니다.`:'이 답변을 찾은 검색 방식'}">${METHOD_NAMES[m]}${n?` · ${countLabel(n)}`:''}</span>`;
}
function renderChat(){
 const log=$('#chat-log');
 log.innerHTML=history.map((h,i)=>[h,i]).reverse().map(([h,i])=>`<article class="turn${i===historyIndex?' active':''}"><div class="user-msg"><div class="msg-tools"><button type="button" class="icon-tool" data-edit="${i}" aria-label="이 질문 고쳐 쓰기" title="고쳐 쓰기">${ICON_EDIT}</button><button type="button" class="icon-tool" data-copy="${i}" aria-label="이 질문 복사" title="복사">${ICON_COPY}</button></div><p>${esc(h.question)}</p></div><div class="ai-row"><span class="ai-avatar" aria-hidden="true">Rx</span>${aiMessage(h,i,i===historyIndex)}</div></article>`).join('');
 log.querySelectorAll('[data-retry]').forEach(e=>e.onclick=()=>execute(['hyperrag']));
 log.querySelectorAll('[data-ref]').forEach(e=>e.onclick=()=>openCitation(e.dataset.citeMode,e.dataset.ref,e.dataset.sents));
 log.querySelectorAll('[data-open]').forEach(e=>e.onclick=()=>openHistory(+e.dataset.open));
 log.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>editQuestion(history[+e.dataset.edit]?.question));
 log.querySelectorAll('[data-copy]').forEach(e=>e.onclick=()=>copyQuestion(e,history[+e.dataset.copy]?.question));
 const active=log.querySelector('.turn.active');if(active)log.scrollTop=Math.max(0,active.offsetTop-log.offsetTop-12);
}


// The "질문의 검토 범위" section only restates the question, so it is not shown.
function answerSections(r){return String(r.details||'').split(/\n\s*\n/).filter(Boolean).map(block=>{const lines=block.split('\n'),heading=lines[0].replace(/^#{1,4}\s*/, '').replace(/\*\*/g,'');if(/^#{1,4}\s/.test(lines[0]))return heading.includes('검토 범위')?'':`<section><h4>${esc(heading)}</h4><p>${withCitations(lines.slice(1).join('\n'),r,'hyperrag')}</p></section>`;return `<p>${withCitations(block,r,'hyperrag')}</p>`;}).join('');}
let explorerSelection=null,lastExplorerKey='',dashboardMode='connections';
// The 근거 대시보드 switch is gone: the panel always shows 약물관계 설명 (the legacy dashboard stays hidden).
// Asked drugs with every spelling the question matched, for views that read drug names inside source sentences.
function drugsWithAliases(data){return askedDrugSets(data).map(d=>({...d,aliases:aliasesFor(d.name,questionAliases())}));}
// 약 쌍: a pair (or the box of relations holding three or more asked drugs) selects the relations holding them and explains
// them in the right sidebar. Choosing it again shows every relation.
// The chosen 약 쌍 box or DUR 점검표 cell, which those views mark; other selections go by relation ids.
function viewKey(){return explorerSelection?.kind==='pair'||explorerSelection?.kind==='dur'?explorerSelection.key:null;}
// DUR 점검표: a cell or pair row explains its DUR records in the right sidebar; choosing it again closes the explanation.
function selectDur(key){explorerSelection=explorerSelection?.kind==='dur'&&explorerSelection.key===key?null:{kind:'dur',key};renderExplorer();viewFilter?.(mapEdgeIds());}
function chosenPair(){return explorerSelection?.kind==='pair'&&fullGraph?drugPairs(fullGraph,drugsWithAliases(fullGraph),shownEvidenceResult?.citations||[]).all.find(p=>p.key===explorerSelection.key)||null:null;}
function selectPair(pair){
 if(!pair)return;
 if(explorerSelection?.kind==='pair'&&explorerSelection.key===pair.key){selectSet([]);return;}
 hideAll=false;explorerSelection={kind:'pair',key:pair.key};selectedEdges=pair.edges.slice();tab('graph');renderGraphView();
 const box=$('#inspector');box.classList.remove('provenance-inspector');box.innerHTML=`<p>${esc(pair.title)}: 함께 든 관계 ${pair.edges.length}개를 보고 있습니다.${pair.edges.length?'':' 기록이 없다는 뜻이며, 안전하다는 뜻은 아닙니다.'}</p>`;
 renderDashboard();
}
// 점·선: a box holding same-named relations joined to the same asked drugs (×n) selects all of them and explains them
// relation by relation in the right sidebar. Choosing it again shows every relation.
function selectGroup(edges){
 if(!edges?.length)return;
 const ids=edges.map(e=>e.id);
 if(explorerSelection?.kind==='group'&&explorerSelection.ids.join('|')===ids.join('|')){selectSet([]);return;}
 hideAll=false;explorerSelection={kind:'group',ids};selectedEdges=edges.slice();tab('graph');renderGraphView();
 const box=$('#inspector');box.classList.remove('provenance-inspector');box.innerHTML=`<p>${esc(edges[0].label)}: 같은 이름의 관계 ${edges.length}개를 함께 보고 있습니다.</p>`;
 renderDashboard();
}
function groupTip(hit){return `<span class="tip-kind">묶은 관계 ${hit.edges.length}개</span><strong>${esc(hit.label)}</strong><p>이름과 이어진 질문 약이 같은 관계를 한 상자로 묶었습니다. 누르면 함께 봅니다.</p>`;}
// 약물관계 설명 (src/xai-panel.js) for every chosen relation that holds an asked drug (2026-11-09: one without an official
// record used to fall back to the relation explorer); only a relation with no asked drug keeps the explorer. It reads the rule lookup and, for its mechanism and patient parts, the full label records,
// which load here once (sourceCache) and redraw the panel when the same relation is still chosen.
const xaiView=true;
// The views carry a small icon each (Tabler, src/tabler-icons.js) next to their plain names.
const VIEW_ICONS={'2d':'map',bipartite:'flow',matrix:'grid',pairs:'pair',dur:'check'};
$$('[data-dimension]').forEach(b=>b.insertAdjacentHTML('afterbegin',icon(VIEW_ICONS[b.dataset.dimension],16)));
// 맞춤 is an icon (2026-11-10); its name stays in the tip and for screen readers.
$('#fit').innerHTML=icon('fit',16);
const xaiLoading=new Set();
function xaiPanel(part='main'){
 if(!xaiView||explorerSelection?.kind!=='edge'||!fullGraph)return '';
 const edge=fullGraph.hyperedges.find(e=>e.id===explorerSelection.id);if(!edge)return '';
 const ready=clinical&&!clinical.pending&&!clinical.error?clinical:null,drugs=askedDrugSets(fullGraph);
 const need=xaiNeeds(xaiTarget(edge,fullGraph,drugs,ready)).filter(id=>!sourceCache.has(id));
 for(const id of need)if(!xaiLoading.has(id)){
  xaiLoading.add(id);const key=JSON.stringify(explorerSelection);
  fetch('/api/evidence/'+encodeURIComponent(id)).then(r=>r.ok?r.json():null).then(d=>{if(d)sourceCache.set(id,d);}).catch(()=>{}).finally(()=>{xaiLoading.delete(id);if(JSON.stringify(explorerSelection)===key&&![...xaiLoading].length)renderExplorer();});
 }
 return xaiHTML(edge,fullGraph,{drugs,clinical:ready,clinicalPending:!!clinical?.pending,texts:sourceCache,question,loading:need.some(id=>xaiLoading.has(id)),part,citations:shownEvidenceResult?.citations||[]});
}
// 노드 설명 (src/node-panel.js) for a chosen node, an asked drug or another entity, in the same layout as a relation
// (2026-11-09: it was the relation explorer's entity view).
// Its description comes sentence by sentence with the records each most likely came from (/api/entity, entity_notes.py),
// loaded once per node (entityCache) and redrawn when the same node is still chosen; until then, or without the DB, the
// description shows without record numbers.
const entityCache=new Map(),entityLoading=new Set();
function nodePanel(part='all'){
 if(explorerSelection?.kind!=='node'||!fullGraph)return '';
 const names=[...new Set((explorerSelection.ids||[explorerSelection.id]).map(String))],key=names.join('|');
 if(!shownEvidenceResult?.demo&&!entityCache.has(key)&&!entityLoading.has(key)){
  entityLoading.add(key);const sel=JSON.stringify(explorerSelection);
  fetch('/api/entity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({names})}).then(r=>r.ok?r.json():{error:true}).catch(()=>({error:true}))
   .then(d=>entityCache.set(key,d)).finally(()=>{entityLoading.delete(key);if(JSON.stringify(explorerSelection)===sel)renderExplorer();});
 }
 const entry=entityCache.get(key)||(entityLoading.has(key)?{pending:true}:null);
 const drugs=askedDrugSets(fullGraph);
 return nodeHTML(fullGraph,explorerSelection,{drugs,citations:shownEvidenceResult?.citations||[],palette,clinical:clinical&&!clinical.pending&&!clinical.error?clinical:null,part,entry,label:nodeLabel(names,key,drugs),labelKey:key});
}
// A drug's 의약품안전나라 허가정보 (/api/label, mfds-label.mjs), loaded once per node and product (labelCache); the product
// the reader picked in '다른 제품 보기' is kept per node (labelPick). Not for an entry that is not a drug.
const labelCache=new Map(),labelLoading=new Set(),labelPick=new Map();
function nodeLabel(ids,key,drugs){
 if(shownEvidenceResult?.demo)return null;
 const asked=drugs.find(d=>ids.some(id=>d.ids?.has(id))),nodes=fullGraph.nodes.filter(n=>ids.includes(n.id));
 if(!asked&&!nodes.some(n=>['ACTIVE_INGREDIENT','DRUG_PRODUCT'].includes(n.type)))return null;
 const names=[...new Set([explorerSelection.name,asked?.name,...(asked?.aliases||[]),...nodes.map(n=>n.label)].filter(Boolean))];
 const itemSeq=labelPick.get(key)||'',at=`${key}#${itemSeq}`;
 if(!labelCache.has(at)&&!labelLoading.has(at)){
  labelLoading.add(at);const sel=JSON.stringify(explorerSelection);
  fetch('/api/label',{method:'POST',headers:{'Content-Type':'application/json',...keys.headers('mfds')},body:JSON.stringify({names,itemSeq})})
   .then(async r=>{const d=await r.json().catch(()=>({}));return r.ok?d:{error:true,message:d.error||'의약품안전나라 허가정보를 불러오지 못했습니다.'};})
   .catch(()=>({error:true,message:'의약품안전나라 허가정보를 불러오지 못했습니다.'}))
   .then(d=>labelCache.set(at,d)).finally(()=>{labelLoading.delete(at);if(JSON.stringify(explorerSelection)===sel)renderExplorer();});
 }
 return labelCache.get(at)||(labelLoading.has(at)?{pending:true}:null);
}
// The panel's two tabs: 약물관계 설명 and 근거 및 출처 (the chosen relation's records, numbered as the explanation's
// '근거 n'; for a relation shown in the previous layout, its own records). The chosen tab stays while the selection changes.
let explorerTab='relation';
function sourcesTab(){
 if(!fullGraph)return '<div class="explorer-empty"><h3>근거 및 출처</h3><p>질문에 답변한 뒤 시각화에서 관계를 고르면 그 관계의 근거와 출처가 여기에 나옵니다.</p></div>';
 const edge=explorerSelection?.kind==='edge'?fullGraph.hyperedges.find(e=>e.id===explorerSelection.id):null;
 if(!edge)return nodePanel('sources')||'<div class="explorer-empty"><h3>어떤 관계의 근거가 궁금하신가요?</h3><p>시각화에서 관계를 누르면 그 관계의 근거와 출처가 여기에 나옵니다.</p></div>';
 return xaiPanel('sources')||relationSourcesHTML(edge,fullGraph);
}
function setExplorerTab(tab){explorerTab=tab;$$('#panel-tabs [role=tab]').forEach(b=>{const on=b.dataset.ptab===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});$('#connection-dashboard').scrollTop=0;renderExplorer();}
function renderExplorer(){
 const box=$('#connection-content'),key=JSON.stringify([!!fullGraph,explorerSelection]),pair=chosenPair(),dur=explorerSelection?.kind==='dur'&&clinical?.drugs?durExplorerHTML(clinical,explorerSelection.key):'';const sources=sourcesTab(),count=(sources.match(/class="xs-row"/g)||[]).length;$('#tab-sources-count').textContent=count?String(count):'';
 box.innerHTML=explorerTab==='sources'?sources:pair?pairExplorerHTML(pair):dur||xaiPanel()||nodePanel()||explorerHTML(fullGraph,explorerSelection?.kind==='dur'?null:explorerSelection,fullGraph?askedDrugSets(fullGraph):[]);if(key!==lastExplorerKey){$('#connection-dashboard').scrollTop=0;lastExplorerKey=key;}
 box.querySelectorAll('[data-explore-edge]').forEach(b=>b.onclick=()=>{const edge=fullGraph?.hyperedges.find(e=>e.id===b.dataset.exploreEdge);if(edge)selectSet([edge]);});
 box.querySelectorAll('[data-explore-node]').forEach(b=>b.onclick=()=>clickNode(b.dataset.exploreNode,keyNodeIds(askedDrugs(),questionAliases(),fullGraph)));
 bindSourceButtons(box);
 const color=selectionColor();box.classList.toggle('has-sel-color',!!color);if(color)box.style.setProperty('--sel-color',color);else box.style.removeProperty('--sel-color');
}
// The color the chosen relation or entity has on the map, carried into its explanation: a relation's palette color, an
// entity's color when it sits in exactly one drawn relation; asked drugs and shared entities stay neutral (no color).
function selectionColor(){
 const s=explorerSelection,g=fullGraph;if(!s||!g)return '';
 const edge=s.kind==='edge'?g.hyperedges.find(e=>e.id===s.id):s.kind==='group'?g.hyperedges.find(e=>e.id===s.ids?.[0]):null;
 if(edge)return relationColor(edge,g.hyperedges.indexOf(edge),palette);
 if(s.kind==='node'&&!s.name){const drawn=currentGraph||g,c=entityColors(drawn,palette).get((s.ids||[s.id])[0])||[];return c.length===1?c[0]:'';}
 return '';
}
function setDashboardMode(mode){
 dashboardMode=mode;const legacy=mode==='evidence';$('#legacy-dashboard').hidden=!legacy;$('#connection-dashboard').hidden=legacy;
 $('#dashboard-title').hidden=!legacy;$('#panel-tabs').hidden=legacy;renderExplorer();
}
$$('#panel-tabs [role=tab]').forEach(b=>b.onclick=()=>setExplorerTab(b.dataset.ptab));

// ---- medications: current list, the drug to add, and the composed review question ----
// Picks 은/는-style particles by the final sound: Hangul by its last syllable, a lone Latin letter as spelled (엘·엠·엔·알), digits as read, other Latin words by l/m/n.
const josa=(word,withFinal,withoutFinal)=>{const w=String(word).trim(),c=w.charCodeAt(w.length-1);
 if(c>=0xAC00&&c<=0xD7A3)return (c-0xAC00)%28?withFinal:withoutFinal;
 if(/(^|[^A-Za-z])[A-Za-z]$/.test(w))return /[LMNR]$/i.test(w)?withFinal:withoutFinal;
 if(/[0-9]$/.test(w))return /[013678]$/.test(w)?withFinal:withoutFinal;
 return /[lmn]$/i.test(w)?withFinal:withoutFinal;};
const joinNames=list=>list.length<2?(list[0]||''):`${list.slice(0,-1).join(', ')}${josa(list.at(-2),'과','와')} ${list.at(-1)}`;
function reviewQuestion(current,added){return `${joinNames(current)}${josa(current.at(-1),'을','를')} 복용 중인 환자에게 ${added}${josa(added,'을','를')} 추가해도 되나요?`;}
// Reads the same template back from a typed question, e.g. "와파린과 아스피린을 복용 중인 환자에게 클로피도그렐을 추가해도 되나요?".
function parseReview(q){const m=q.match(/^(.+?)[을를]\s*복용\s*중인\s*환자에게\s*(.+?)[을를]\s*(?:새로\s*)?추가/);if(!m)return null;const current=m[1].split(/\s*,\s*|(?:와|과)\s+|\s+및\s+/).map(x=>x.trim()).filter(Boolean);return current.length?{meds:current,added:m[2].trim()}:null;}
function renderMeds(){
 const added=review?.added&&!meds.includes(review.added)?review.added:null;
 $('#med-list').innerHTML=meds.map((m,i)=>`<li><span>${esc(m)}</span><button type="button" data-med-remove="${i}" aria-label="${esc(m)} 빼기">×</button></li>`).join('')+(added?`<li class="added"><span>${esc(added)}</span><small>추가 검토</small><button type="button" id="med-confirm" title="복용 약에 넣기" aria-label="${esc(added)}${josa(added,'을','를')} 복용 약에 넣기">✓</button></li>`:'');
 $('#med-demo').hidden=!runDemo&&$('#execution').value!=='demo';$('#med-clear').hidden=!meds.length;
 const found=foundMedications(questionAliases(),[...meds,review?.added]).slice(0,6);
 $('#med-found').hidden=!found.length;$('#med-found').innerHTML=found.length?`질문에서 찾은 약 ${found.map(x=>`<button type="button" data-med-add="${esc(x)}">＋ ${esc(x)}</button>`).join('')}`:'';
 $$('[data-med-remove]').forEach(b=>b.onclick=()=>{meds.splice(+b.dataset.medRemove,1);renderMeds();});
 $$('[data-med-add]').forEach(b=>b.onclick=()=>addMed(b.dataset.medAdd));
 const confirm=$('#med-confirm');if(confirm)confirm.onclick=()=>addMed(review.added);
 if($('#add-input').value.trim())queueCheck(); // the list changed under a drug being typed in 새로 추가할 약
}
function addMed(name){const n=String(name||'').trim();if(n&&!meds.includes(n))meds.push(n);renderMeds();}
$('#med-form').onsubmit=e=>{e.preventDefault();addMed($('#med-input').value);$('#med-input').value='';$('#med-input').focus();};
$('#add-form').onsubmit=e=>{e.preventDefault();const c=$('#add-input').value.trim();if(!c)return;
 if(!meds.length){setMedHelp(true);$('#med-input').focus();$('#notice').textContent='먼저 복용 중인 약을 넣어 주세요.';return;}
 $('#add-input').value='';submit(reviewQuestion(meds,c),{meds:[...meds],added:c});};
$('#med-clear').onclick=()=>{meds=[];renderMeds();};
function setMedHelp(open){$('#med-empty').hidden=!open;$('#med-info').setAttribute('aria-expanded',String(open));}
$('#med-info').onclick=()=>setMedHelp($('#med-empty').hidden);
$('#med-demo').onclick=()=>{meds=['약물 A','약물 B'];$('#add-input').value='약물 C';renderMeds();$('#add-input').focus();};

// ---- 약물 개수 → 검색 방식 (src/method-pick.js): the slider sets the count, the count sets the method; nothing else does. ----
// While a question is typed, the drugs it names set the slider until the reader moves it; 새로 추가할 약 being typed counts
// the current list and that drug. A drug class (NSAIDs …) or a name the DB does not know is not counted: the reader moves
// the slider then. Each new question starts at 3제 이상 (HyperRAG), the earlier behaviour.
function showCount(){
 const label=countLabel(drugCount),method=recommended(drugCount),s=$('#drug-count'),out=$('#drug-count-value');
 s.value=String(drugCount);s.setAttribute('aria-valuetext',`${label}, ${METHOD_NAMES[method]}`);
 out.textContent=label;out.title=foundDrugs.length?`질문에서 찾은 약: ${foundDrugs.join(', ')}`:'';
 // The blue part of the track and the stop circles up to the knob.
 $('.count-track').style.setProperty('--pct',`${(drugCount-1)*50}%`);
 $$('.count-ticks i').forEach((t,i)=>t.classList.toggle('on',i<drugCount));
}
function setCount(n){drugCount=clampCount(n);showCount();}
function resetCount(){countTouched=false;foundDrugs=[];setCount(3);}
async function checkQuestion(){
 const seq=++recommendSeq;if(countTouched)return;
 const add=$('#add-input').value.trim();
 if(add&&meds.length){foundDrugs=[...new Set([...meds,add])];return setCount(foundDrugs.length);}
 const q=$('#question').value.trim();if(!q){foundDrugs=[];return showCount();}
 try{const r=await fetch('/api/drugs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});const d=r.ok?await r.json():null;
  if(seq!==recommendSeq||countTouched||!Array.isArray(d?.drugs))return;
  foundDrugs=d.drugs;if(d.drugs.length)setCount(d.drugs.length);else showCount();}
 catch{}
}
function queueCheck(){clearTimeout(recommendTimer);recommendTimer=setTimeout(checkQuestion,350);}
$('#question').addEventListener('input',queueCheck);
$('#add-input').addEventListener('input',queueCheck);
$('#drug-count').addEventListener('input',e=>{countTouched=true;setCount(e.target.value);});
resetCount();

// ---- dashboard: counts of retrieved evidence only (never a risk probability) ----
const MED_TYPE=/ACTIVE_INGREDIENT|DRUG_PRODUCT|DRUG_CLASS|약물|성분|제품/i;
// Alias groups the DB server found in the question, one group per drug (see medications.js).
function questionAliases(){return aliasGroups(results.hyperrag?.retrieval?.matched_aliases);}
// Drugs the question asks about: the review list (when the question came from 추가 검토) and the drugs the DB server found in it.
function askedDrugs(){const r=results.hyperrag,g=r?.graph,base=[...(review?.added?[...review.meds,review.added]:[]),...questionAliases().map(displayName)];if(base.length)return [...new Set(base)];const found=(g?.nodes||[]).filter(n=>MED_TYPE.test(n.type||'')&&n.label?.length>=2&&question.toLowerCase().includes(n.label.toLowerCase()));return [...new Set((found.length?found:r?.demo?(g?.nodes||[]).filter(n=>/약물|성분/.test(n.type||'')).slice(0,3):[]).map(n=>n.label))];}
// Network view hubs: one per asked drug (aliases merged), the added drug of a review first, with the nodes that stand for it.
function askedDrugSets(data){
 const groups=questionAliases(),seen=new Set(),out=[];
 for(const name of askedDrugs()){
  const aliases=aliasesFor(name,groups),key=aliases.map(norm).sort().join('|');if(seen.has(key))continue;seen.add(key);
  out.push({name:aliases.length>1?displayName(aliases):name,ids:keyNodeIds([name],groups,data)});
 }
 return out;
}
// Clicking an asked drug (2D/3D node of any of its spellings, or a network hub) keeps only that drug's relations on the map
// and shows the drug summary; clicking it again shows every relation. Other nodes keep the entity inspector.
function clickNode(id,keys){
 const source=fullGraph||currentGraph,owner=keys.has(id)&&source?askedDrugSets(source).find(d=>d.ids.has(id)):null;
 if(owner)selectDrug(owner.name);else selectNode(id,source);
}
// Any other node: the same rule for its own relations. Clicking it again shows every relation.
function selectNode(id,source){
 if(!source)return;
 const edges=source.hyperedges.filter(e=>e.members.includes(id));
 if(explorerSelection?.kind==='node'&&explorerSelection.id===id){selectSet([]);return;}
 hideAll=false;
 if(edges.length){selectedEdges=edges.slice();tab('graph');renderGraphView();}
 inspectNode(id,source);renderDashboard();
}
function drugSelection(name,source){
 const drugs=askedDrugSets(source),drug=drugs.find(d=>norm(d.name)===norm(name))||{name,ids:keyNodeIds([name],questionAliases(),source)};
 return drugSummary(source,drug,drugs.filter(d=>d!==drug));
}
// The asked drug whose relations are exactly the current selection, if any (drawn as the active hub on the network).
function selectedDrug(){const source=fullGraph||currentGraph;if(!source||!selectedEdges.length)return null;return askedDrugSets(source).map(d=>drugSelection(d.name,source)).find(s=>s.edges.length&&sameSelection(s.edges))?.name||null;}
function selectDrug(name){
 const source=fullGraph||currentGraph;if(!source)return;
 const s=drugSelection(name,source);
 if(explorerSelection?.kind==='node'&&explorerSelection.name===s.name){selectSet([]);return;}
 hideAll=false;
 if(s.edges.length){selectedEdges=s.edges.slice();tab('graph');renderGraphView();}
 showDrugDetails(s);renderDashboard();
}
function showDrugDetails(s){
 explorerSelection={kind:'node',name:s.name,ids:[...keyNodeIds([s.name],questionAliases(),fullGraph||currentGraph)]};renderExplorer();
 const box=$('#inspector');box.classList.remove('provenance-inspector');
 box.innerHTML=`<span class="badge">질문한 약</span><h3>${esc(s.name)}</h3>${s.edges.length?'':'<p>검색된 관계에서 이 약을 찾지 못했습니다. 근거가 없다는 뜻이며, 안전하다는 뜻은 아닙니다.</p>'}
 <h4>DB 표기별 관계 수</h4><div class="evidence-tags">${s.spellings.map(x=>`<span>${esc(x.label)} ${x.count}</span>`).join('')||'<span>찾은 표기 없음</span>'}</div>
 <h4>관계 ${s.edges.length}개</h4>${s.rows.map(r=>`<button class="relation" data-drug-edge="${esc(r.edge.id)}">${esc(r.edge.label)}${r.with.length?` <small>· ${esc(joinNames(r.with))}${josa(r.with.at(-1),'과','와')} 함께</small>`:''}</button>`).join('')}`;
 box.querySelectorAll('[data-drug-edge]').forEach(b=>b.onclick=()=>selectSet([s.edges.find(e=>e.id===b.dataset.drugEdge)]));
}
function drugTip(hub){return `<span class="tip-kind">질문한 약</span><strong>${esc(hub.name)}</strong>${hub.total?'':'<p>검색된 관계에서 이 약을 찾지 못했습니다. 근거가 없다는 뜻이며, 안전하다는 뜻은 아닙니다.</p>'}<small>이 화면의 관계 ${hub.total}개 · DB 표기 ${hub.ids.size}개</small>`;}
// Graph nodes for a drug name, matched by every alias found for it (e.g. 와파린 also finds WARFARIN).
function medNodes(name,g){return nodesMatching(aliasesFor(name,questionAliases()),g);}
function edgesWith(g,a,b){const A=new Set(a.map(n=>n.id)),B=b&&new Set(b.map(n=>n.id));return g.hyperedges.filter(e=>e.members.some(id=>A.has(id))&&(!B||e.members.some(id=>B.has(id))));}
function addedEdges(g){return review?.added&&g?edgesWith(g,medNodes(review.added,g)):[];}
function sameSelection(list){return list.length===selectedEdges.length&&list.every(e=>selectedEdges.some(x=>x.id===e.id));}
function selectSet(list){hideAll=false;selectedEdges=list.slice();tab('graph');renderGraphView();if(list.length)showEdgeDetails(list.at(-1));else showOverview();renderDashboard();}
function bars(rows,max,attr){return `<div class="bars">${rows.map((r,i)=>{const w=max?Math.round(r.count/max*100):0;const tag=attr&&r.count?'button':'div';return `<${tag} class="bar-row${r.count?'':' none'}"${tag==='button'?` type="button" ${attr}="${i}" aria-pressed="${!!r.pressed}"`:''} title="${esc(r.title||r.name)}"><span class="name">${esc(r.name)}</span><span class="track"><span class="fill" style="width:${w}%"></span></span><span class="count">${r.count}</span></${tag}>`;}).join('')}</div>`;}
function focusNames(r,g){
 if(review?.added)return [...review.meds,review.added];
 if(meds.length)return meds;
 const found=aliasGroups(r?.retrieval?.matched_aliases).map(displayName);if(found.length)return found;
 const degree=new Map();for(const e of g.hyperedges)for(const id of e.members)degree.set(id,(degree.get(id)||0)+1);
 return g.nodes.filter(n=>MED_TYPE.test(n.type||'')).sort((a,b)=>(degree.get(b.id)||0)-(degree.get(a.id)||0)).slice(0,4).map(n=>n.label);
}
// Rule-based sections (DUR, label sentences) first; search counts and relation tools sit in the collapsed 검색 정보.
function renderClinical(r){
 const boxes={verdict:$('#dash-verdict'),problem:$('#dash-problem'),label:$('#dash-label'),flags:$('#dash-flags'),mech:$('#dash-mechanism'),basis:$('#dash-basis')};
 const fill=(verdict,rest)=>{boxes.verdict.innerHTML=verdictHead+verdict;boxes.problem.innerHTML='<h3>예상되는 문제</h3>'+rest;boxes.label.innerHTML='<h3>식약처 허가사항의 관련 문장</h3>'+rest;boxes.flags.innerHTML='<h3>약별 DUR 주의</h3>'+rest;boxes.mech.innerHTML=boxes.basis.innerHTML=rest;};
 if(!hasRun)return fill('<p class="hint">질문을 보내면 질문한 약끼리 DUR 병용금기에 등재되어 있는지 확인합니다.</p>','<p class="hint">질문을 보내면 채워집니다.</p>');
 if(runDemo)return fill(`${r&&!r.pending&&!r.error?`<div class="answer-top">${verdictBadge(r,'hyperrag')}</div>`:''}<p class="hint">예시 데이터에서는 DUR 규칙 판정을 하지 않습니다. 설정에서 실행 모드를 실제 연결로 바꾸면 판정합니다.</p>`,'<p class="hint">예시 데이터에서는 보여 주지 않습니다.</p>');
 if(!clinical||clinical.pending)return fill('<p class="hint">DUR과 허가사항을 확인하는 중입니다…</p>','<p class="hint">확인하는 중입니다…</p>');
 if(clinical.error){fill(`<p class="hint">규칙 조회를 하지 못했습니다. ${esc(clinical.error)}</p><div class="dash-buttons"><button type="button" id="retry-clinical">다시 조회</button></div>`,'<p class="hint">규칙 조회를 하지 못했습니다.</p>');$('#retry-clinical').onclick=()=>{clinical={pending:true};renderDashboard();loadClinical(question,history[historyIndex]);};return;}
 const added=review?.added,answer=r&&!r.pending&&!r.error?r:null;
 boxes.verdict.innerHTML=verdictSection(clinical,answer,added,review?.added?[...review.meds,review.added]:[],!!r?.pending);
 boxes.problem.innerHTML=problemSection(clinical,added);
 boxes.label.innerHTML=labelSection(clinical,added);
 boxes.flags.innerHTML=flagsSection(clinical);
 boxes.mech.innerHTML=mechanismSection(clinical,added);
 boxes.basis.innerHTML=basisSection(clinical)+`<p class="hint">DB 버전: ${esc(clinical.database||'확인 불가')}</p>`;
 for(const box of Object.values(boxes))bindSourceButtons(box);
}
$('#dash-verdict').addEventListener('click',e=>{const b=e.target.closest('[data-verdict-info]');if(!b)return;const guide=$('#dash-verdict .hero-guide');guide.hidden=!guide.hidden;b.setAttribute('aria-expanded',String(!guide.hidden));});
// Dashboard tabs. A new question starts on 예상 문제; printing shows every panel (see the CSS).
function setDashTab(name){
 $$('[data-dash-tab]').forEach(b=>{const on=b.dataset.dashTab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
 $$('[data-dash-panel]').forEach(p=>p.classList.toggle('on',p.dataset.dashPanel===name));
 $('.dash-scroll').scrollTop=0;
}
$$('[data-dash-tab]').forEach((b,i,all)=>{
 b.onclick=()=>setDashTab(b.dataset.dashTab);
 b.onkeydown=e=>{const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!step)return;e.preventDefault();const next=all[(i+step+all.length)%all.length];setDashTab(next.dataset.dashTab);next.focus();};
});
function renderDashboard(){
 renderExplorer();
 const r=results.hyperrag,ready=r&&!r.pending&&!r.error&&r.graph,g=ready?r.graph:null;
 renderClinical(r);
 $('[data-dash-tab="search"]').classList.toggle('has-selection',selectedEdges.length>0); // details of a selected relation wait in this tab
 const docs=new Set([...(r?.documents||[]).map(d=>d.id),...(g?.evidenceDocuments||[]).map(d=>d.id)]),s=r?.citationStats;
 $('#dash-search-meta').textContent=g?`관계 ${g.hyperedges.length} · 원문 ${docs.size}`:'';
 $('#dash-kpis').innerHTML='<h4>검색된 근거</h4>'+(!r?'<p class="hint">질문을 보내면 검색된 관계와 원문 수를 보여 줍니다.</p>':r.pending?'<p class="hint">근거를 찾는 중입니다…</p>':r.error?'<p class="hint">답변을 완료하지 못했습니다.</p>':`<div class="kpis"><div><b>${g?.hyperedges.length??0}</b><span>관계</span></div><div><b>${g?.nodes.length??0}</b><span>개체</span></div><div><b>${docs.size}</b><span>원문</span></div><div><b>${s?.sentences?`${s.cited}/${s.sentences}`:'-'}</b><span>출처 표시 문장</span></div></div>`);
 // 추가 약 검토
 const card=$('#dash-added');card.hidden=!review?.added;
 if(review?.added){
  const c=review.added,cNodes=g?medNodes(c,g):[],all=g?edgesWith(g,cNodes):[];
  let body=`<div class="review-line">${review.meds.map(m=>`<span>${esc(m)}</span>`).join('')}<i>＋</i><span class="added">${esc(c)}</span></div>`;
  if(!g)body+='<p class="hint">답변이 끝나면 추가 약과 연결된 관계를 보여 줍니다.</p>';
  else if(!cNodes.length)body+=`<p class="hint">검색된 관계에서 '${esc(c)}'${josa(c,'을','를')} 찾지 못했습니다. 근거가 없다는 뜻이며, 안전하다는 뜻은 아닙니다.</p>`;
  else{const rows=review.meds.map(m=>{const list=edgesWith(g,cNodes,medNodes(m,g));return {name:`${c} ↔ ${m}`,count:list.length,list,pressed:list.length&&sameSelection(list)};});
   rows.push({name:`${c} 관련 전체`,count:all.length,list:all,pressed:all.length&&sameSelection(all)});
   body+=`<p class="hint">추가 약이 들어간 관계 레코드 수입니다. 누르면 가운데 관계도에 그 관계만 보입니다.</p>${bars(rows,Math.max(...rows.map(x=>x.count)),'data-added-row')}`;
   card._rows=rows;}
  card.innerHTML=`<h4>추가 약의 관계</h4>${body}${g&&cNodes.length?'<div class="dash-buttons"><button type="button" id="show-all-edges">전체 관계 보기</button></div>':''}`;
  card.querySelectorAll('[data-added-row]').forEach(b=>b.onclick=()=>{const row=card._rows[+b.dataset.addedRow];selectSet(sameSelection(row.list)?[]:row.list);});
  const all2=$('#show-all-edges');if(all2)all2.onclick=()=>selectSet([]);
 }
 // 약물 쌍 연결
 const meds2=$('#dash-meds');
 if(!g)meds2.innerHTML='<h4>약물 연결</h4><p class="hint">질문에 나온 약 사이의 관계 수를 보여 줍니다.</p>';
 else{const names=[...new Set(focusNames(r,g))].slice(0,6),groups=names.map(n=>({name:n,nodes:medNodes(n,g)})),rows=[];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const list=groups[i].nodes.length&&groups[j].nodes.length?edgesWith(g,groups[i].nodes,groups[j].nodes):[];rows.push({name:`${groups[i].name} ↔ ${groups[j].name}`,count:list.length,list,pressed:list.length&&sameSelection(list)});}
  rows.sort((a,b)=>b.count-a.count);meds2._rows=rows;
  meds2.innerHTML=`<h4>약물 연결</h4><p class="hint">두 약이 같은 관계 레코드에 함께 들어 있는 수입니다. 위험도가 아닙니다.</p>${rows.length?bars(rows.slice(0,10),Math.max(1,...rows.map(x=>x.count)),'data-pair-row'):'<p class="hint">비교할 약이 2개 이상 필요합니다. 왼쪽 복용 약에 넣어 보세요.</p>'}`;
  meds2.querySelectorAll('[data-pair-row]').forEach(b=>b.onclick=()=>{const row=meds2._rows[+b.dataset.pairRow];selectSet(sameSelection(row.list)?[]:row.list);});}
 // 근거 출처 구성
 const src=$('#dash-sources');
 if(!g)src.innerHTML='<h4>검색된 원문의 출처</h4><p class="hint">DUR, 허가정보, 복약정보, 문헌 중 어디에서 근거가 나왔는지 보여 줍니다.</p>';
 else{const byId=new Map();for(const d of [...(r.documents||[]),...(g.evidenceDocuments||[])])if(!byId.has(d.id))byId.set(d.id,d.sourceLabel||'출처 미표기');
  const counts=new Map();for(const label of byId.values())counts.set(label,(counts.get(label)||0)+1);
  const rows=[...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  src.innerHTML=`<h4>검색된 원문의 출처 <small class="muted">${byId.size}건</small></h4><p class="hint">질문으로 검색된 원문 전체입니다. 질문과 관계없는 약의 문서도 섞여 있을 수 있습니다.</p>${rows.length?bars(rows,Math.max(...rows.map(x=>x.count))).replace('class="bars"','class="bars wrap"'):'<p class="hint">연결된 원문이 없습니다.</p>'}`;}
}
function focusAdded(){const list=addedEdges(fullGraph||currentGraph);selectedEdges=list.slice();}

// ---- composer, sidebar, account menu, settings ----
function autoGrow(){const t=$('#question');t.style.height='auto';t.style.height=Math.min(t.scrollHeight,220)+'px';}
$('#question').addEventListener('input',autoGrow);
function setSidebarWidth(px){const w=Math.max(220,Math.min(420,Math.round(px)));shell.style.setProperty('--sidebar-w',w+'px');try{localStorage.setItem('galyaksi-sidebar-w',String(w));}catch{}}
try{const saved=Number(localStorage.getItem('galyaksi-sidebar-w'));if(saved)setSidebarWidth(saved);}catch{}
const resizer=$('#sidebar-resizer');
resizer.onpointerdown=e=>{e.preventDefault();resizer.setPointerCapture(e.pointerId);document.body.classList.add('resizing');const startX=e.clientX,startW=$('#sidebar').getBoundingClientRect().width;resizer.onpointermove=m=>setSidebarWidth(startW+m.clientX-startX);resizer.onpointerup=()=>{resizer.onpointermove=null;document.body.classList.remove('resizing');};};
resizer.ondblclick=()=>setSidebarWidth(264);
resizer.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();setSidebarWidth($('#sidebar').getBoundingClientRect().width+(e.key==='ArrowRight'?16:-16));};
// Drag, keyboard arrows and double-click reset for the conversation/map divider.
const chatResizer=$('#chat-resizer');
function setChatWidth(px){
 const width=$('#workspace').getBoundingClientRect().width||1400,wide=window.innerWidth>1180;
 const max=Math.max(280,Math.min(720,width-(wide?$('#dashboard').getBoundingClientRect().width:0)-328));
 const w=Math.max(280,Math.min(max,Math.round(px)));$('#workspace').style.setProperty('--chat-w',w+'px');chatResizer.setAttribute('aria-valuenow',String(w));chatResizer.setAttribute('aria-valuemax',String(max));
 try{localStorage.setItem('hyperrx-chat-w',String(w));}catch{}
}
try{const saved=Number(localStorage.getItem('hyperrx-chat-w'));if(saved)setChatWidth(saved);}catch{}
chatResizer.onpointerdown=e=>{e.preventDefault();chatResizer.setPointerCapture(e.pointerId);document.body.classList.add('resizing-chat');const x=e.clientX,w=$('#chat-panel').getBoundingClientRect().width;chatResizer.onpointermove=m=>setChatWidth(w+m.clientX-x);};
const endChatResize=()=>{chatResizer.onpointermove=null;document.body.classList.remove('resizing-chat');};
chatResizer.onpointerup=endChatResize;chatResizer.onpointercancel=endChatResize;chatResizer.onlostpointercapture=endChatResize;
chatResizer.ondblclick=()=>setChatWidth(370);
chatResizer.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();setChatWidth(e.key==='Home'?370:$('#chat-panel').getBoundingClientRect().width+(e.key==='ArrowRight'?16:-16));};
window.addEventListener('resize',()=>{if(!$('#workspace').hidden&&window.innerWidth>900)setChatWidth($('#chat-panel').getBoundingClientRect().width);});
// Divider between the relation map and the evidence dashboard. Moving it left widens the dashboard.
// CSS also caps the column so the map keeps at least 360px when the window is narrow.
const DASH_W={min:300,max:760,base:350},dashResizer=$('#dash-resizer');
function dashMax(){const ws=$('#workspace').getBoundingClientRect().width;return ws?Math.max(DASH_W.min,Math.min(DASH_W.max,ws-$('#chat-panel').getBoundingClientRect().width-360)):DASH_W.max;}
function setDashWidth(px){const w=Math.max(DASH_W.min,Math.min(dashMax(),Math.round(px)));$('#workspace').style.setProperty('--dash-w',w+'px');dashResizer.setAttribute('aria-valuenow',String(w));try{localStorage.setItem('galyaksi-dash-w',String(w));}catch{}}
try{const saved=Number(localStorage.getItem('galyaksi-dash-w'));if(saved)setDashWidth(saved);}catch{}
const dashWidth=()=>$('#dashboard').getBoundingClientRect().width;
dashResizer.onpointerdown=e=>{e.preventDefault();dashResizer.setPointerCapture(e.pointerId);document.body.classList.add('resizing-dash');const startX=e.clientX,startW=dashWidth();dashResizer.onpointermove=m=>setDashWidth(startW-(m.clientX-startX));dashResizer.onpointerup=()=>{dashResizer.onpointermove=null;document.body.classList.remove('resizing-dash');};};
dashResizer.ondblclick=()=>setDashWidth(DASH_W.base);
dashResizer.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();setDashWidth(dashWidth()+(e.key==='ArrowLeft'?16:-16));};
// G6's autoResize only follows window resizes, so column changes from either divider resize the 2D map here (3D has its own observer).
let mapResizeFrame=0;
new ResizeObserver(()=>{cancelAnimationFrame(mapResizeFrame);mapResizeFrame=requestAnimationFrame(()=>{const box=$('#graph');if(dimension==='2d'&&graph&&!graph.destroyed&&box.clientWidth&&box.clientHeight)try{graph.resize();}catch{}});}).observe($('#graph'));
$('#sidebar-toggle').onclick=()=>{if(narrow()){shell.classList.toggle('open');return;}const on=!shell.classList.contains('rail');if(!document.body.classList.contains('home'))railChoice=on;setRail(on);};
const accountButton=$('#account-button'),accountMenu=$('#account-menu');
function setMenu(open){accountMenu.hidden=!open;accountButton.setAttribute('aria-expanded',String(open));if(open)accountMenu.querySelector('button')?.focus();}
accountButton.onclick=e=>{e.stopPropagation();setMenu(accountMenu.hidden);};
document.addEventListener('click',e=>{if(!accountMenu.hidden&&!accountMenu.contains(e.target)&&!accountButton.contains(e.target))setMenu(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!accountMenu.hidden){setMenu(false);accountButton.focus();}});
accountMenu.addEventListener('click',e=>{if(e.target.closest('button'))setMenu(false);});
function syncAccount(){$('#account-mode').textContent=$('#execution').value==='demo'?'예시 데이터':'실제 연결';}
$('#execution').addEventListener('change',()=>{syncAccount();renderMeds();});
async function openSettings(){const d=$('#settings-dialog');if(!d.open){renderKeys();d.showModal();}
 try{const s=await(await fetch('/api/status')).json();serverStatus=s;$('#settings-db').innerHTML=`검색 DB: <b>${s.db?.ready?`연결됨 · 문서 ${s.db.documents.toLocaleString()}건`:s.backend?'주소 설정됨 · DB 서버 확인 필요':'연결 안 됨'}</b><br>OpenAI API: <b>${openaiState(s)}</b> · 모델 <b>${esc(s.model)}</b>`;keyStatus();}catch{$('#settings-db').textContent='로컬 서버 상태를 확인하지 못했습니다.';}}
$('#open-settings').onclick=openSettings;$('#settings-button').onclick=openSettings;
// 설정 › API 키. The fields show what this browser keeps; saving checks only the form (the service itself says whether
// a key works, and a wrong key comes back as the answer's message with these fields open).
function renderKeys(){
 for(const kind of ['openai','mfds']){const input=$(`#${kind}-key`);input.value=keys.key(kind);input.type='password';input.removeAttribute('aria-invalid');$(`#${kind}-key-error`).hidden=true;}
 $$('.key-show').forEach(b=>{b.setAttribute('aria-pressed','false');b.textContent='보기';});
 $('#remember-keys').checked=keys.remembered();keyStatus();
}
function keyStatus(message='',lead=''){
 const s=serverStatus,own=keys.key('openai'),el=$('#key-status');el.classList.toggle('need',!!message);
 el.innerHTML=message?esc(message):esc(lead)+(own?`내 OpenAI 키(<b>${esc(maskKey(own))}</b>)로 답변합니다.`:s?.openai?'이 서버에 설정된 OpenAI 키로 답변합니다. 내 키를 넣으면 내 키를 먼저 씁니다.':s?.keyMode==='user'?'이 서버에서는 질문하는 사람이 자기 OpenAI API 키를 넣어야 실제 답변을 받을 수 있습니다.':'OpenAI API 키를 넣으면 실제 답변을 받을 수 있습니다. 예시 데이터는 키 없이 볼 수 있습니다.');
}
async function openKeySettings(message){await openSettings();keyStatus(message);$('#key-section').scrollIntoView({block:'start'});$('#openai-key').focus();}
// Labels already fetched (or refused) without the new key are asked again.
function forgetLabels(){labelCache.clear();if(explorerSelection)renderExplorer();}
$$('.key-show').forEach(b=>b.onclick=()=>{const input=$('#'+b.dataset.show),show=input.type==='password';input.type=show?'text':'password';b.setAttribute('aria-pressed',String(show));b.textContent=show?'숨기기':'보기';});
$('#key-form').onsubmit=e=>{
 e.preventDefault();
 const typed={openai:$('#openai-key').value.trim(),mfds:$('#mfds-key').value.trim()};let first=null;
 for(const kind of ['openai','mfds']){const problem=keyProblem(kind,typed[kind]),input=$(`#${kind}-key`),err=$(`#${kind}-key-error`);input.setAttribute('aria-invalid',String(!!problem));err.hidden=!problem;err.textContent=problem;if(problem&&!first)first=input;}
 if(first)return first.focus();
 const mfdsChanged=typed.mfds!==keys.key('mfds');keys.save(typed,$('#remember-keys').checked);if(mfdsChanged)forgetLabels();
 let lead='저장했습니다. ';
 if(typed.openai&&serverStatus?.db?.ready&&$('#execution').value==='demo'){$('#execution').value='live';syncDemoScale();syncAccount();renderMeds();lead+='실행 모드를 실제 연결로 바꿨습니다. ';}
 renderKeys();keyStatus('',lead);
};
$('#clear-keys').onclick=()=>{const hadMfds=!!keys.key('mfds');keys.clear();if(hadMfds)forgetLabels();renderKeys();keyStatus('','이 브라우저에 저장한 키를 지웠습니다. ');};
$('#close-settings').onclick=()=>$('#settings-dialog').close();
$$('[data-theme-choice]').forEach(b=>b.onclick=()=>setTheme(b.dataset.themeChoice));
$('#open-guide').onclick=()=>$('#guide-dialog').showModal();$('#close-guide').onclick=()=>$('#guide-dialog').close();
$('#clear-history').onclick=()=>{history.length=0;historyIndex=-1;$('#settings-dialog').close();newQuestion();};
// Collapsed dashboard sections are printed open, then restored.
let printOpened=[];
addEventListener('beforeprint',()=>{printOpened=$$('#dashboard details:not([open])');printOpened.forEach(d=>d.open=true);});
addEventListener('afterprint',()=>{printOpened.forEach(d=>d.open=false);printOpened=[];});
$('#print-report').onclick=()=>{$('#print-meta').textContent=`· ${new Date().toLocaleString('ko-KR')} · ${runDemo?'예시 데이터':'실제 DB'}`;window.print();};
$('#open-docs').onclick=()=>tab('documents');
setDashboardMode(dashboardMode);setTheme(isDark()?'dark':'light');syncAccount();renderMeds();renderAnswers();renderDashboard();$('#question').focus();
