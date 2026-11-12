// 노드 사전: what the 약물관계 설명 panel shows when a node (an asked drug or another entity) is chosen on a map
// (2026-11-09). Top to bottom: the headword and its kind; under a rule, the DB's description of it in full, each sentence
// with the numbers of the records it most likely came from (entity_notes.py matches them; the DB keeps no sentence-level
// source); the asked drug's DUR records; the source sentences that name it word for word; the relations of this question
// it belongs to. Nothing is written by the service; a part with nothing to show is left out.
import {esc,sentenceSpans,INFO_ICON,sourceName} from './sources.js';
import {edgeSources} from './edge-list.js';
import {icon,joinWrapped,sourceRow} from './xai-panel.js';
import {relationColor} from './colors.js';

// The DB's entity types, in words a reader knows.
export const NODE_KIND={ACTIVE_INGREDIENT:'성분',DRUG_PRODUCT:'제품',DRUG_CLASS:'약 계열',ADVERSE_EVENT:'이상반응',PATIENT_GROUP:'환자군',DISEASE_OR_CONDITION:'질환·상태',CLINICAL_ACTION:'임상 조치',ADDITIONAL_PROPERTIES:'기타 속성'};
export const DESC_NOTE='HyperRx가 데이터베이스의 내용을 바탕으로 요약한 정보입니다.';
const TOPIC_SHOWN=4;  // sentences shown per topic before "n문장 더 보기"
const isDur=d=>/DUR/.test(d?.sourceShort||d?.sourceLabel||d?.source_short||'');
const squash=s=>String(s||'').replace(/\s+/g,'');
const nameRe=n=>new RegExp([...squash(n)].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),'i');
const cut=(s,n)=>{s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
// 이/가 after a word: "이트라코나졸이", "고령자가"; a word not ending in Hangul gets "이(가)".
export function iga(word){const c=String(word||'').trim().slice(-1).charCodeAt(0)-0xAC00;return c>=0&&c<11172?(c%28?'이':'가'):'이(가)';}
// A description cut to the last sentence that fits (the map's tip); only a first sentence longer than n is cut with '…'.
export function clipSentence(text,n){
 text=String(text??'').trim();if(text.length<=n)return text;
 let end=0;for(const m of text.matchAll(/[.!?](?=\s|$)/g)){if(m.index>=n)break;end=m.index+1;}
 return end?text.slice(0,end):text.slice(0,n).trimEnd()+'…';
}
// Where a record comes from, written out: "의약품안전사용서비스(DUR) 병용금기", "의약품 제품 허가정보(복합제) · 트윈스타정 · 사용상의 주의사항".
function recordWhere(doc,text=''){
 if(isDur(doc))return `의약품안전사용서비스(DUR) ${doc.category||''}`.trim();
 const combo=/주성분:[^|\]]*;/.test(text)||/\([^()]*,[^()]*\)/.test(doc?.title||''),[product,section]=String(doc?.title||'').split(' — ');
 return [`${sourceName(doc)}${combo?'(복합제)':''}`,product,section].filter(Boolean).join(' · ');
}
export const NODE_GUIDE=`<details class="xp-info"><summary title="노드 설명 보는 법" aria-label="노드 설명 보는 법">${INFO_ICON}</summary><div class="xp-info-body"><p>약이면 구분선 아래에 의약품안전나라(식품의약품안전처)의 허가정보를 그대로 보여 줍니다. 같은 성분의 제품이 여러 개이면 허가사항이 가장 최근에 바뀐 제품을 먼저 보여 주고, '다른 제품 보기'에서 바꿀 수 있습니다.</p><p>약이 아니거나 허가정보를 찾지 못하면 HyperRx 요약을 보여 줍니다. HyperRx 요약은 데이터베이스의 내용을 바탕으로 정리한 정보이며, 원자료의 문장을 그대로 옮긴 것이 아닙니다.</p><p>'한눈에 보기'는 요약에 나오는 약, 이상반응, 환자군 이름을 종류별로 모은 것이고, 그 아래는 요약 문장을 주제별로 나눈 것입니다. 주제는 HyperRx가 문장에 든 낱말(병용, 용량, 임부 등)을 보고 나눈 것이며, 문장은 고치지 않았습니다.</p><p>설명 문장 끝의 번호는 그 문장과 낱말(다른 약 이름, 용량, 이상반응 등)이 가장 많이 겹치는 원자료입니다. 데이터베이스는 요약의 각 문장을 어느 원자료에서 만들었는지 기록하지 않기 때문에, HyperRx가 원자료와 대조해 찾은 것입니다. 번호를 누르면 원자료에서 그 문장이 표시되고, 번호가 없는 문장은 대조할 원자료를 찾지 못한 문장입니다.</p><p>'의약품안전사용서비스(DUR)에 따른 분류'는 DUR 성분정보를 그대로 옮긴 것입니다. '원자료 확인하기'는 이 질문의 관계 원자료 중 이 항목이 나오는 문장을 그대로 옮긴 것이며, '근거 n'을 누르면 원자료에서 그 문장이 표시됩니다. 관계를 누르면 그 관계의 약물관계 설명으로 갑니다.</p><p>관계에 함께 들었다는 것이 직접적인 약물 상호작용이 있다는 뜻은 아니며, 기록이 없다는 것은 안전하다는 뜻이 아닙니다.</p></div></details>`;

// The DB's description as the map holds it (no record numbers): its Korean paragraphs, or all when none is Korean, the one
// that speaks of the entry itself first.
export function descParagraphs(nodes,name){
 const parts=nodes.flatMap(n=>String(n.description||'').split(/<SEP>|\n\s*\n/)).map(t=>t.trim()).filter(Boolean).filter((t,i,a)=>a.indexOf(t)===i);
 const ko=parts.filter(p=>(p.match(/[가-힣]/g)||[]).length>=squash(p).length*0.3),pool=ko.length?ko:parts;
 const own=pool.filter(p=>squash(p).startsWith(squash(name)));
 return [...own,...pool.filter(p=>!own.includes(p))].map(p=>({sentences:p.split(/(?<=[.!?])\s+/).filter(Boolean).map(text=>({text,sources:[]}))}));
}
// The same from /api/entity, each sentence with its records.
function entryParagraphs(entry,name){
 const all=(entry?.paragraphs||[]).filter(p=>p.sentences?.length),ko=all.filter(p=>p.lang==='ko'),pool=ko.length?ko:all;
 const own=pool.filter(p=>squash(p.sentences[0].text).startsWith(squash(name)));
 return [...own,...pool.filter(p=>!own.includes(p))];
}
// The summary laid out by topic (2026-11-10): each sentence goes under one heading by its own words, the first rule that
// fits; the sentences stay word for word with their record numbers. A drug and another entry get their own headings.
const DRUG_TYPES=new Set(['ACTIVE_INGREDIENT','DRUG_PRODUCT']);
const TOPICS=[
 {key:'what',icon:'book',drug:'어떤 약인가요',other:'무엇인가요'},
 {key:'action',icon:'flask',drug:'작용 방식',other:'작용 방식'},
 {key:'drugs',icon:'pair',drug:'함께 쓸 때 주의할 약',other:'관련된 약'},
 {key:'dose',icon:'check',drug:'용량·투여',other:'용량·투여'},
 {key:'patient',icon:'user',drug:'주의할 환자',other:'주의할 환자'},
 {key:'effect',icon:'alert',drug:'이상반응',other:'증상과 경과'},
 {key:'other',icon:'detail',drug:'그 밖의 설명',other:'그 밖의 설명'}];
const PATIENT=/임부|임신|임산부|수유|고령|노인|소아|어린|연령|\d+\s*세|신기능|간기능|신장애|간장애|심부전/;
// A dose is a number with its unit or a schedule; "고용량 사용" is not a dose statement.
const DOSE=/\d+(?:\.\d+)?\s*(?:mg|㎎|밀리그램)|1일\s*\d+\s*회|투여량/i;
const WITH=/병용|함께\s*(?:사용|복용|투여|쓰)|상호작용/;
const ACTION=/CYP|P-?gp|BCRP|억제제|저해제|유도제|억제(?:한다|하여|하는|하며)|대사|기전/i;
const EFFECT=/증상|통증|무력|수치|손상|나타날|발생/;
const WHAT=/치료제|치료에|사용되는|사용된다|사용됩니다|계열/;
// terms: the entity names the DB server found in the sentence ({name,type}); without them (no lookup yet) the words decide.
// first: the summary's first sentence, which says what the entry is when it starts with its name ("횡문근융해증은 …
// 근육병증으로, … 언제든지 발생할 수 있다").
export function topicOf(text,name,terms=null,first=false){
 const t=String(text||''),drugs=terms?terms.some(x=>DRUG_TYPES.has(x.type)):true,named=squash(t).startsWith(squash(name));
 if(PATIENT.test(t))return 'patient';
 if(WITH.test(t)&&drugs)return 'drugs';
 if(DOSE.test(t))return 'dose';
 if(first&&named)return 'what';
 // "…치료제로 사용되는 약물로, HMG-CoA 환원효소 억제제에 해당한다": what it is, though it names an 억제제.
 if(WHAT.test(t))return 'what';
 if(ACTION.test(t))return 'action';
 if(named&&!EFFECT.test(t))return 'what';
 if(EFFECT.test(t))return 'effect';
 return 'other';
}
// What the summary says the drug does to others, word for word: "CYP3A4의 강력한 억제제", "P-gp의 강력한 저해제".
export function actionTags(sentences){
 const out=[];
 for(const s of sentences)for(const m of String(s.text).matchAll(/(?:CYP\s*[0-9A-Z]+|P-?gp|P-?당단백|BCRP)[^,.]{0,14}?(?:억제제|저해제|유도제|기질)/gi))if(!out.some(x=>squash(x)===squash(m[0])))out.push(m[0]);
 return out;
}
// 의약품안전나라 허가정보 (mfds-label.mjs, 2026-11-10): the approved label of one product of the drug, word for word and said
// to be from 의약품안전나라; the HyperRx summary folds below it.
const LABEL_NOTE='의약품안전나라(식품의약품안전처)에 실린 허가정보를 그대로 옮겼습니다. 식약처가 공공데이터포털에 제공하는 \'의약품 제품 허가정보\' 서비스로 조회했습니다.';
export const NEDRUG_SEARCH='https://nedrug.mfds.go.kr/searchDrug?searchYn=true&itemName=';
const PRODUCT_GROUPS=[['inUse','사용 중'],['export','수출용'],['ended','취하·유효기간만료']];
const safeUrl=u=>/^https:\/\/nedrug\.mfds\.go\.kr\//.test(String(u||''))?String(u):'';
const blocksHTML=blocks=>blocks.map(b=>b.kind==='table'?`<div class="xn-table">${b.html}</div>`:`<p>${esc(b.text)}</p>`).join('');
// Numbered items of a label document ("1. 칸디다성 질염", "2) 어루러기"), from its article titles or its paragraphs.
export function labelItems(sections){
 const out=[];
 for(const s of sections||[])for(const a of s.articles){
  for(const t of [a.title,...a.blocks.filter(b=>b.kind==='p').map(b=>b.text)])if(/^\d+\.\s*\S/.test(t||''))out.push(t.replace(/^\d+\.\s*/,'').split(/\s*:\s*/)[0]);
 }
 return out;
}
function docHTML(sections,open=()=>false){
 return (sections||[]).map(s=>`${s.title?`<p class="xn-doc-sub">${esc(s.title)}</p>`:''}${s.articles.map(a=>{
  const body=blocksHTML(a.blocks);
  if(!body)return a.title?`<p class="xn-art-plain">${esc(a.title)}</p>`:'';
  if(!a.title)return body;
  return `<details class="xn-art"${open(a.title)?' open':''}><summary>${esc(a.title)}</summary><div class="xn-art-body">${body}</div></details>`;
 }).join('')}`).join('');
}
export function labelHTML(label,{labelKey=''}={}){
 // The day it was read, in the reader's own time zone (the server keeps UTC: 15:33Z is the next morning in Korea).
 const at=new Date(label.fetchedAt||''),day=isNaN(at)?'':`${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`;
 const p=label.product,url=safeUrl(p.url);
 const amount=p.material.map(m=>`${m.name} ${m.amount} ${m.unit}`.trim()).join(', ');
 const uses=labelItems(p.docs.ee);
 // The product's facts as one table under its name (2026-11-10: four tiles left too much empty space): a muted label
 // on the left, the value on the right, a thin line between rows.
 const total=p.material[0]?.total?p.material[0].total.replace(/\s*중$/,'')+' 중':'';
 const facts=[['성분·함량',amount&&`${esc(amount)}${total?`<small> · ${esc(total)}</small>`:''}`],
  ['효능효과',uses.length&&`${uses.slice(0,3).map(u=>esc(cut(u,30))).join(' · ')}${uses.length>3?`<small> 외 ${uses.length-3}개</small>`:''}`],
  ['구분',esc([p.kind,p.atc&&`ATC ${p.atc}`].filter(Boolean).join(' · '))],
  ['허가',p.permitDate&&`${esc(p.permitDate)}${p.changeDate?`<small> · 최종 변경 ${esc(p.changeDate)}</small>`:''}`]].filter(([,v])=>v);
 // 제품 선택 (2026-11-10): every product of the ingredient in a select at the top of the card, in groups: 사용 중, 수출용,
 // 취하·유효기간만료. Picking one shows its label; picking the first again goes back to it.
 const listed=label.products?.length?[...label.products]:[];
 if(!listed.some(o=>o.itemSeq===p.itemSeq))listed.unshift({itemSeq:p.itemSeq,name:p.name,company:p.company,status:p.status,group:p.status&&p.status!=='정상'?'ended':p.exportOnly?'export':'inUse'});
 const opt=o=>`<option value="${esc(o.itemSeq)}"${o.itemSeq===p.itemSeq?' selected':''}>${esc(cut(o.name,34))} · ${esc(o.company)}${o.group==='ended'&&o.status?` · ${esc(o.status)}`:''}</option>`;
 const select=`<label class="xn-pselect"><span>제품 선택</span><select data-label-product data-label-key="${esc(labelKey)}" data-label-default="${esc(label.defaultSeq||'')}">${PRODUCT_GROUPS.map(([g,t])=>{const xs=listed.filter(o=>(o.group||'inUse')===g);return xs.length?`<optgroup label="${t} ${xs.length}개">${xs.map(opt).join('')}</optgroup>`:'';}).join('')}</select></label>`;
 const ended=p.status&&p.status!=='정상'?` · <b class="xn-pstat">${esc(p.status)}${p.endDate?` ${esc(p.endDate)}`:''}</b>`:'';
 const why=label.chosen?'직접 고른 제품입니다.':label.count>1?`사용 중인 제품 ${label.count}개 중 허가사항이 가장 최근에 바뀐 제품을 먼저 보여 줍니다.`:label.count===1?'사용 중인 제품은 이 제품 하나입니다.':'사용 중인 제품이 없어 수출용이거나 허가가 끝난 제품을 보여 줍니다.';
 const open=t=>/경고|투여하지 말 것/.test(t);
 const card=(ic,title,body)=>body?`<section class="xn-topic"><h5>${icon(ic,16)}${esc(title)}</h5><div class="xn-doc">${body}</div></section>`:'';
 const basics=[['성상',p.chart],['저장방법',p.storage],['사용기간',p.validTerm],['포장',p.pack]].filter(([,v])=>v);
 return `<div class="xn-src"><span class="xn-src-badge">의약품안전나라</span><span>식품의약품안전처 허가정보${day?` · ${esc(day)} 조회`:''}</span></div>`+
  `<div class="xn-pcard"><div class="xn-product">${select}<div class="xn-pmeta"><small><span class="xn-nw">품목기준코드 ${esc(p.itemSeq)}</span>${p.exportOnly?' · 수출용':''}${ended}</small>${url?`<a class="xai-go" href="${esc(url)}" target="_blank" rel="noopener noreferrer">의약품안전나라에서 보기${icon('open',13)}</a>`:''}</div></div>`+
  (facts.length?`<dl class="xn-facts">${facts.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`:'')+`</div>`+
  `<p class="xn-pick">${esc(why)}</p>`+
  card('book','효능효과',docHTML(p.docs.ee))+card('check','용법용량',docHTML(p.docs.ud,()=>true))+card('alert','사용상의 주의사항',docHTML(p.docs.nb,open))+
  card('detail','성상·보관',basics.length?`<dl class="xn-dict">${basics.map(([k,v])=>`<dt>${esc(k)}</dt><dd><span>${esc(v)}</span></dd>`).join('')}</dl>`:'')+
  `<p class="xn-gloss-note">${esc(LABEL_NOTE)}</p>`;
}
// An asked drug's own DUR records (the rule lookup's flags), as the entries of a dictionary: what each says, word for word.
const FLAG_ORDER=['효능군중복','임부금기','특정연령대금기','노인주의','용량주의','투여기간주의','서방형정제분할주의'];
const unq=s=>String(s||'').replace(/^"+|"+$/g,'').trim();
function flagRow(f){
 const d=unq(f.detail);
 if(f.category==='효능군중복')return {what:'효능군',value:`${f.group||''}${f.family?` · ${f.family}`:''}`,mark:f.group||f.family||''};
 if(f.category==='임부금기')return {what:'임부금기',value:[f.grade,d].filter(Boolean).join(' · ')||'기록 있음',mark:d||f.grade||''};
 if(f.category==='특정연령대금기')return {what:'연령 금기',value:[f.age,d].filter(Boolean).join(' · ')||'기록 있음',mark:f.age||d||''};
 if(f.category==='용량주의')return {what:'최대 투여량',value:f.max_dose||d||'기록 있음',mark:f.max_dose||d||''};
 return {what:f.category==='노인주의'?'노인주의':f.category,value:d||'기록 있음',mark:d||''};
}

// label: /api/label's answer ({product,others,…}), {pending:true} or {error:true,message}; null for an entry that is not a drug.
export function nodeHTML(graph,selection,{drugs=[],citations=[],palette=[],clinical=null,part='all',entry=null,label=null,labelKey=''}={}){
 if(!graph||selection?.kind!=='node')return '';
 const ids=selection.ids||[selection.id],nodes=graph.nodes.filter(n=>ids.includes(n.id));if(!nodes.length)return '';
 const name=selection.name||nodes[0].label||nodes[0].id,asked=drugs.find(d=>ids.some(id=>d.ids?.has(id)));
 const labelOf=id=>graph.nodes.find(n=>n.id===id)?.label||id,cited=new Set((citations||[]).map(c=>c.id));
 const edges=graph.hyperedges.map((e,i)=>({e,i})).filter(({e})=>e.members.some(id=>ids.includes(id)));
 // The relations it is in: the ones the answer cited first, then the ones joining more asked drugs, then the smaller ones.
 const rels=edges.map(({e,i})=>{const rows=edgeSources(e,graph);return {e,i,rows,cited:rows.some(r=>cited.has(r.id)),hits:drugs.filter(d=>e.members.some(id=>d.ids?.has(id))).length,others:[...new Set(e.members.filter(id=>!ids.includes(id)).map(labelOf))]};})
  .sort((a,b)=>b.cited-a.cited||b.hits-a.hits||a.e.members.length-b.e.members.length);
 // Every record of those relations once, with the excerpt the relation was drawn from.
 const recs=[],seenRec=new Set();
 for(const {e,rows} of rels)for(const r of rows){if(seenRec.has(r.id))continue;seenRec.add(r.id);const span=e.sourceSpans?.find(s=>s.id===r.id);recs.push({id:r.id,doc:r.doc,text:joinWrapped(span?.excerpt??r.doc.excerpt??''),cited:cited.has(r.id)});}
 const names=asked?[asked.name,...(asked.aliases||[])]:[name];
 const cd=asked?(clinical?.drugs||[]).find(d=>[d.name,...(d.aliases||[])].some(n=>names.some(x=>squash(x).toLowerCase()===squash(n).toLowerCase()))):null;
 const flags=(cd?.flags||[]).filter(f=>f.chunk_id).sort((a,b)=>(FLAG_ORDER.indexOf(a.category)+99)%99-(FLAG_ORDER.indexOf(b.category)+99)%99);
 const paras=entry?.paragraphs?entryParagraphs(entry,name):descParagraphs(nodes,name);
 // The summary's sentences under their topics, in the topics' order.
 const isDrug=!!asked||DRUG_TYPES.has(nodes[0].type)||nodes[0].type==='DRUG_CLASS',all=paras.flatMap(p=>p.sentences);
 // A drug with its 의약품안전나라 허가정보 shows only that (2026-11-10: the HyperRx summary folded under it is gone); the
 // summary stays for an entry that is not a drug and for a drug whose label could not be read.
 const topics=label?.product?[]:TOPICS.map(t=>({...t,label:isDrug?t.drug:t.other,sentences:all.filter((s,i)=>topicOf(s.text,name,s.terms||null,i===0)===t.key)})).filter(t=>t.sentences.length);
 // One numbering for the panel and its 근거 및 출처 tab, top to bottom: the summary's records (in the order the topics
 // show them), the DUR records, the relations' records.
 const reg=[],add=(id,doc,group)=>{if(!reg.some(x=>x.id===id))reg.push({no:reg.length+1,id,doc,group,own:group==='rel',sections:new Set()});};
 const entryDocs=new Map((entry?.documents||[]).map(d=>[d.id,{title:d.title,sourceLabel:d.source_label,sourceShort:d.source_short,category:d.category}]));
 for(const t of topics)for(const s of t.sentences)for(const x of s.sources)add(x.id,entryDocs.get(x.id)||{title:x.id},'desc');
 for(const f of flags)add(f.chunk_id,{title:`${cd.name} — ${f.category}`,sourceShort:'DUR 성분정보',category:f.category},'dur');
 for(const r of recs)add(r.id,r.doc,'rel');
 const no=id=>reg.find(x=>x.id===id)?.no;
 if(part==='sources'){
  if(!reg.length&&!label?.product)return '<p class="hint">이 항목에 연결된 원자료가 없습니다.</p>';
  const group=(g,title)=>reg.some(x=>x.group===g)?`<p class="xai-group">${title}</p>${reg.filter(x=>x.group===g).map(x=>sourceRow(x,new Map())).join('')}`:'';
  const lp=label?.product,lurl=safeUrl(lp?.url);
  const nedrug=lp?`<p class="xai-group">의약품안전나라 허가정보</p><div class="xs-row"><div class="xs-main"><span class="es-no">허가정보</span><strong>${esc(lp.name)}</strong><small>${esc(['의약품안전나라 · 식품의약품안전처',lp.company,`품목기준코드 ${lp.itemSeq}`].join(' · '))}</small></div>${lurl?`<a class="es-btn" href="${esc(lurl)}" target="_blank" rel="noopener noreferrer">의약품안전나라에서 보기${icon('open',13)}</a>`:''}</div>`:'';
  return `<div class="xai xai-sources-tab"><p class="hint">${esc(name)}의 근거 ${reg.length}건입니다. 번호는 노드 설명의 번호와 같습니다.</p>${nedrug}${group('desc','설명 문장의 원자료')}${group('dur','의약품안전사용서비스(DUR)에 따른 분류')}${group('rel',`${esc(name)}${iga(name)} 포함되어 있는 관계의 원자료`)}</div>`;
 }
 const go=(id,t)=>`<button type="button" class="xai-go" data-open-document="${esc(id)}" data-marks="${esc(JSON.stringify([t]))}" title="원자료에서 이 문장 보기">근거 ${no(id)}${icon('open',13)}</button>`;
 const cite=x=>`<button type="button" class="xn-cite" data-open-document="${esc(x.id)}" data-match="1" data-marks="${esc(JSON.stringify(x.marks||[]))}" title="근거 ${no(x.id)}: ${esc(entryDocs.get(x.id)?.title||'')}">${no(x.id)}</button>`;
 // 원자료 확인하기: sentences that name it, word for word, DUR records and the records the answer cited first, four at most.
 const finds=[...new Set([name,...nodes.map(n=>n.label),...(asked?.aliases||[])].filter(Boolean))].map(nameRe),said=[],seen=new Set();
 for(const r of [...recs].sort((a,b)=>isDur(b.doc)-isDur(a.doc)||b.cited-a.cited)){
  const sents=sentenceSpans(r.text).map(s=>r.text.slice(s.start,s.end).trim()).filter(t=>t.length>=8&&(isDur(r.doc)||(!/^\[/.test(t)&&/[.다][”"')\]]*$/.test(t)))&&finds.some(re=>re.test(t)));
  for(const t of sents.slice(0,2)){if(said.length>=4||seen.has(squash(t)))continue;seen.add(squash(t));said.push({text:t,id:r.id,where:recordWhere(r.doc,r.text)});}
 }
 const kind=asked?'질문한 약':NODE_KIND[nodes[0].type]||'항목';
 const spellings=[...new Set([...nodes.map(n=>n.label),...(asked?.aliases||[])].filter(l=>l&&squash(l).toLowerCase()!==squash(name).toLowerCase()))];
 // The entry: the headword; under a rule, 한눈에 보기 (the terms the summary names, by kind) and the summary by topic, each
 // sentence word for word with its records.
 const sentence=s=>`<li>${esc(s.text)}${s.sources.map(cite).join('')}</li>`;
 const topicHTML=t=>`<section class="xn-topic"><h5>${icon(t.icon,16)}${esc(t.label)}</h5><ul>${t.sentences.slice(0,TOPIC_SHOWN).map(sentence).join('')}</ul>${t.sentences.length>TOPIC_SHOWN?`<details class="xn-more"><summary>${t.sentences.length-TOPIC_SHOWN}문장 더 보기</summary><ul>${t.sentences.slice(TOPIC_SHOWN).map(sentence).join('')}</ul></details>`:''}</section>`;
 const own=new Set(nodes.flatMap(n=>[n.label,n.id]).concat(names).map(x=>squash(x).toLowerCase()));
 const termsOf=(list,types)=>{const out=[];for(const s of list)for(const x of s.terms||[])if(types.has(x.type)&&!own.has(squash(x.name).toLowerCase())&&!out.some(o=>squash(o)===squash(x.name)))out.push(x.name);return out;};
 const pick=key=>topics.find(t=>t.key===key)?.sentences||[];
 const tile=(label,items,count=false)=>items.length?`<div class="xn-tile"><small>${esc(label)}${count?` <b>${items.length}</b>`:''}</small><div class="xn-terms">${items.slice(0,8).map(x=>`<span class="xn-term">${esc(x)}</span>`).join('')}${items.length>8?`<span class="xn-term-more">외 ${items.length-8}개</span>`:''}</div></div>`:'';
 const tiles=[tile('분류',termsOf(pick('what'),new Set(['DRUG_CLASS']))),tile('작용',actionTags(all)),
  tile(isDrug?'함께 쓸 때 주의할 약':'관련된 약',termsOf(pick('drugs'),DRUG_TYPES),true),tile(isDrug?'관련 이상반응':'관련 증상',termsOf(topics.filter(t=>t.key!=='what').flatMap(t=>t.sentences),new Set(['ADVERSE_EVENT']))),
  tile('주의할 환자',termsOf(pick('patient'),new Set(['PATIENT_GROUP'])))].filter(Boolean);
 const glance=tiles.length?`<div class="xn-glance-head">한눈에 보기</div><div class="xn-glance">${tiles.join('')}</div>`:'';
 const state=entry?.pending?'<p class="hint">원자료 번호를 찾는 중입니다…</p>':entry?.error?'<p class="hint">원자료 번호를 불러오지 못했습니다. DB 서버 연결을 확인해 주세요.</p>':'';
 const summary=topics.length?`${glance}<div class="xn-desc">${topics.map(topicHTML).join('')}</div><p class="xn-gloss-note">${DESC_NOTE}</p>${state}`:'';
 // A drug with its 의약품안전나라 허가정보: the label alone. Without the label (still
 // loading, no key, not found), the summary as before, with a line on why and a search link to 의약품안전나라.
 let desc;
 if(label?.product)desc=`<hr class="xn-rule">${labelHTML(label,{labelKey})}`;
 else{
  const search=NEDRUG_SEARCH+encodeURIComponent(label?.query||name);
  const why=label?.pending?'<p class="hint">의약품안전나라 허가정보를 불러오는 중입니다…</p>':label?`<p class="hint">${esc(label.message||'의약품안전나라에서 이 이름의 허가정보를 찾지 못했습니다.')} 아래는 HyperRx 요약입니다. <a href="${esc(search)}" target="_blank" rel="noopener noreferrer">의약품안전나라에서 찾아보기</a></p>`:'';
  desc=summary||why?`<hr class="xn-rule">${why}${summary}`:'';
 }
 const head=`<header class="xai-card xn-card"><div class="xai-tags"><span class="badge">사전</span><span class="xai-scope">${esc(kind)}</span>${NODE_GUIDE}</div><div class="xai-card-main"><span class="xai-card-icon">${icon('book',26)}</span><div><h3>${esc(name)}</h3>${spellings.length?`<p class="xai-with">다른 표기: ${esc(spellings.slice(0,4).join(', '))}${spellings.length>4?` 외 ${spellings.length-4}개`:''}</p>`:''}</div></div>${desc}</header>`;
 const dictRows=flags.map(f=>({...flagRow(f),id:f.chunk_id,combo:f.form==='복합제'}));
 const dict=dictRows.length?`<section class="xai-sec"><h4>${icon('check')}의약품안전사용서비스(DUR)에 따른 분류</h4><dl class="xn-dict">${dictRows.map(r=>`<dt>${esc(r.what)}${r.combo?'<small>복합제 기록</small>':''}</dt><dd><span>${esc(cut(r.value,200))}</span>${go(r.id,r.mark)}</dd>`).join('')}</dl></section>`:'';
 const quotes=said.length?`<section class="xai-sec"><h4>${icon('doc')}원자료 확인하기</h4><ol class="xai-says">${said.map(s=>`<li><div class="xai-said"><small>${esc(s.where)}</small><p>“${esc(cut(s.text,320))}”</p></div>${go(s.id,s.text)}</li>`).join('')}</ol></section>`:'';
 const relKind=r=>r.rows.some(x=>isDur(x.doc)&&/병용금기/.test(x.doc.category||''))?'의약품안전사용서비스(DUR) 병용금기':r.rows[0]?recordWhere(r.rows[0].doc,recs.find(x=>x.id===r.rows[0].id)?.text).split(' · ')[0]:'원문 연결 없음';
 const relList=rels.length?`<section class="xai-sec"><h4>${icon('pair')}${esc(name)}${iga(name)} 포함되어 있는 관계 확인하기</h4><div class="xn-rels">${rels.slice(0,12).map(r=>`<button type="button" class="xn-rel" data-explore-edge="${esc(r.e.id)}" title="이 관계의 약물관계 설명 보기"><span class="xn-dot" style="background:${esc(relationColor(r.e,r.i,palette.length?palette:['#8A94A6']))}"></span><span class="xn-rel-main"><strong>${esc(r.e.label)}</strong><small>${r.others.length?`함께 든 항목: ${esc(r.others.slice(0,4).join(', '))}${r.others.length>4?` 외 ${r.others.length-4}개`:''}`:'다른 항목 없음'}</small></span><span class="xn-rel-side"><small>${esc(relKind(r))}</small>${r.cited?'<span class="xn-tag">답변 인용</span>':''}<small>근거 ${r.rows.length}건</small></span></button>`).join('')}</div>${rels.length>12?`<p class="hint">관계 ${rels.length-12}개 더 있습니다. 근거 및 출처 탭에서 모든 원자료를 볼 수 있습니다.</p>`:''}</section>`:'';
 return `<div class="xai xn">${head}${dict}${quotes}${relList}</div>`;
}
