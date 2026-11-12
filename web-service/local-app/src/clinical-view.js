// Evidence dashboard sections built from the DB server's rule lookups (/api/clinical, clinical.py): DUR 병용금기 pairs,
// per-drug DUR flags and label sentences. No LLM is involved. Pure functions that return HTML, so wording and order can be
// tested without a browser. Color rule: only verdict badges carry risk; quotes, chips and bars stay neutral.
import {norm} from './medications.js';
import {apaHTML,sourceLine,INFO_ICON} from './sources.js';
// The source line of a card from the server's official names (clinical.py summary.sources); nothing when they are missing.
const cite=(data,key,operation)=>{const s=data.sources?.[key];return s?sourceLine({sourceLabel:s.name,sourceOperation:operation??s.operation,sourcePage:s.page}):'';};

export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const FLAG_ORDER=['임부금기','노인주의','용량주의','투여기간주의','특정연령대금기','효능군중복'];
const FLAG_NAME={특정연령대금기:'연령금기'};
const NOT_SAFE='근거가 없다는 뜻이며, 안전하다는 뜻은 아닙니다.';
// Particles by the last sound of a Hangul word: 을/를, and 으로/로 (ㄹ takes 로).
const last=w=>{const c=String(w).trim().charCodeAt(String(w).trim().length-1);return c>=0xAC00&&c<=0xD7A3?(c-0xAC00)%28:-1;};
export const eul=w=>last(w)>0?'을':'를';
export const ro=w=>{const f=last(w);return f>0&&f!==8?'으로':'로';};
const ga=w=>last(w)>0?'이':'가';

export const pairName=(data,p)=>`${data.drugs[p.a].name} ＋ ${data.drugs[p.b].name}`;
const open=(id,label='원문')=>id?`<button type="button" class="link-button" data-open-document="${esc(id)}">${esc(label)}</button>`:'';

// Pairs with the drug being added (추가 검토) first and named first, then stronger findings first.
const RANK={listed:0,combination_only:1,not_listed:2,unknown:3};
export function orderedPairs(data,added){
 const k=norm(added),i=k?data.drugs.findIndex(d=>[d.name,...(d.aliases||[]),...(d.spellings||[])].some(x=>norm(x)===k)):-1;
 const withAdded=p=>p.a===i||p.b===i?0:1;
 // Swapping a and b only changes the order of the two names; records and sentences belong to the pair as a whole.
 return [...data.pairs].sort((x,y)=>withAdded(x)-withAdded(y)||(RANK[x.status]??3)-(RANK[y.status]??3)).map(p=>p.b===i?{...p,a:p.b,b:p.a}:p);
}
// Names the user listed (추가 검토: 복용 약과 추가 약) that the lookup did not find as DUR ingredients.
export function missingNames(data,expected=[]){
 const found=new Set((data.drugs||[]).flatMap(d=>[d.name,...(d.aliases||[]),...(d.spellings||[])]).map(norm));
 return [...new Set(expected.map(x=>String(x??'').trim()).filter(Boolean))].filter(n=>!found.has(norm(n)));
}
// listed: a pair is in DUR 병용금기 for the drugs themselves. combination_only: only combination products are listed.
// not_listed: every pair was checked and none is listed; never claimed while a listed name was not found.
export function overall(data,expected=[]){
 if(data.pairs.some(p=>p.status==='listed'))return 'listed';
 if(data.pairs.some(p=>p.status==='combination_only'))return 'combination_only';
 if(expected.length&&missingNames(data,expected).length)return 'unknown';
 if(!data.pairs.length)return 'none';
 return data.pairs.every(p=>p.status==='not_listed')?'not_listed':'unknown';
}
const BADGE={listed:['contra','병용금기'],combination_only:['caution','복합제 병용금기'],not_listed:['info','DUR 병용금기 미등재'],unknown:['unknown','판정할 수 없음'],none:['unknown','판정할 수 없음']};
export function badge(status,size=''){const [cls,label]=BADGE[status]||BADGE.unknown;return `<span class="verdict verdict-${cls}${size?` ${size}`:''}">${label}</span>`;}

const combination=side=>side.form==='복합제'?[side.name,...(side.components||[]).map(c=>c.name)].join('+'):null;
function recordSummary(dur){
 const n=dur.records.length,direct=dur.direct??n;
 return `DUR 기록 ${n}건${n>direct?` (두 약 자체 ${direct}건, 복합제 ${n-direct}건)`:''}`;
}
// Combination products named in the records that do not apply to the drugs themselves.
function combinations(dur){return [...new Set(dur.records.filter(r=>!r.direct).flatMap(r=>r.combinations??[combination(r.a),combination(r.b)]).filter(Boolean))];}

const aiVerdict=answer=>(answer&&!answer.demo&&answer.assessment)||null;
// The model's value stays 상충, so saved answers keep working; the screen says 확인 필요.
export const verdictName=v=>v==='상충'?'확인 필요':v;
// When the regulator's record says 금기 and the model says otherwise, the screen says so.
function compareWithAnswer(status,answer){
 const a=aiVerdict(answer),name=verdictName(a);
 return status==='listed'&&a&&a!=='금기'?`<p class="dash-warn">DUR에는 병용금기로 등재되어 있는데 AI는 '${esc(name)}'${ro(name)} 판단했습니다. 원문을 확인하세요.</p>`:'';
}
function reasonList(dur,reasons){
 return `<ul class="reasons">${reasons.map(reason=>`<li><span>${esc(reason)}</span>${open(dur.records.find(r=>r.reason===reason)?.chunk_id,'DUR 원문')}</li>`).join('')}</ul>`;
}

// A label's contraindication section also holds explanatory sentences ("그러나 PLATO 연구에서 …"), and an item of a combination
// product can be about its other ingredient. Only a numbered item of a single-ingredient product counts as a contraindication
// (read against the 12 such pairs found among 378 drug pairs, 2026-11-06).
const BAN_SECTION=/투여하지 말 것|복용하지 말 것|사용하지 말 것/,LIST_ITEM=/^\s*(?:\d{1,2}\)\s|\(\d{1,2}\)\s|[①-⑳○●])/;
export const isLabelBan=m=>BAN_SECTION.test(m.section||'')&&m.single!==false&&!m.cut_start&&LIST_ITEM.test(m.text||'');
const LEVEL={'금기':'contra','주의':'caution','확인 필요':'conflict','근거 부족':'insufficient','판정할 수 없음':'unknown'};
// The combined verdict, in a fixed order: records first. The model can raise a case without a record to 주의 or 확인 필요,
// but it can neither declare 금기 on its own nor lower a recorded 금기.
export function combinedVerdict(data,answer,added,expected=[],aiPending=false){
 const dur=overall(data,expected),pairs=orderedPairs(data,added),ai=aiVerdict(answer),known=dur==='not_listed'||dur==='combination_only';
 const names=list=>pairs.length>1?`${list.map(p=>pairName(data,p)).join(', ')}: `:'';
 const listed=pairs.filter(p=>p.status==='listed'),banned=pairs.filter(p=>p.label.mentions.some(isLabelBan)),combo=pairs.filter(p=>p.status==='combination_only');
 let level,reason;
 if(listed.length){level='금기';reason=`${names(listed)}DUR 병용금기에 등재되어 있습니다.`;}
 else if(banned.length){level='금기';reason=`${names(banned)}허가사항의 투여 금지 항목에 적혀 있습니다. DUR 병용금기에는 없습니다.`;}
 else if(ai==='금기'){level='확인 필요';reason=known?'AI는 금기로 판단했지만 DUR과 허가사항의 금기 기록은 찾지 못했습니다. 찾은 약이 맞는지 원문을 확인하세요.':'AI는 금기로 판단했지만 약 이름을 DUR에서 찾지 못해 기록으로 확인하지 못했습니다. 성분명으로 다시 확인하세요.';}
 else if(ai==='상충'){level='확인 필요';reason='AI가 자료끼리 내용이 엇갈린다고 판단했습니다. 원문을 확인하세요.';}
 else if(combo.length){level='주의';reason=`${names(combo)}두 약 자체의 기록은 없고 복합제 병용금기 기록만 있습니다.`;}
 else if(ai==='주의'){level='주의';reason=`${known?'DUR 병용금기에는 없지만':'약 이름을 DUR에서 찾지 못했지만'} AI 답변이 근거 문서를 바탕으로 주의로 판단했습니다.`;}
 else if(pairs.some(p=>p.label.mentions.some(m=>m.action&&m.single!==false))){level='주의';reason='DUR 병용금기에는 없지만 허가사항에 주의 문장이 있습니다.';}
 else if(!known){level='판정할 수 없음';reason='약 이름을 DUR에서 찾지 못해 판정하지 못했습니다.';}
 else{level='근거 부족';reason='DUR과 허가사항에서 금기 기록을 찾지 못했고, AI 답변도 주의로 판단하지 않았습니다. 안전하다는 뜻은 아닙니다.';}
 if(aiPending&&level!=='금기')reason+=' AI 답변이 끝나면 바뀔 수 있습니다.';
 return {level,cls:LEVEL[level],reason};
}
export const VERDICT_GUIDE=[
 ['금기','DUR 병용금기에 등재되었거나, 단일 성분 제품 허가사항의 투여 금지 항목에 상대 약이 적힌 경우'],
 ['확인 필요','AI는 금기로 판단했지만 금기 기록을 찾지 못했거나, AI가 자료끼리 엇갈린다고 판단한 경우'],
 ['주의','복합제 기록만 있거나, AI 답변이 주의로 판단했거나, 단일 성분 제품 허가사항에 주의 문장이 있는 경우'],
 ['근거 부족','위에 해당하지 않는 경우. 안전하다는 뜻이 아닙니다.'],
 ['판정할 수 없음','약 이름을 DUR에서 찾지 못했고 AI 답변도 주의나 금기로 판단하지 않은 경우'],
];
export const verdictHead=`<div class="hero-caption"><b>종합 판정</b><button type="button" class="info-button" data-verdict-info aria-expanded="false" aria-label="종합 판정 기준" title="종합 판정 기준">${INFO_ICON}</button></div><div class="hero-guide" hidden>${VERDICT_GUIDE.map(([k,v])=>`<p><b>${k}</b>: ${v}</p>`).join('')}<p>기록이 있으면 기록이 우선합니다. AI 혼자서 금기로 만들거나 기록의 금기를 낮추지 못합니다.</p></div>`;
// What the verdict was combined from. Numbers are counts of records, never a probability.
function basisRows(data,answer,pairs,aiPending){
 const count=s=>pairs.filter(p=>p.status===s).length,mentions=pairs.flatMap(p=>p.label.mentions),ai=aiVerdict(answer);
 const durText=!pairs.length?'약 조합을 찾지 못함':pairs.length===1?({listed:`병용금기 (기록 ${pairs[0].dur.records.length}건)`,combination_only:'복합제 기록만 있음',not_listed:'미등재'}[pairs[0].status]||'판정하지 못함'):[['병용금기','listed'],['복합제만','combination_only'],['미등재','not_listed']].filter(([,s])=>count(s)).map(([k,s])=>`${k} ${count(s)}쌍`).join(' · ')||'판정하지 못함';
 const noProducts=pairs.length&&pairs.every(p=>Object.values(p.label.searched||{}).every(n=>!n));
 const labelText=mentions.length?`관련 문장 ${mentions.length}개 · 투여 금지 항목 ${mentions.filter(isLabelBan).length}개`:noProducts?'이 약들의 제품 자료 없음':'관련 문장 없음';
 const docs=new Map([...(answer?.documents||[]),...(answer?.graph?.evidenceDocuments||[])].map(d=>[d.id,d]));
 const isPaper=x=>/pubmed/i.test(x?.sourceLabel||'');
 const paperText=ai?`검색 ${[...docs.values()].filter(isPaper).length}편 · 답변 인용 ${(answer.citations||[]).filter(isPaper).length}편`:aiPending?'확인 중':'없음';
 return `<dl class="hero-basis">${[['DUR 병용금기',durText],['허가사항',labelText],['연구 문헌',paperText],['AI 답변',verdictName(ai)||(aiPending?'확인 중':'없음')]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
// The large verdict above the tabs. It stays in view on every tab, with what it was combined from.
export function verdictSection(data,answer,added,expected=[],aiPending=false){
 const pairs=orderedPairs(data,added),missing=missingNames(data,expected),v=combinedVerdict(data,answer,added,expected,aiPending);
 let html=`${verdictHead}<span class="verdict verdict-${v.cls} xl">${v.level}</span>`;
 if(pairs.length===1)html+=`<p class="pair-names">${esc(pairName(data,pairs[0]))}</p>`;
 html+=`<p class="hero-reason">${esc(v.reason)}</p>`;
 if(missing.length)html+=`<p class="dash-warn">${esc(missing.join(', '))}${eul(missing.at(-1))} DUR 성분명에서 찾지 못해, 그 약이 든 조합은 판정하지 않았습니다. 성분명으로 다시 적어 주세요.</p>`;
 else if(!pairs.length)html+='<p class="hint">약 조합을 판정하려면 DUR 성분명이 두 가지 이상 필요합니다. 성분명으로 적어 주세요.</p>';
 return html+compareWithAnswer(overall(data,expected),answer)+basisRows(data,answer,pairs,aiPending);
}
// 예상 문제 tab: the regulator's reason, verbatim, and the DUR result of each pair.
export function problemSection(data,added){
 const pairs=orderedPairs(data,added),shown=pairs.filter(p=>p.status==='listed'||p.status==='combination_only');
 let html='<h3>예상되는 문제</h3>';
 if(!shown.length)html+='<p class="hint">DUR 병용금기 기록이 없어 예상되는 문제를 DUR에서 가져오지 못했습니다. 허가사항 탭의 문장을 확인하세요.</p>';
 for(const p of shown){
  if(pairs.length>1)html+=`<p class="pair-label">${esc(pairName(data,p))}</p>`;
  if(p.status==='combination_only')html+='<p class="hint">복합제 기록의 내용입니다.</p>';
  html+=p.dur.reasons.length?reasonList(p.dur,p.dur.reasons):`<p class="hint">DUR 기록에 사유가 적혀 있지 않습니다. ${open(p.dur.records[0]?.chunk_id,'DUR 원문')}</p>`;
  if(p.dur.combination_reasons?.length)html+=`<p class="hint">복합제 기록에만 있는 내용:</p>${reasonList(p.dur,p.dur.combination_reasons)}`;
 }
 if(pairs.length){
  html+=`<h4>약 조합별 DUR 결과</h4><div class="pair-rows">${pairs.map(p=>`<div class="pair-row">${badge(p.status,'sm')}<span>${esc(pairName(data,p))}</span>${p.dur.records.length?`<small>${p.dur.records.length}건</small>`:''}</div>`).join('')}</div>`;
  if(pairs.length===1&&pairs[0].dur.records.length)html+=`<p class="hint">${recordSummary(pairs[0].dur)}</p>`;
  for(const p of pairs.filter(p=>p.status==='combination_only'))html+=`<p class="hint">${pairs.length>1?`${esc(pairName(data,p))}: `:''}두 약 자체의 병용금기 기록은 없고, 복합제 기록만 있습니다(${esc(combinations(p.dur).join(', '))}). 환자가 이 복합제를 복용하는지 확인하세요.</p>`;
  if(pairs.every(p=>p.status==='not_listed'))html+='<p class="hint">DUR 병용금기 목록에 없다는 뜻입니다. 함께 써도 된다는 뜻은 아니므로 허가사항 탭의 문장을 확인하세요.</p>';
 }
 const combos=[...new Set(pairs.filter(p=>p.status==='listed').flatMap(p=>combinations(p.dur)))];
 if(combos.length)html+=`<p class="hint">같은 성분의 복합제 기록도 있습니다: ${esc(combos.join(', '))}</p>`;
 html+=`<p class="found-line">질문에서 찾은 약: ${data.drugs.length?esc(data.drugs.map(d=>d.name).join(', ')):'없음'}</p>`;
 return html+cite(data,'dur',data.sources?.dur_operations?.['병용금기']);
}

// A literal label sentence with the other drug's name underlined (offsets come from the server).
function quote(m){
 let out='',at=0;
 for(const h of [...(m.hits||[])].sort((x,y)=>x.start-y.start)){if(h.start<at)continue;out+=esc(m.text.slice(at,h.start))+`<mark>${esc(m.text.slice(h.start,h.end))}</mark>`;at=h.end;}
 out+=esc(m.text.slice(at));
 return `${m.cut_start?'…':''}${out}${m.cut_end?'…':''}`;
}
// The product comes first: "이 약" in the sentence below it means this product.
function quoteFigure(m,tags,body){
 const list=tags.filter(Boolean);
 return `<figure class="label-quote"><figcaption><div class="quote-head"><span class="quote-item">${esc(m.item)}</span>${open(m.chunk_id)}</div>${list.length?`<div class="quote-tags">${list.map(t=>`<small>${esc(t)}</small>`).join('')}</div>`:''}</figcaption><blockquote>${body}</blockquote></figure>`;
}
function sentenceCard(m){
 return quoteFigure(m,[m.section,m.single===false?'복합제 허가사항':'',m.products?.length>1?`같은 문장 ${m.products.length}개 제품`:''],quote(m));
}
function spellingNote(list,data,p){
 const names=new Set([data.drugs[p.a].name,data.drugs[p.b].name].map(norm));
 const other=[...new Set(list.map(m=>m.spelling).filter(s=>s&&!names.has(norm(s))&&/[가-힣]/.test(s)))];
 return other.length?`<p class="hint">허가사항에는 ${esc(other.join(', '))}${ro(other.at(-1))} 적혀 있어 임시 표기 변형표로 함께 찾았습니다.</p>`:'';
}
// The stored labels cover only some disease areas, so a drug can have no product to search at all. Say so, instead of
// reading as if its label had been searched and said nothing.
const LABEL_SCOPE='자료는 고혈압, 당뇨, 이상지질혈증, 심근경색증, 뇌졸중, 치매 약 중심으로 한정되어 있습니다.';
const BY_CLASS='계열명(예: 강력한 CYP3A4 억제제, 살리실산염)으로만 적힌 문장은 찾지 못합니다.';
function noSentence(absent,present){
 const searched=present.map(([name,n])=>`${name} ${n}개 제품`).join(', ');
 if(!absent.length)return `허가사항에서 상대 약 이름을 찾지 못했습니다. 찾아본 허가사항: ${searched}. ${BY_CLASS} ${NOT_SAFE}`;
 if(!present.length)return `이 서비스의 허가사항 자료에는 ${absent.join(', ')} 제품이 없어 문장을 찾아볼 수 없습니다. ${LABEL_SCOPE} 허가사항에 관련 내용이 없다는 뜻이 아니며, 안전하다는 뜻도 아닙니다.`;
 return `${absent.join(', ')} 제품은 이 서비스의 허가사항 자료에 없습니다. ${LABEL_SCOPE} 찾아본 허가사항(${searched})에서는 상대 약 이름을 찾지 못했습니다. ${BY_CLASS} ${NOT_SAFE}`;
}
export function labelSection(data,added,shown=2){
 const pairs=orderedPairs(data,added);
 let html='<h3>식약처 허가사항의 관련 문장</h3>';
 if(!pairs.length)return html+'<p class="hint">두 약 이상을 찾으면 서로를 언급한 허가사항 문장을 보여 줍니다.</p>';
 for(const p of pairs){
  const list=p.label.mentions,counts=Object.entries(p.label.searched||{});
  const absent=counts.filter(([,n])=>!n).map(([name])=>name),present=counts.filter(([,n])=>n);
  if(pairs.length>1)html+=`<p class="pair-label">${esc(pairName(data,p))}</p>`;
  if(!list.length){
   html+=`<p class="hint">${esc(noSentence(absent,present))}</p>`;
   continue;
  }
  if(absent.length)html+=`<p class="hint">${esc(`${absent.join(', ')} 제품은 이 서비스의 허가사항 자료에 없어, ${present[0][0]}${ga(present[0][0])} 든 제품의 문장만 보여 줍니다.`)}</p>`;
  html+=list.slice(0,shown).map(sentenceCard).join('');
  if(list.length>shown)html+=`<details class="more-quotes"><summary>문장 ${list.length-shown}개 더 보기</summary>${list.slice(shown).map(sentenceCard).join('')}</details>`;
  html+=spellingNote(list,data,p);
 }
 return html+cite(data,'permit',data.sources?.permit?`${data.sources.permit.operation}(사용상의 주의사항)`:undefined);
}
function flagText(f){
 const name=FLAG_NAME[f.category]||f.category;
 if(f.category==='임부금기')return `${name} ${f.grade||''}`.trim();
 const extra=f.max_dose?`최대 ${f.max_dose}`:f.max_days?`최대 ${f.max_days}`:f.age||f.group||'';
 return extra?`${name} · ${extra}`:name;
}
export function flagsSection(data){
 let html='<h3>약별 DUR 주의</h3>';
 if(!data.drugs.length)return html+'<p class="hint">질문에서 DUR 성분명을 찾으면 약마다 임부·노인·용량·연령·기간·효능군 중복 기록을 보여 줍니다.</p>';
 html+='<div class="flag-rows">'+data.drugs.map(d=>`<div class="flag-row"><span class="flag-drug">${esc(d.name)}</span><span>${d.flags.length?d.flags.map(f=>`<button type="button" class="flag-chip" data-open-document="${esc(f.chunk_id)}" title="${esc([f.detail,`DUR 기록 ${f.count}건`].filter(Boolean).join(' · '))}">${esc(flagText(f))}</button>`).join(''):`<small class="muted">${d.known?'등재 없음':'DUR에서 찾지 못함'}</small>`}</span></div>`).join('')+'</div>';
 const none=FLAG_ORDER.filter(c=>data.drugs.every(d=>d.known&&!d.flags.some(f=>f.category===c)));
 if(none.length)html+=`<p class="hint">${data.drugs.length>1?'질문한 약 모두':'이 약은'} DUR의 ${esc(none.map(c=>FLAG_NAME[c]||c).join(', '))} 목록에 없습니다. 목록에 없다고 안전하다는 뜻은 아닙니다.</p>`;
 const ops=data.sources?.dur_operations?FLAG_ORDER.map(c=>data.sources.dur_operations[c]).filter(Boolean).join(', '):undefined;
 return html+'<p class="hint">나이, 신기능, 용량 같은 환자 정보는 이 화면에서 받지 않습니다. 환자 상태는 직접 확인하세요.</p>'+cite(data,'dur',ops);
}
export function mechanismSection(data,added){
 const pairs=orderedPairs(data,added).filter(p=>p.label.mechanism.length);
 if(!pairs.length)return '<p class="hint">허가사항에서 기전 문장을 찾지 못했습니다. 관련 문장에 효소·수송체 이름(CYP3A4 등)이 없거나, 허가사항가 DB에 없을 수 있습니다.</p>';
 return pairs.map(p=>`${pairs.length>1?`<p class="pair-label">${esc(pairName(data,p))}</p>`:''}${p.label.mechanism.map(m=>quoteFigure(m,[m.section,(m.enzymes||[]).join(', ')],esc(m.text))).join('')}`).join('')+'<p class="hint">관련 문장과 같은 효소·수송체가 적힌 대사 문장입니다. 질문한 약의 허가사항에서 찾았습니다.</p>'+cite(data,'permit',data.sources?.permit?`${data.sources.permit.operation}(사용상의 주의사항)`:undefined);
}
function bars(rows){
 const max=Math.max(1,...rows.map(r=>r.count));
 return `<div class="bars">${rows.map(r=>`<div class="bar-row${r.count?'':' none'}"><span class="name">${esc(r.name)}</span><span class="track"><span class="fill" style="width:${Math.round(r.count/max*100)}%"></span></span><span class="count">${r.count}</span></div>`).join('')}</div>`;
}
// Counts of the records behind this screen (never a probability). Papers are listed with titles so they can be opened.
export function basisSection(data){
 const unique=(list,key)=>new Set(list.map(key)).size;
 const records=data.pairs.flatMap(p=>p.dur.records),mentions=data.pairs.flatMap(p=>p.label.mentions),mech=data.pairs.flatMap(p=>p.label.mechanism);
 const rows=[{name:'DUR 병용금기',count:unique(records,r=>r.chunk_id)},{name:'허가사항 관련 문장',count:unique(mentions,m=>m.chunk_id+':'+m.start)},{name:'허가사항 기전 문장',count:unique(mech,m=>m.chunk_id+':'+m.start)},{name:'DUR 약별 주의',count:data.drugs.reduce((n,d)=>n+d.flags.reduce((k,f)=>k+f.count,0),0)}];
 let html=bars(rows);
 html+='<h4>두 약을 함께 다룬 연구 문헌</h4>'+(data.pairs.length?data.pairs.map(p=>`<p class="paper-line"><span>${esc(pairName(data,p))}</span><b>${p.papers.count}편</b></p>${p.papers.items.map(x=>x.citation?`<p class="apa">${apaHTML(x.citation)} ${open(x.chunk_id,'DB 원문')}</p>`:`<p class="paper-item">${open(x.chunk_id,x.title)}</p>`).join('')}${p.papers.count>p.papers.items.length?`<p class="hint">외 ${p.papers.count-p.papers.items.length}편</p>`:''}`).join(''):'<p class="hint">두 약 이상이 필요합니다.</p>');
 if(data.sources)html+='<h4>자료 출처</h4>'+cite(data,'dur',Object.values(data.sources.dur_operations||{}).join(', '))+cite(data,'permit')+cite(data,'paper');
 return html+'<p class="hint">숫자는 근거 기록의 개수이며 위험 확률이 아닙니다. 근거가 없다는 것은 안전하다는 뜻이 아닙니다.</p>';
}
