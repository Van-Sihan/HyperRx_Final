// 약물관계 설명 "새 구성". For a relation that joins two or more asked drugs it reads, top to bottom: the chosen drugs and their
// official class, what the official records say (DUR and label sentences, word for word), the interaction mechanism the
// label itself writes down, what the label says to check in a patient (and whether the question gives it), then the
// numbered sources. Every line is a literal sentence of a stored record with its source number: the service adds no
// recommendation of its own, and a part whose sentences cannot be found says so rather than being filled with look-alikes
// (2026-11-10: such a part was left out, and the panel read as if it had stopped at the judgment).
// Colors stay neutral (only verdict badges carry risk). Inputs: the relation and graph, the asked drugs (askedDrugSets), the
// rule lookup (/api/clinical, clinical.py) and the label texts loaded so far (id → /api/evidence response).
import {esc,sentenceSpans,INFO_ICON,sourceName} from './sources.js';
import {edgeSources} from './edge-list.js';
import {norm} from './medications.js';
import {TABLER} from './tabler-icons.js';

// Line icons from Tabler Icons (src/tabler-icons.js, MIT); no emoji. They take the text color.
const ICONS={alert:'alert-triangle',notice:'alert-circle',doc:'file-text',flask:'flask',user:'user',book:'book',bulb:'bulb',down:'arrow-down',open:'external-link',close:'x',map:'chart-bubble',flow:'arrows-split-2',grid:'grid-dots',pair:'circles-relation',check:'checklist',detail:'list-details',fit:'maximize'};
export const icon=(name,size=18)=>`<svg class="xi" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TABLER[ICONS[name]]||''}</svg>`;
const isDur=r=>/DUR/.test(r.doc.sourceShort||r.doc.sourceLabel||'');
// Only a 병용금기 record speaks of taking two drugs together; a 임부금기 or 노인주의 record names one drug and a population
// (2026-11-09: such records were summed up as "두 약을 함께 쓰지 않습니다").
const isBan=r=>isDur(r)&&/병용금기/.test(r.doc.category||'');
const originRow=(doc,label)=>((doc?.origin?.rows)||[]).find(x=>x[0]===label)?.[1]||'';
const cut=(s,n=170)=>{s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const last=w=>{const t=String(w).trim(),c=t.charCodeAt(t.length-1);return c>=0xAC00&&c<=0xD7A3?(c-0xAC00)%28:-1;};
const eun=w=>last(w)>0?'은':'는';
const sameDrug=(name,d)=>[d.name,...(d.aliases||[]),...(d.spellings||[])].some(x=>norm(x)===norm(name));

// The asked drugs the relation holds and the rule lookup's records among them; null only for a relation without an asked
// drug. official: a DUR 병용금기 record among its sources or a single-ingredient label sentence for one of its pairs; without
// one the panel still reads the relation's own records (2026-11-09: it used to fall back to the previous layout).
export function xaiTarget(edge,graph,drugs=[],clinical=null){
 if(!edge||!graph)return null;
 const hits=drugs.filter(d=>edge.members.some(id=>d.ids?.has(id)));
 if(!hits.length)return null;
 const rows=edgeSources(edge,graph),cd=clinical?.drugs||[];
 const index=name=>cd.findIndex(d=>sameDrug(name,d));
 const hitIdx=new Set(hits.map(h=>index(h.name)).filter(i=>i>=0));
 const named=p=>({...p,aName:cd[p.a]?.name,bName:cd[p.b]?.name});
 const pairs=(clinical?.pairs||[]).filter(p=>hitIdx.has(p.a)&&hitIdx.has(p.b)).map(named);
 // Label sentences come from single-ingredient products only: in a combination product's label a sentence may concern
 // its other ingredient (코아틴정's "이 약의 투여를 중지" is about its simvastatin, not its amlodipine).
 const mentions=pairs.flatMap(p=>(p.label?.mentions||[]).filter(m=>m.single).map(m=>({...m,pair:p})));
 const official=rows.some(isBan)||mentions.length>0;
 // The label everything below quotes: the first one that ties an enzyme to the other drug, else the first that names it.
 const primary=(mentions.find(m=>m.enzymes?.length)||mentions[0])?.item||null;
 const others=drugs.filter(d=>!hits.includes(d)).map(d=>({name:d.name,i:index(d.name)}));
 const extra=(clinical?.pairs||[]).filter(p=>(hitIdx.has(p.a)&&others.some(o=>o.i===p.b))||(hitIdx.has(p.b)&&others.some(o=>o.i===p.a))).map(named);
 // The relation's other members by name (스피로노락톤, ACE억제제, 신부전 …), read by ownRecords.
 const members=edge.members.filter(id=>!hits.some(h=>h.ids?.has(id))).map(id=>graph.nodes?.find(n=>n.id===id)?.label||id).filter(n=>squash(n).length>=2);
 return {hits:hits.map(h=>h.name),hitDrugs:hits,hitNames:[...hitIdx].map(i=>cd[i].name),total:drugs.length,rows,pairs,mentions,primary,others,extra,official,members};
}
// Label records to read in full for the mechanism and patient parts: every stored piece of the primary label that names the
// other drug.
export function xaiNeeds(target){
 if(!target?.primary)return [];
 return [...new Set(target.mentions.filter(m=>m.item===target.primary).map(m=>m.chunk_id))];
}

// Sources are numbered as they are listed: the relation's own records first, then the label records quoted from the rule
// lookup. A chip carries the literal sentence it backs, so the source window opens with that sentence marked.
function registry(rows){
 const list=rows.map((r,i)=>({no:i+1,id:r.id,doc:r.doc,own:true,sections:new Set()})),byId=new Map(list.map(x=>[x.id,x]));
 const add=(id,title)=>{if(!byId.has(id)){const x={no:list.length+1,id,title,own:false,sections:new Set()};list.push(x);byId.set(id,x);}return byId.get(id);};
 return {list,byId,add};
}
const chip=(src,sentence)=>`<button type="button" class="xp-cite" data-open-document="${esc(src.id)}"${sentence?` data-marks="${esc(JSON.stringify([sentence]))}"`:''} title="원문에서 이 문장 보기">근거 ${src.no}</button>`;

// A DUR record's two sides as written: "심바스타틴 복합제(암로디핀) + 클래리트로마이신".
export function durTitle(excerpt){
 const m=/^\[[^\]]+\]\s*(\S+?)\([^)]*\)\((단일제|복합제)(.*?)\)과\(와\)\s*(\S+?)\([^)]*\)\((단일제|복합제)(.*?)\)(?:은|는)/.exec(String(excerpt||''));
 if(!m)return '';
 const parts=s=>[...String(s).matchAll(/\(([가-힣]+)\)/g)].map(x=>x[1]).join('·');
 const side=(name,form,rest)=>form==='복합제'?`${name} 복합제${parts(rest)?`(${parts(rest)})`:''}`:`${name} 단일제`;
 return `${side(m[1],m[2],m[3])} + ${m[4]}${m[5]==='복합제'?` 복합제${parts(m[6])?`(${parts(m[6])})`:''}`:''}`;
}
const reasonOf=excerpt=>(/금기·주의 내용:\s*([^\n]+)/.exec(String(excerpt||''))?.[1]||'').trim().replace(/[.\s]+$/,'');

// What the relation's own records say when no official record speaks for the pair (a combination product's label, a DUR
// record of another kind, an e약은요 entry): the sentences the answer cited from them, the sentences that name two asked
// drugs, and the instructions written in the same numbered item ("⑤ … 따라서 주의하여 병용투여하며 …"). Word for word,
// at most four per record, the same sentence from another product's identical label once.
const TELL=/주의하여|주의를 기울|주의가 필요|주의할 것|주의해야|주의\s*깊게|관찰하는 것이 권장|신중히|권장되지 않|모니터링|투여하지 말|병용하지 않|피해야|중지/;
const BAN=/투여하지 말|병용하지 않는다|병용금기|함께 쓰지 않/;
const squash=s=>String(s||'').replace(/\s+/g,'');
const nameRe=n=>new RegExp([...squash(n)].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),'i');
// Where an item starts: "⑤ ", "(3) ", "3) " (the numbered entries of a label section).
function itemStarts(text){
 const at=[0];for(const m of text.matchAll(/(?:^|\s)(?:[①-⑳]|\(\d{1,2}\)|\d{1,2}\))\s/g))at.push(m.index+(/^\s/.test(m[0])?1:0));
 return [...new Set(at)].sort((a,b)=>a-b);
}
// Where a sentence cut at its start begins to be whole: after a leading comma or bracket, or after a closing bracket whose
// opening one was cut off ("스테로이드류, …, 살리실산과 그 유도체들): 히드로클로로티아지드의 …"); -1 when nothing was cut.
// A numbered item's own marker ("11) 부신피질호르몬 …") is not a closing bracket left over from a cut (2026-11-10: such a
// sentence showed as "…부신피질호르몬 …").
function cutAt(t){
 const marker=/^\s*(?:[①-⑳]|\(\d{1,2}\)|\d{1,2}\))\s*/.exec(t)?.[0].length||0;
 if(!marker&&/^[,)\]:;·]/.test(t))return 0;
 let depth=0;for(let i=marker;i<t.length;i++){if(t[i]==='(')depth++;else if(t[i]===')'&&--depth<0)return i+1;}
 return -1;
}
// The stored text breaks lines inside sentences ("… 이 약과⏎병용 처방해야 할 때에는 …"): such breaks are joined, while a
// numbered item, a bracketed heading, a short heading line or a line after a full stop starts anew.
export function joinWrapped(raw){
 return String(raw||'').split('\n').reduce((acc,line,i,all)=>{const prev=all[i-1];return !i?line:acc+((prev.trim().length>15&&!/[.다:]\s*$/.test(prev)&&!/^\s*(?:[\u2460-\u2473]|\(\d{1,2}\)|\d{1,2}\)|\[|\d{1,2}\.)/.test(line))?' ':'\n')+line;},'');
}
// The relation's own records read once: each with its whole sentences, the numbered item each sits in, and whether the
// sentence is a key one (cited by the answer, or naming two asked drugs) or sits in a key one's item.
// In an asked drug's own single-ingredient label every sentence speaks of that drug, so it counts as named there, and a
// sentence is also key when it names another member of the relation (스피로노락톤, ACE억제제, 신부전 …) beside an asked drug
// (2026-11-10: a 텔미사르탄 label's "칼륨보전이뇨제(스피로노락톤 …) … 혈청 칼륨 농도를 증가시킬 수 있다" and "… 히드로클로로
// 티아지드와 같은 이뇨제의 고용량 사용은 … 저혈압의 위험성을 증가시킬 수 있다" named no second asked drug, so nothing was taken
// and the panel stopped at its judgment). pair: names two asked drugs; lead: the numbered item a later sentence sits in
// ("10) 칼륨보전이뇨제 또는 칼륨보충제"), shown with its quote so "일반적으로 병용투여는 권장되지 않는다" says about what.
function ownRecords(edge,t,citations=[]){
 const names=t.hitDrugs.map(d=>[d.name,...(d.aliases||[])].filter(Boolean).map(nameRe)),recs=[];
 const members=(t.members||[]).map(nameRe),memberIn=s=>members.some(re=>re.test(s.text));
 for(const r of t.rows.filter(r=>!isBan(r))){
  const span=edge.sourceSpans?.find(s=>s.id===r.id),raw=String(span?.excerpt??r.doc.excerpt??'');
  // The stored text breaks lines inside sentences ("… 이 약과⏎병용 처방해야 할 때에는 …"): such breaks are joined, while a
  // numbered item, a bracketed heading or a line after a full stop starts anew. Spacing does not matter when the sentence is
  // marked in its record.
  const text=joinWrapped(raw);
  const spans=sentenceSpans(text).map(s=>({...s,text:text.slice(s.start,s.end).trim()}));
  // A DUR record of another kind (임부금기, 노인주의 …) is one short statement about one drug: its head and its 금기·주의 내용.
  if(isDur(r)){const pick=spans.filter(s=>/^\[[^\]]+\]/.test(s.text)||/^금기·주의 내용:/.test(s.text));recs.push({row:r,dur:true,picks:pick.length?pick:spans.slice(0,1)});continue;}
  const cited=new Set((citations||[]).filter(c=>c.id===r.id).flatMap(c=>Object.values(c.sentences||{})).map(squash).filter(Boolean));
  const starts=itemStarts(text),item=s=>starts.filter(x=>x<=s.start).at(-1);
  // Whole sentences only, not a product's bracketed heading. A sentence the excerpt cut at its start (", 코르티코 …, 살리실산과
  // 그 유도체들): 히드로클로로티아지드의 …") shows from its last clause, marked "…", and is found in the record by that part.
  const all=spans.filter(s=>s.text.length>=12&&!/^\[/.test(s.text)&&/[.다][”"')\]]*$/.test(s.text)).map(s=>{const at=cutAt(s.text);if(at<0)return s;const tail=s.text.slice(at).replace(/^[,)\]:;·\s]+/,'');return {...s,mark:tail,show:'…'+tail};});
  const combo=/주성분:[^|\]]*;/.test(text)||/\([^()]*,[^()]*\)/.test(r.doc.title||'');
  const ingredients=(/주성분:([^|\]]*)/.exec(text)?.[1]||'');
  // The asked drug whose own single-ingredient label this record is ("프리텐션정40밀리그램(텔미사르탄)").
  const product=String(r.doc.title||'').split(' — ')[0],own=combo?-1:t.hitDrugs.findIndex(d=>[d.name,...(d.aliases||[])].some(n=>n&&nameRe(n).test(product)));
  const labelDrug=own>=0?t.hitDrugs[own].name:null;
  const asked=s=>names.filter((rs,i)=>i===own||rs.some(re=>re.test(s.text))).length;
  const isCited=s=>[...cited].some(c=>c.includes(squash(s.text))||squash(s.text).includes(c));
  const key=all.filter(s=>isCited(s)||asked(s)>=2||(memberIn(s)&&asked(s)>=1));
  const items=new Set(key.map(item));
  const leadAt=x=>/^\s*((?:[①-⑳]|\(\d{1,2}\)|\d{1,2}\))\s*[^:：\n.]{1,40}?)\s*[:：]/.exec(text.slice(x,x+90))?.[1].trim()||'';
  recs.push({row:r,dur:false,combo,ingredients,labelDrug,all:all.map(s=>({...s,key:key.includes(s),inItem:items.has(item(s)),item:item(s),pair:asked(s)>=2,cited:isCited(s),lead:s.start>item(s)+3?leadAt(item(s)):''}))});
 }
 return recs;
}
export function ownSays(edge,t,citations=[],recs=ownRecords(edge,t,citations),lookup=true){
 const seen=new Set(),out=[];
 for(const rec of recs){
  // Four at most: the sentences on two asked drugs first, then the cited ones, the other key ones and the instructions of
  // their items; shown in the record's own order.
  const rank=s=>s.pair?0:s.cited?1:s.key?2:3;
  const pool=rec.dur?[]:rec.all.filter(s=>s.key||(s.inItem&&TELL.test(s.text)));
  const top=new Set([...pool].sort((a,b)=>rank(a)-rank(b)).slice(0,4));
  const chosen=rec.dur?rec.picks.slice(0,2):pool.filter(s=>top.has(s));
  for(const s of chosen){if(seen.has(squash(s.text)))continue;seen.add(squash(s.text));out.push({text:s.show||s.text,mark:s.mark||s.text,row:rec.row,combo:!!rec.combo,lead:s.lead||''});}
 }
 // Nothing in the relation's own label text (its excerpt may stop before the pair is named): the rule lookup's sentences
 // from combination products that name both asked drugs themselves ("암로디핀과 클래리트로마이신을 병용투여시 환자를
 // 주의깊게 관찰하는 것이 권장된다"), never one that says only "이 약", instructions first, two at most (2026-11-09).
 if(lookup&&!out.some(o=>!isDur(o.row))){
  const names=t.hitDrugs.map(d=>[d.name,...(d.aliases||[])].filter(Boolean).map(nameRe)),both=m=>names.filter(rs=>rs.some(re=>re.test(m.text))).length>=2;
  const picks=t.pairs.flatMap(p=>p.label?.mentions||[]).filter(m=>!m.single&&both(m)).filter((m,i,a)=>a.findIndex(x=>squash(x.text)===squash(m.text))===i&&!seen.has(squash(m.text))).sort((a,b)=>TELL.test(b.text)-TELL.test(a.text)).slice(0,2);
  for(const m of picks)out.push({text:m.text,mark:m.text,row:{id:m.chunk_id,doc:{title:`${m.item} — ${m.section||'사용상의 주의사항'}`,sourceShort:'의약품 제품 허가정보'}},combo:true,lookup:true});
 }
 return out;
}
// The mechanism and patient parts read from the relation's own record when no single-ingredient label serves them: the
// sentences of its key items that state an effect ("… 혈압강하효과를 감소시킬 수 있다", "… 신기능 손상 악화가 보고되었다"),
// that name patients at risk, and that tell what to check ("… 주기적으로 신기능을 모니터링 해야 한다"). One record only, so
// nothing is chained across documents; the cards carry the sentences themselves, not short step names.
const EFFECT=/감소시킬|증가시킬|감소시킨|증가시킨|감소시켰|증가시켰|악화|저하시킬|상승시킬|감소될|증가될/;
const HARM_END=/악화|손상|부전|출혈|독성|저혈압|고칼륨|위험/;
const CHECK=/모니터링|검사|측정|수분을 공급|관찰/;
const GROUP=/환자|노인|고령|소아|임부|수유부|탈수/;
const markerless=s=>String(s||'').replace(/^\s*(?:[\u2460-\u2473]|\(\d{1,2}\)|\d{1,2}\))\s*/,'');
export function ownParts(t,recs){
 const rec=recs.find(r=>!r.dur&&r.all.some(s=>s.inItem));if(!rec)return null;
 const inItems=rec.all.filter(s=>s.inItem&&!/유의한\s*상호\s*작용은\s*없/.test(s.text));
 const isEffect=s=>EFFECT.test(s.text)&&!TELL.test(s.text);
 // The steps come from one numbered item, so no step is chained from another entry (2026-11-10: a 칼륨 sentence of item 10
 // was followed by item 11's 부신피질호르몬 one): the item of an effect sentence on two asked drugs, else a cited one, else
 // the first. The patients and checks are taken from that item first.
 const e0=[...inItems.filter(isEffect)].sort((a,b)=>(b.pair-a.pair)||(b.cited-a.cited))[0];
 const effects=e0?inItems.filter(s=>isEffect(s)&&s.item===e0.item).slice(0,2):[];
 const near=f=>(e0&&inItems.find(s=>f(s)&&s.item===e0.item))||inItems.find(f);
 const risk=near(s=>GROUP.test(s.text)&&/보고되었다|위험|악화/.test(s.text)&&!TELL.test(s.text));
 const check=near(s=>CHECK.test(s.text));
 // The asked drug the record's product does not contain is the one the effect sentence names by its class. In an asked
 // drug's own label it is the other asked drug the effect sentence names (히드로클로로티아지드), if any; else the sentence
 // names a member of the relation (칼륨보전이뇨제 …), shown as written.
 const other=rec.labelDrug?(e0&&t.hitDrugs.find(d=>d.name!==rec.labelDrug&&[d.name,...(d.aliases||[])].some(n=>n&&nameRe(n).test(e0.text))))||null
  :t.hitDrugs.find(d=>![d.name,...(d.aliases||[])].some(n=>n&&squash(rec.ingredients).includes(squash(n))));
 return {rec,effects,risk,check,other,phrase:effects[0]?markerless(effects[0].show||effects[0].text).split(/\s*\(|(?:은|는)\s/)[0].trim():''};
}
// The record a quote comes from, written out: "의약품 제품 허가정보(복합제) · 트윈스타정40/5밀리그램 · 사용상의 주의사항".
const ownWhere=s=>{const d=s.row.doc,[product,section]=String(d.title||'').split(' — ');return isDur(s.row)?`의약품안전사용서비스(DUR) ${d.category||''}`.trim():[`${sourceName(d)}${s.combo?'(복합제)':''}`,product,section].filter(Boolean).join(' · ');};

// The sentences of a loaded record with the numbered section ("2. 다음 환자에는 투여하지 말 것") each sits in.
const headsOf=t=>[...t.matchAll(/(?:^|\n)\s*(\d{1,2})\.\s*([^\n]{2,40})/g)].map(m=>({at:m.index,end:m.index+m[0].length,name:`${m[1]}. ${m[2].trim().replace(/\.$/,'')}`}));
function sentencesOf(text){
 const t=String(text||''),heads=headsOf(t);
 return sentenceSpans(t).map(s=>({text:t.slice(s.start,s.end),start:s.start,end:s.end,section:heads.filter(h=>h.at<=s.start).at(-1)?.name||''}));
}
// The numbered items ("2) 신장애 또는 그 병력이 있는 환자(…)") of one section of a loaded record, each with its lead words
// (before the bracket that explains it), so a list section is read item by item rather than sentence by sentence.
function sectionItems(text,re){
 const t=String(text||''),heads=headsOf(t),i=heads.findIndex(h=>re.test(h.name));if(i<0)return [];
 const body=t.slice(heads[i].end,heads[i+1]?.at??t.length),name=heads[i].name;
 // lead: the item without its explanations in brackets, which are shown as "(…)"; mark: its literal opening words.
 return body.split(/(?=(?:^|\s)\d{1,2}\)\s)/).map(s=>s.trim()).filter(s=>/^\d{1,2}\)\s/.test(s)).map(s=>({text:s,lead:s.replace(/\([^()]*\)/g,'(…)').split('.')[0].replace(/\s*\(…\)\s*$/,'').trim(),mark:s.split('(')[0].trim(),section:name}));
}
// Words that name the harm ("근병증", "횡문근융해", "출혈", "저혈압"), taken from the DUR reason and the label sentences
// about the pair, used to keep patient lines on topic. Drug names and words like "혈중농도" are not harms.
const HARM=/[가-힣]*(?:병증|근증|융해|출혈|저혈압|고칼륨|부전|손상|증후군|발작|부정맥|독성|궤양|저혈당|호흡억제)/g;
function outcomeWords(...texts){
 const words=new Set();
 for(const t of texts)for(const m of String(t||'').matchAll(HARM)){const x=m[0].replace(/^(?:의|을|를|이|가|및|과|와)/,'');if(x.length>=2)words.add(x);}
 for(const w of [...words]){if(w==='근병증')words.add('근육병증');if(w==='근육병증')words.add('근병증');}
 return [...words];
}
const hasAny=(s,words)=>words.some(w=>s.includes(w));
// A sentence that tells what to do with the combination, not one that reports a measured change.
const tells=s=>/권장되지 않|하지 않는다|하지 말|피한다|피해야|중지|투여하지|병용하지/.test(s)&&!/%/.test(s);
// The changes an effect sentence states, each read with the direction written right after it ("배설을 감소시킴",
// "활성 대사체의 약물 농도가 낮아질"), else with the sentence's only direction. Exposure and AUC both read "노출".
const UP=/증가|높아|상승/,DOWN=/감소|낮아|저하/;
export function changesIn(text){
 const t=String(text||''),only=UP.test(t)&&!DOWN.test(t)?'증가':DOWN.test(t)&&!UP.test(t)?'감소':'',out=[];
 for(const m of t.matchAll(/(활성\s*대사체의?\s*)?(배설|(?:혈장|혈중|약물)\s*농도|노출|AUC)/g)){
  const near=/^[^.,]{0,12}?(증가|높아|상승|감소|낮아|저하)/.exec(t.slice(m.index+m[0].length))?.[1];
  const dir=near?(UP.test(near)?'증가':'감소'):only;if(!dir)continue;
  const noun=m[2]==='AUC'?'노출':m[2].replace(/^약물\s*/,'');
  out.push(`${m[1]?'활성 대사체 ':''}${noun} ${dir}`);
 }
 // In the order of cause and effect: excretion, then concentration, then exposure.
 const kind=s=>/배설/.test(s)?0:/농도/.test(s)?1:2;
 return [...new Set(out)].sort((a,b)=>kind(a)-kind(b));
}

// The mechanism the label writes down: the other drug as an enzyme inhibitor (rule lookup), this drug's metabolism by that
// enzyme, the effect of such inhibitors on it, and the harm, each from the primary label. Null unless the effect sentence
// is found; nothing is chained from different documents.
function mechanism(t,texts,reg,reason){
 const em=t.mentions.find(m=>m.enzymes?.length&&m.item===t.primary);if(!em)return outcomeOnly(t,reg);
 const enzyme=em.enzymes[0],e=enzyme.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const phrase=new RegExp(`(?:(?:강력한|강한|중간 정도의|중등도의)\\s*)?(?:사이토크롬\\s*)?${e}\\s*(?:에 대한\\s*)?(?:억제제|저해제|유도제)`).exec(em.text)?.[0]||`${enzyme} 관련 약물`;
 const pool=t.mentions.filter(m=>m.item===t.primary).map(m=>m.chunk_id).filter((id,i,a)=>a.indexOf(id)===i&&texts.get(id)?.content).flatMap(id=>sentencesOf(texts.get(id).content).map(s=>({...s,id})));
 // "에 의해 대사", and for a drug that works through its active metabolite "를 통해 활성 대사체로 대사" (클로피도그렐).
 const metab=pool.find(s=>new RegExp(`${e}(?:에 의하여|에 의해서|에 의해|을 통해|를 통해|로|으로)\\s*(?:주로\\s*)?(?:활성\\s*대사체로\\s*)?대사`).test(s.text));
 // The effect: the enzyme, an inhibitor, what changes and which way. The usual wording ("억제제 … 혈장 농도 … 증가")
 // first; only when no sentence has it, the wording of a drug whose active metabolite falls ("저해하는 약물 … 약물 농도가
 // 낮아질"), so the labels that read well before keep their sentences.
 const usual=s=>/억제제|저해제/.test(s.text)&&/(배설|혈장\s*농도|혈중\s*농도|노출|AUC)/.test(s.text)&&/(증가|감소)/.test(s.text);
 const other=s=>/억제|저해|간섭/.test(s.text)&&/(배설|(?:혈장|혈중|약물)\s*농도|노출|AUC)/.test(s.text)&&(UP.test(s.text)||DOWN.test(s.text));
 const named=pool.filter(s=>new RegExp(e).test(s.text)&&!/%/.test(s.text)),risk=(a,b)=>(/위험/.test(b.text)?1:0)-(/위험/.test(a.text)?1:0);
 const effects=(named.some(usual)?named.filter(usual):named.filter(other)).sort(risk).slice(0,2);
 if(!effects.length)return null;
 // Each change in the direction the sentence gives (2026-11-09: it used to say "노출 증가" whatever the sentence said).
 const all=effects.map(s=>s.text).join(' '),change=changesIn(all).join(', ');
 const harm=/([가-힣/]+)의\s*위험(?:성)?(?:이|을)?\s*증가/.exec(all);
 // When the active metabolite falls, the label's next sentence after the measured fall with the other drug says what
 // weakens ("이러한 감소는 혈소판 응집 억제의 39 % … 감소와 연관되었다"); that is the last step, word for word.
 let weaker=null;
 if(!harm&&/감소/.test(change))for(const m of t.mentions.filter(m=>m.item===t.primary&&/노출|농도/.test(m.text)&&DOWN.test(m.text))){
  const full=texts.get(m.chunk_id)?.content,next=full&&sentencesOf(full).find(s=>s.start>=m.end-1&&s.start<=m.end+3);
  const what=next&&DOWN.test(next.text)&&/(?:^|\s)((?:[가-힣]+\s){0,2}[가-힣]+)의\s*\d/.exec(next.text);
  if(what){weaker={text:`${what[1]} 감소`,id:m.chunk_id,mark:next.text,section:next.section};break;}
 }
 const src=id=>reg.add(id,t.primary),A=em.about;
 const steps=[{text:em.names,sub:phrase,src:src(em.chunk_id),mark:em.text},metab&&{text:`${A}${eun(A)} ${enzyme}에 의해 ${/활성\s*대사체로/.test(metab.text)?'활성 대사체로 ':''}대사`,src:src(metab.id),mark:metab.text},{text:change,src:src(effects[0].id),mark:effects[0].text},harm?{text:`${harm[1]} 위험 증가`,src:src(effects[0].id),mark:effects[0].text,end:true}:weaker?{text:weaker.text,src:src(weaker.id),mark:weaker.mark,end:true}:reason&&{text:reason,src:src(effects[0].id),mark:effects[0].text,end:true}].filter(Boolean);
 for(const s of [metab,...effects,weaker].filter(Boolean))src(s.id).sections.add(s.section);
 reg.byId.get(em.chunk_id).sections.add(em.section);
 // 핵심 포인트: the label's own sentence that says the most (the effect sentence naming the harm), word for word.
 return {steps,key:{text:effects[0].text,src:reg.byId.get(effects[0].id)},item:t.primary,harm:harm?.[1]||''};
}

// The primary label names no enzyme but states what the combination does ("6) 칼슘채널차단제 : 이 약과 베라파밀, 딜티아젬 또는
// 암로디핀의 병용투여에 의하여 근육병증/횡문근융해의 위험성이 증가한다."): two steps, the other drug as the label groups it,
// then the outcome it states; the sentence itself is the key point (2026-11-10: such pairs found no mechanism at all).
function outcomeOnly(t,reg){
 const states=m=>/위험(?:성)?(?:이|을)?\s*(?:증가|높)|(?:농도|노출|AUC)[^.]{0,30}(?:증가|감소)|(?:증가|감소)(?:시킨|시켰|시킬|한다|하였|될)/.test(m.text);
 const m=t.mentions.filter(x=>x.item===t.primary&&x.single&&states(x)).sort((a,b)=>(/위험/.test(b.text)?1:0)-(/위험/.test(a.text)?1:0))[0];
 if(!m)return null;
 const other=t.hits.find(h=>norm(h)!==norm(m.about||''))||t.hits[1]||t.hits[0];
 const group=/^\s*(?:[①-⑳]|\(\d{1,2}\)|\d{1,2}\))?\s*([^:：()]{2,24}?)\s*[:：]/.exec(m.text)?.[1]?.trim()||'';
 const harm=/([가-힣/]+)의\s*위험(?:성)?(?:이|을)?\s*(?:증가|높)/.exec(m.text)?.[1];
 const change=changesIn(m.text).join(', ');
 const src=reg.add(m.chunk_id,m.item);if(m.section)src.sections.add(m.section);
 const steps=[{text:other,sub:group&&norm(group)!==norm(other)?`원문 표현: ${group}`:'',src,mark:m.text},harm?{text:`${harm} 위험 증가`,src,mark:m.text,end:true}:change?{text:change,src,mark:m.text,end:true}:{text:cut(m.text,110),src,mark:m.text,end:true}];
 return {steps,key:{text:m.text,src},item:m.item,harm:harm||''};
}
// What the label says to check in a patient, one line each, and whether the question already gives it.
function patient(t,texts,reg,question,words){
 const q=String(question||''),out=[];
 // A dose limit the label sets when another asked drug is also taken (from the rule lookup's sentences for that pair).
 for(const p of t.extra){
  const other=t.others.find(o=>o.i===p.a||o.i===p.b);if(!other)continue;
  // Only a single-ingredient label speaking of itself ("이 약의 용량은 …"), so the dose is surely that drug's.
  const m=(p.label?.mentions||[]).find(m=>m.single&&m.action&&t.hitNames.includes(m.about)&&/이 약/.test(m.text)&&/\d+(?:\.\d+)?\s*(?:mg|밀리그램)/.test(m.text));
  if(!m)continue;
  const src=reg.add(m.chunk_id,m.item);src.sections.add(m.section);
  out.push({what:`${m.about} 용량`,text:m.text,src,section:m.section,status:`질문: ${other.name} 복용 중`,known:true,note:/\d+\s*(?:mg|밀리그램)/.test(q)?'':'용량은 질문에 없음'});
 }
 const pool=t.mentions.filter(m=>m.item===t.primary).map(m=>m.chunk_id).filter((id,i,a)=>a.indexOf(id)===i&&texts.get(id)?.content).flatMap(id=>sentencesOf(texts.get(id).content).map(s=>({...s,id})));
 const age=/(\d{1,3})\s*세/.exec(q)?.[0],sex=/여성|남성|임신|임부/.exec(q)?.[0];
 const stats=/%|명을 대상|발병률|발현율|발생률/;
 const push=(what,s,given)=>{const src=reg.add(s.id,t.primary);src.sections.add(s.section);out.push({what,text:s.text,mark:s.mark||s.text,src,section:s.section,status:given?`질문: ${given}`:'질문에 없음',known:!!given,note:''});};
 const risk=pool.find(s=>/유발하는 요소|위험\s*인자|위험\s*요인/.test(s.text)&&hasAny(s.text,words)&&!stats.test(s.text));
 if(risk)push('위험 요인',risk,age||sex||'');
 // 신중히 투여할 것: the items whose wording names the harm, by their lead words.
 for(const id of t.mentions.filter(m=>m.item===t.primary).map(m=>m.chunk_id).filter((x,i,a)=>a.indexOf(x)===i)){
  const items=sectionItems(texts.get(id)?.content,/신중히 투여/).filter(x=>hasAny(x.text,words)).slice(0,3);
  if(items.length){push('신중 투여 대상',{id,text:items.map(x=>x.lead).join(' · '),mark:items[0].mark,section:items[0].section},/신장|신기능|간기능|간장애|병력|알코올/.exec(q)?.[0]||'');break;}
 }
 // A genetic difference in the enzyme of the mechanism ("CYP2C19에서 유전적 변이 …"), when the label names one.
 const enzyme=t.mentions.find(m=>m.enzymes?.length&&m.item===t.primary)?.enzymes[0];
 const gene=enzyme&&pool.find(s=>s.text.includes(enzyme)&&/유전적\s*(?:변이|다형성)|유전자형|대사\s*(?:능력\s*)?저하자|poor metabolizer/i.test(s.text)&&!stats.test(s.text));
 if(gene)push('유전적 요인',gene,/유전|유전자/.exec(q)?.[0]||'');
 const report=pool.find(s=>/즉시/.test(s.text)&&/(알리|보고)/.test(s.text)&&hasAny(s.text,words));
 if(report)push('알려야 할 증상',report,/근육통|통증|증상|압통|약화/.exec(q)?.[0]||'');
 const lab=pool.filter(s=>/(CK|크레아틴키나아제|INR|칼륨|크레아티닌)/.test(s.text)&&hasAny(s.text,words)&&!stats.test(s.text)).sort((a,b)=>(/정상\s*상한치|동반|의미/.test(b.text)?1:0)-(/정상\s*상한치|동반|의미/.test(a.text)?1:0)||a.text.length-b.text.length)[0]; // a definition ("CK … 10배 이상을 동반") before other mentions
 if(lab)push('검사 수치',lab,/CK|INR|수치|검사/.exec(q)?.[0]||'');
 return out;
}

export function sourceRow(x,texts){
 const d=x.doc||texts.get(x.id)||{},dur=x.own&&/DUR/.test(d.sourceShort||d.sourceLabel||'');
 const title=(dur&&durTitle(d.excerpt))||d.title||x.title||x.id;
 const date=dur?originRow(d,'고시일자')&&`${originRow(d,'고시일자')} 고시`:originRow(d,'최근 변경')?`허가정보 최근 변경 ${originRow(d,'최근 변경')}`:'';
 const kind=dur?`의약품안전사용서비스(DUR) ${d.category||''}`.trim():sourceName(d);
 const where=[...x.sections].filter(Boolean).join(' · ');
 return `<div class="xs-row"><div class="xs-main"><span class="es-no">근거 ${x.no}</span><strong>${esc(title)}</strong><small>${esc([kind,where,date].filter(Boolean).join(' · '))}</small></div><button type="button" class="es-btn" data-open-document="${esc(x.id)}">원문 보기${icon('open',13)}</button></div>`;
}

export const XAI_GUIDE=`<details class="xp-info"><summary title="새 구성 보는 법" aria-label="새 구성 보는 법">${INFO_ICON}</summary><div class="xp-info-body"><p>모든 문장은 의약품안전사용서비스(DUR) 기록과 의약품 제품 허가정보의 원문을 그대로 옮긴 것입니다. '근거 n' 버튼이나 기전의 단계를 누르면 원문에서 그 문장이 표시됩니다.</p><p>질문한 약의 의약품안전사용서비스(DUR) 병용금기나 단일 성분 제품의 허가정보 문장이 없는 관계는, 그 관계를 뽑아낸 원문(복합제 허가정보, 다른 분류의 DUR 기록 등)을 출처와 함께 보여 줍니다.</p><p>판단의 한 줄 설명은 원문의 분류(의약품안전사용서비스(DUR) 병용금기, 의약품 제품 허가정보의 '투여하지 말 것' 등)를 그대로 옮긴 것이며, 서비스의 권고가 아닙니다.</p><p>기전은 의약품 제품 허가정보의 한 문서 안에 적힌 단계만 보여 주며, 다른 자료를 이어 붙이지 않습니다. 핵심 포인트는 그 문서의 원문 한 문장입니다.</p><p>환자별 확인 사항은 원문이 언급한 환자 요인입니다. 질문에 그 정보(복용 중인 약, 나이 등)가 있으면 항목 아래에 적습니다. 개인의 위험을 계산하지 않습니다.</p><p>원문에서 찾지 못한 칸은 찾지 못했다고 적습니다. 기록이 없다는 것은 안전하다는 뜻이 아닙니다.</p></div></details>`;
// The line a part shows when the records give it nothing (2026-11-10: the part was left out).
const NOT_FOUND=what=>`이 관계의 원문에서 ${what}을 찾지 못했습니다. 찾지 못했다고 안전하다는 뜻은 아닙니다.`;

// The whole panel, or '' when it does not apply (the caller then shows the previous layout). loading: label records are
// still being read, so the mechanism and patient parts say so instead of being left out.
export function xaiHTML(edge,graph,{drugs=[],clinical=null,clinicalPending=false,texts=new Map(),question='',loading=false,part='all',citations=[]}={}){
 const t=xaiTarget(edge,graph,drugs,clinical);if(!t)return '';
 // DUR records of two single-ingredient sides first: they name the asked drugs themselves, not a combination product.
 const direct=r=>/\(단일제\)과\(와\).*\(단일제\)(?:은|는)/.test(r.doc.excerpt||'');
 const reg=registry(t.rows),durRows=t.rows.filter(isBan).sort((a,b)=>direct(b)-direct(a));
 const reason=durRows.map(r=>reasonOf(r.doc.excerpt)).find(Boolean)||'';
 const listed=t.pairs.find(p=>p.dur?.listed);
 const reasonText=reason||listed?.dur?.reasons?.[0]||'';
 const scope=t.total>t.hits.length?`질문한 ${t.total}개 약 중 ${t.hits.length}개`:`질문한 약 ${t.hits.length}개 모두`;
 // What the official records say: the DUR sentence, then the label's own instructions for this pair (and the one that
 // follows them in the label when it tells what to do if the combination cannot be avoided).
 const says=[];
 if(durRows[0])says.push({text:durRows[0].quote,src:reg.byId.get(durRows[0].id),where:`의약품안전사용서비스(DUR) ${durRows[0].doc.category||''}`.trim(),more:durRows.slice(1).map(r=>reg.byId.get(r.id).no)});
 // The label's own words for this pair: its "투여하지 말 것" item first, then an instruction under 경고, 일반적 주의 or
 // 상호작용, one per section, two at most (the rule lookup's sentences, literal slices of the record).
 const rank=s=>/투여하지 말 것/.test(s)?0:/경고/.test(s)?1:/일반적 주의/.test(s)?2:/상호작용/.test(s)?3:9;
 // Within one section an instruction ("병용하는 것은 권장되지 않는다") comes before a measurement ("노출이 45 % 감소되었다"),
 // whatever order the rule lookup returned them in (2026-11-09: 클로피도그렐 + 오메프라졸 showed only the measurement).
 const acts=t.mentions.filter(m=>m.item===t.primary&&(/투여하지 말 것/.test(m.section||'')||(m.action&&rank(m.section||'')<9))).sort((a,b)=>rank(a.section)-rank(b.section)||tells(b.text)-tells(a.text));
 for(const m of acts.filter((m,i,a)=>a.findIndex(x=>x.section===m.section)===i).slice(0,2)){
  const src=reg.add(m.chunk_id,m.item);src.sections.add(m.section);says.push({text:m.text,src,where:`의약품 제품 허가정보 · ${m.item} · ${m.section}`});
  const full=texts.get(m.chunk_id)?.content;
  if(full&&!/불가피/.test(m.text)){const next=sentencesOf(full).find(s=>s.start>=m.end-1&&s.start<=m.end+3);if(next&&/불가피|일시적으로/.test(next.text))says.push({text:next.text,src,where:`의약품 제품 허가정보 · ${m.item} · ${m.section}`});}
 }
 // One line on top, taken from the strongest class the records give (not the service's advice), then the quotes numbered
 // 1, 2, 3 … each with a button to its record.
 const official=durRows.length||listed?{text:'두 약을 함께 쓰지 않습니다.',from:'의약품안전사용서비스(DUR) 병용금기 기록의 문장',level:'contra'}:acts.some(m=>/투여하지 말 것/.test(m.section||''))?{text:'의약품 제품 허가정보가 함께 투여하지 말 것으로 적고 있습니다.',from:'의약품 제품 허가정보의 "다음 환자에는 투여하지 말 것" 항목',level:'contra'}:{text:'의약품 제품 허가정보에 함께 쓸 때의 주의가 적혀 있습니다.',from:'의약품 제품 허가정보의 주의 항목',level:'caution'};
 // No official record speaks for the pair, or none of its sentences is an instruction: the relation's own records speak
 // (ownSays), named in full with what they are, and the line on top follows their words. With nothing to quote it says
 // there is no such record, which does not mean the combination is safe (2026-11-09).
 // A single-ingredient label sentence on the pair that is not an instruction ("… 병용투여시 추가적인 혈압강하 효과를
 // 나타낸다") is quoted too, two at most, and the line on top says it is not one.
 const info=says.length?[]:t.mentions.filter(m=>m.item===t.primary).filter((m,i,a)=>a.findIndex(x=>x.text===m.text)===i).slice(0,2);
 for(const m of info){const src=reg.add(m.chunk_id,m.item);if(m.section)src.sections.add(m.section);says.push({text:m.text,src,where:['의약품 제품 허가정보',m.item,m.section].filter(Boolean).join(' · ')});}
 const ownRecs=durRows.length||acts.length?[]:ownRecords(edge,t,citations);
 // Only when no official record speaks; the combination labels the rule lookup found come in only when the pair has no
 // single-ingredient label sentence at all.
 const own=durRows.length||acts.length?[]:ownSays(edge,t,citations,ownRecs,!info.length).filter(o=>!info.some(m=>squash(m.text)===squash(o.text)));
 for(const o of own)says.push({text:o.text,mark:o.mark,src:reg.byId.get(o.row.id)||reg.add(o.row.id,o.row.doc.title.split(' — ')[0]),where:[ownWhere(o),o.lead].filter(Boolean).join(' · ')});
 const ownSummary=()=>{
  const not='의약품안전사용서비스(DUR) 병용금기에는 없습니다';
  const ban=own.find(o=>!isDur(o.row)&&BAN.test(o.text)),tell=own.find(o=>!isDur(o.row)&&TELL.test(o.text)),dur=own.find(o=>isDur(o.row));
  if(ban)return {text:`${sourceName(ban.row.doc)}가 함께 쓰지 말 것으로 적고 있습니다.`,from:`${ownWhere(ban)}의 문장 · ${not}`,level:'contra'};
  if(tell)return {text:`${sourceName(tell.row.doc)}에 함께 쓸 때의 주의가 적혀 있습니다.`,from:`${ownWhere(tell)}의 문장 · ${not}`,level:'caution'};
  if(dur)return {text:`의약품안전사용서비스(DUR) ${dur.row.doc.category||''} 기록이 있습니다.`.replace(/\s+기록/,' 기록'),from:'질문한 약을 함께 쓸 때의 병용금기 기록은 아닙니다',level:'caution'};
  return {text:'공식 기록에는 이 약들을 함께 쓸 때의 지시가 없습니다.',from:own.length?'아래는 이 관계를 뽑아낸 원문입니다. 기록이 없다는 것은 안전하다는 뜻이 아닙니다.':'기록이 없다는 것은 안전하다는 뜻이 아닙니다.',level:'none'};
 };
 const told=own.some(o=>!isDur(o.row)&&(BAN.test(o.text)||TELL.test(o.text)));
 // The line on top: an instruction among the relation's records, else its own DUR record of another kind, else a label
 // sentence on the pair that instructs nothing.
 const summary=durRows.length||listed?official:acts.length?official:told||own.some(o=>isDur(o.row))||!info.length?ownSummary():{text:'의약품 제품 허가정보에 함께 쓸 때의 내용이 적혀 있습니다.',from:'지시하는 문장은 아닙니다 · 의약품안전사용서비스(DUR) 병용금기에는 없습니다',level:'none'};
 const go=(src,sentence)=>`<button type="button" class="xai-go" data-open-document="${esc(src.id)}" data-marks="${esc(JSON.stringify([sentence]))}" title="원문에서 이 문장 보기">근거 ${src.no}${icon('open',13)}</button>`;
 const needText=t.primary&&loading;
 const mech=mechanism(t,texts,reg,reasonText);
 // Each step is a card that opens its record with the sentence marked; the key point beside them is the label's own
 // sentence. Card tints deepen down the steps in the relation's map color.
 const step=(s,i)=>`${i?`<span class="xai-arrow">${icon('down',14)}</span>`:''}<button type="button" class="xai-step s${Math.min(i+1,4)}${s.end?' end':''}" data-open-document="${esc(s.src.id)}" data-marks="${esc(JSON.stringify([s.mark]))}" title="근거 ${s.src.no} 원문에서 이 단계 보기">${s.end?icon('alert',16):''}<span>${esc(s.text)}${s.sub?`<small>${esc(s.sub)}</small>`:''}</span></button>`;
 const rows=patient(t,texts,reg,question,outcomeWords(reasonText,mech?.harm,...t.mentions.filter(m=>m.item===t.primary).map(m=>m.text)));
 // Without a single-ingredient label to read, the relation's own record fills the mechanism and the patient parts
 // (ownParts, 2026-11-09): its effect sentences as cards under the drug it names by class, its patients at risk and what to
 // check. A sentence moved there leaves the judgment's quotes, which keep at least one instruction and one quote.
 // The mechanism is read there whenever the label gives none, also when the patient part has rows of its own (2026-11-10).
 const ownP=!mech&&!needText&&own.length?ownParts(t,ownRecs):null;
 let mechOwn=null;
 if(ownP?.effects.length){
  const src=reg.byId.get(ownP.rec.row.id),e0=ownP.effects[0],where=ownWhere({row:ownP.rec.row,combo:ownP.rec.combo}).split(' · ').slice(0,2).join(' · ');
  // In an asked drug's own label whose effect sentence names no other asked drug, the first card is what it names
  // (칼륨보전이뇨제), taken with that drug; otherwise the other asked drug, with the label's own words for it.
  const L=ownP.rec.labelDrug,first=L&&!ownP.other?{text:ownP.phrase||t.hits.join(' + '),sub:`${L}${last(L)>0?'과':'와'} 함께 쓸 때`}:{text:ownP.other?.name||t.hits.join(' + '),sub:ownP.phrase&&ownP.phrase!==ownP.other?.name?`원문 표현: ${ownP.phrase}`:''};
  const steps=[{...first,src,mark:e0.mark||e0.text},
   // A card leaves out the bracketed examples ("(예, 항염증요법으로서 …)") so the sentence's end shows; the whole sentence is
   // what its button marks in the record and what the key point quotes.
   ...ownP.effects.map((x,i,a)=>({text:cut(markerless(x.show||x.text).replace(/\s*\([^()]*\)/g,''),110),src,mark:x.mark||x.text,end:i===a.length-1&&HARM_END.test(x.text)}))];
  mechOwn={steps,key:{text:e0.show||e0.text,mark:e0.mark||e0.text,src},where};
 }
 if(ownP&&!rows.length){
  const src=reg.byId.get(ownP.rec.row.id),q=String(question||''),age=/(\d{1,3})\s*세/.exec(q)?.[0]||'';
  const add=(what,x,given)=>{if(x)rows.push({what,text:x.show||x.text,mark:x.mark||x.text,src,section:'',status:given?`질문: ${given}`:'질문에 없음',known:!!given,note:''});};
  add('위험 요인',ownP.risk,/노인|고령/.test(ownP.risk?.text||'')?age:'');
  add('확인·검사',ownP.check,/신기능|검사|수치/.exec(q)?.[0]||'');
 }
 const moved=new Set([...(mechOwn?ownP.effects:[]),...(rows.some(r=>ownP&&r.src===reg.byId.get(ownP.rec.row.id))?[ownP.risk,ownP.check]:[])].filter(Boolean).map(x=>squash(x.mark||x.text)));
 // A moved sentence leaves the judgment, except the one instruction it would otherwise lose (2026-11-10: when the only
 // instruction moved, every moved sentence stayed and showed twice).
 if(moved.size){
  const isOwn=x=>own.some(o=>o.text===x.text),gone=x=>isOwn(x)&&moved.has(squash(x.mark||x.text));
  const keepTell=told&&!says.some(x=>!gone(x)&&isOwn(x)&&TELL.test(x.text));
  const left=says.filter(x=>!gone(x)||(keepTell&&TELL.test(x.text)));
  if(left.length)says.splice(0,says.length,...left);
 }
 const judgment=`<section class="xai-sec"><h4>${icon('doc')}HyperRx의 판단</h4><p class="xai-summary ${summary.level}">${icon(summary.level==='contra'?'alert':'notice')}<span><strong>${esc(summary.text)}</strong><small>${esc(summary.from)}</small></span></p>${says.length?`<ol class="xai-says">${says.map(s=>`<li><div class="xai-said"><small>${esc(s.where||'')}</small><p>“${esc(cut(s.text,320))}”</p>${s.more?.length?`<span class="xai-more">같은 분류 기록 ${s.more.length}건 더 (근거 ${s.more.join(', ')})</span>`:''}</div>${go(s.src,s.mark||s.text)}</li>`).join('')}</ol>`:''}</section>`;
 const M=mech||mechOwn;
 const mechHTML=M?`<section class="xai-sec"><h4>${icon('flask')}상호작용 기전</h4><div class="xai-mech"><div class="xai-flow">${M.steps.map(step).join('')}</div><aside class="xai-key"><p class="xai-key-title">${icon('bulb',16)}핵심 포인트</p><p>“${esc(cut(M.key.text,220))}”</p><button type="button" class="xai-key-src" data-open-document="${esc(M.key.src.id)}" data-marks="${esc(JSON.stringify([M.key.mark||M.key.text]))}">${esc(M.where||`의약품 제품 허가정보 · ${M.item}`)} · 근거 ${M.key.src.no}</button></aside></div></section>`:needText?`<section class="xai-sec"><h4>${icon('flask')}상호작용 기전</h4><p class="hint">의약품 제품 허가정보 원문을 읽는 중입니다…</p></section>`:`<section class="xai-sec"><h4>${icon('flask')}상호작용 기전</h4><p class="hint xai-none">${NOT_FOUND('상호작용 기전을 설명하는 문장')}</p></section>`;
 // Nothing to read beyond the record list: the previous layout says more.
 const patientHTML=rows.length?`<section class="xai-sec"><h4>${icon('user')}환자별 확인 사항</h4><table class="xai-table"><colgroup><col style="width:26%"><col><col style="width:76px"></colgroup><thead><tr><th>확인할 것</th><th>원문</th><th>근거</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.what)}${r.known?`<span class="xai-given">${esc(r.status)}</span>`:''}${r.note?`<small>${esc(r.note)}</small>`:''}</td><td>“${esc(cut(r.text,170))}”</td><td>${go(r.src,r.mark||r.text)}</td></tr>`).join('')}</tbody></table></section>`:needText?`<section class="xai-sec"><h4>${icon('user')}환자별 확인 사항</h4><p class="hint">의약품 제품 허가정보 원문을 읽는 중입니다…</p></section>`:`<section class="xai-sec"><h4>${icon('user')}환자별 확인 사항</h4><p class="hint xai-none">${NOT_FOUND('환자별로 확인할 내용')}</p></section>`;
 const waiting=clinicalPending?'<p class="hint">의약품안전사용서비스(DUR)와 의약품 제품 허가정보를 조회하는 중입니다…</p>':'';
 const mine=reg.list.filter(x=>x.own),label=reg.list.filter(x=>!x.own);
 const list=`${mine.length?`<p class="xai-group">이 관계의 기록</p>${mine.map(x=>sourceRow(x,texts)).join('')}`:''}${label.length?`<p class="xai-group">같은 약 쌍의 의약품 제품 허가정보</p>${label.map(x=>sourceRow(x,texts)).join('')}`:''}`;
 if(part==='sources')return `<div class="xai xai-sources-tab"><p class="hint">${esc(t.hits.join(' + '))} 관계의 근거 ${reg.list.length}건입니다. 번호는 약물관계 설명의 '근거 n'과 같습니다.</p>${list}</div>`;
 const cls=durRows.length?`의약품안전사용서비스(DUR) ${durRows[0].doc.category||''}`.trim():listed?'의약품안전사용서비스(DUR) 병용금기':acts[0]||info[0]?`의약품 제품 허가정보 · ${(acts[0]||info[0]).section||'사용상의 주의사항'}`:own[0]?ownWhere(own[0]).split(' · ')[0]:'';
 // The chosen relation as a card tinted with its map color (not a risk color).
 const contra=summary.level==='contra';
 const asked=new Set(t.hitDrugs.flatMap(d=>[...(d.ids||[])])),nodeName=id=>graph.nodes.find(n=>n.id===id)?.label||id,withs=[...new Set(edge.members.filter(id=>!asked.has(id)).map(nodeName))];
 const head=`<header class="xai-card"><div class="xai-tags"><span class="badge">선택한 관계</span><span class="xai-scope">${esc(scope)}</span>${XAI_GUIDE}</div><div class="xai-card-main"><span class="xai-card-icon">${icon(contra?'alert':'notice',26)}</span><div>${cls?`<p class="xai-class">${esc(cls)}</p>`:''}<h3>${esc(t.hits.join(' + '))}</h3>${withs.length?`<p class="xai-with">함께 든 항목: ${esc(withs.slice(0,6).join(', '))}${withs.length>6?` 외 ${withs.length-6}개`:''}</p>`:''}<p class="xai-reason">${reasonText?`금기·주의 내용: ${esc(reasonText)}${durRows[0]?` ${chip(reg.byId.get(durRows[0].id),durRows[0].quote)}`:''}`:esc(edge.label)}</p></div></div></header>`;
 const sources=part==='main'?'':`<details class="xp-sources xai-sources"><summary><h4>${icon('book')}근거 및 출처 <span class="xp-count">${reg.list.length}건</span></h4><span class="xp-caret" aria-hidden="true"></span></summary>${list}</details>`;
 return `<div class="xai">${head}${waiting}${judgment}${mechHTML}${patientHTML}${sources}</div>`;
}

// The 근거 및 출처 tab for a relation shown in the previous layout: its own records, numbered as in that layout.
export function relationSourcesHTML(edge,graph){
 const rows=edgeSources(edge,graph);if(!rows.length)return '<p class="hint">이 관계에 연결된 원문이 없습니다.</p>';
 return `<div class="xai xai-sources-tab"><p class="hint">${esc(edge.label)} 관계의 근거 ${rows.length}건입니다.</p><p class="xai-group">이 관계의 기록</p>${registry(rows).list.map(x=>sourceRow(x,new Map())).join('')}</div>`;
}
