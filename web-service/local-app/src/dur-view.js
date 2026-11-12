// "의약품안전사용서비스(DUR) 점검표" view (2026-11-10: every DUR on it written out, src/terms.js), next to the map, flow and table. It reads the DB server's rule lookup (/api/clinical, clinical.py; no AI
// call), not the answer's relations: one row per asked drug and one column per DUR list, then one row per pair for 병용금기
// and for 효능군 중복 (the 효능군·계열 names the two drugs' records give). A cell repeats what the record says (grade, age, dose, days,
// class) and never judges it. An empty cell means the list has no record, which is not the same as safe. Colors stay
// neutral (only verdict badges carry risk) and numbers are record counts.
import {esc,INFO_ICON,sourceLine} from './sources.js';
import {fullTerms} from './terms.js';
import {FLAG_ORDER} from './clinical-view.js';

const NAME={특정연령대금기:'연령금기'};
export const durName=c=>NAME[c]||c;
const NOT_SAFE='기록이 없다는 것은 목록에 없다는 뜻일 뿐이며, 안전하다는 뜻은 아닙니다.';
const PATIENT='나이, 임신 여부, 용량, 복용 기간 같은 환자 정보는 이 화면에서 받지 않습니다. 환자 상태는 직접 확인하세요.';
// What a flag's record says, in a few words, as written in the record.
export function flagValue(f){
 if(!f)return '';
 if(f.category==='임부금기')return f.grade||'등급 미기재';
 // The record says "최대 투여량: 암로디핀 10밀리그램"; "최대 암로디핀 10밀리그램" read oddly (2026-11-10).
 if(f.category==='용량주의')return f.max_dose?`최대 투여량 ${f.max_dose}`:'최대 투여량 미기재';
 if(f.category==='투여기간주의')return f.max_days?`최대 투여기간 ${f.max_days}`:'투여기간 미기재';
 if(f.category==='특정연령대금기')return f.age||'연령 미기재';
 if(f.category==='효능군중복')return f.group||'효능군 미기재';
 return '목록에 있음';
}
const groupOf=d=>d.flags.find(f=>f.category==='효능군중복')||null;
// 은/는 after a name: "클래리트로마이신은", "아스피린은", "로사르탄은"; a name not ending in Hangul gets "은(는)".
const eunNeun=w=>{const c=String(w||'').trim().slice(-1).charCodeAt(0)-0xAC00;return c>=0&&c<11172?(c%28?'은':'는'):'은(는)';};
// 효능군 중복: the 효능군 and 계열 names two drugs' 효능군중복 records give, compared as written. The cell says the result
// first (text) and what it rests on under it (detail): 2026-11-10, "암로디핀만 효능군 기록 있음" did not say what it meant.
// A drug missing from the list has no 효능군 on record, so the two cannot share one. Whether DUR raises an alert is not judged.
export function groupCompare(A,B){
 const a=groupOf(A),b=groupOf(B);
 if(!a&&!b)return {text:'효능군이 겹치지 않음',detail:'두 약 모두 효능군중복 목록에 없음',a,b};
 if(!a||!b){const out=a?B:A;return {text:'효능군이 겹치지 않음',detail:`${out.name}${eunNeun(out.name)} 효능군중복 목록에 없음`,a,b};}
 if(a.group!==b.group)return {text:'효능군이 겹치지 않음',detail:`${a.group} / ${b.group}`,a,b};
 const sameFamily=!!a.family&&a.family===b.family;
 return {text:sameFamily?'같은 효능군 · 같은 계열':'같은 효능군',detail:sameFamily?`${a.group} · ${a.family}`:`${a.group} · 계열은 다름`,a,b,same:true,sameFamily};
}
const STATUS={listed:'병용금기 목록에 있음',combination_only:'복합제 기록만 있음',not_listed:'병용금기 목록에 없음'};
export function durModel(c){
 const drugs=(c?.drugs||[]).map((d,i)=>({i,name:d.name,known:d.known!==false,cells:FLAG_ORDER.map(cat=>({cat,key:`f${i}|${cat}`,flag:d.flags.find(f=>f.category===cat)||null}))}));
 const pairs=(c?.pairs||[]).map(p=>({key:`p${p.a}|${p.b}`,a:p.a,b:p.b,title:`${c.drugs[p.a].name} + ${c.drugs[p.b].name}`,status:p.status,statusText:STATUS[p.status]||'판정할 수 없음',dur:p.dur,group:groupCompare(c.drugs[p.a],c.drugs[p.b])}));
 return {drugs,pairs};
}

export const DUR_GUIDE=['이 표는 답변과 따로, 질문한 약 이름으로 DUR 성분정보를 바로 찾아 보여 줍니다. AI가 쓴 내용이 아니라 공공데이터 기록 그대로입니다.','칸에는 기록에 적힌 값(임부 금기 등급, 연령 기준, 최대 투여량, 최대 투여기간, 효능군)을 적었습니다. "기록 없음"은 그 목록에 기록이 없다는 뜻이며, 안전하다는 뜻은 아닙니다.','노인주의 칸의 "목록에 있음"은 노인주의 목록에 그 약의 기록이 있다는 뜻입니다. 나이와 임신 여부는 질문에서 읽지 않으므로 환자 상태는 직접 확인하세요.','아래 "두 약물을 한번에 검토하기"에서 병용금기 칸은 두 약을 함께 적은 병용금기 기록이 있는지 보여 줍니다. 효능군 중복 칸은 두 약의 효능군중복 기록에 적힌 효능군·계열 이름이 같은지 비교합니다. 한 약이라도 효능군중복 목록에 없으면 두 약의 효능군은 겹치지 않습니다. 실제로 효능군중복 알림이 뜨는지는 판단하지 않습니다.','칸을 누르면 오른쪽에 기록 내용과 원문이 나옵니다. 숫자는 기록의 개수이며 위험도가 아닙니다.'];

export const durViewHTML=c=>fullTerms(durTableHTML(c));
function durTableHTML(c){
 if(!c)return '<div class="empty">DUR 점검표는 실제 DB를 쓰는 답변에서만 조회합니다.<br>예시 체험에서는 표시하지 않습니다.</div>';
 if(c.pending)return '<div class="empty">DUR 기록을 확인하는 중입니다…</div>';
 if(c.error)return `<div class="empty">DUR 기록을 조회하지 못했습니다.<br>${esc(c.error)}</div>`;
 const M=durModel(c);
 if(!M.drugs.length)return '<div class="empty">질문에서 DUR 성분명을 찾지 못했습니다.<br>약 이름을 정확하게 입력해 다시 질문해 주세요.</div>';
 const cell=(d,x)=>`<td><button type="button" class="dv-cell${x.flag?' has':''}" data-dur="${esc(x.key)}" aria-label="${esc(`${d.name} ${durName(x.cat)}: ${x.flag?flagValue(x.flag):'기록 없음'}`)}">${x.flag?`<b>${esc(flagValue(x.flag))}</b><small>기록 ${x.flag.count}건</small>`:'<span>기록 없음</span>'}</button></td>`;
 const rows=M.drugs.map(d=>`<tr><th scope="row">${esc(d.name)}</th>${d.known?d.cells.map(x=>cell(d,x)).join(''):`<td colspan="${FLAG_ORDER.length}" class="dv-unknown">DUR 성분정보에서 이 약을 찾지 못했습니다.</td>`}</tr>`).join('');
 // Each cell is marked by its own finding: the 병용금기 cell when there is a record, the 효능군 중복 cell when the class is shared.
 const pairBtn=(p,has,html)=>`<button type="button" class="dv-cell${has?' has':''}" data-dur="${esc(p.key)}">${html}</button>`;
 const pairs=M.pairs.length?`<h4 class="dv-sub">두 약물을 한번에 검토하기</h4><table class="dv-table dv-pairs"><thead><tr><th scope="col">두 약물</th><th scope="col">병용금기</th><th scope="col">효능군 중복</th></tr></thead><tbody>${M.pairs.map(p=>`<tr><th scope="row">${esc(p.title)}</th><td>${pairBtn(p,p.status==='listed'||p.status==='combination_only',`<b>${esc(p.statusText)}</b>${p.dur.records.length?`<small>기록 ${p.dur.records.length}건${p.dur.reasons[0]?` · ${esc(p.dur.reasons[0])}`:''}</small>`:''}`)}</td><td>${pairBtn(p,p.group.same,`<b>${esc(p.group.text)}</b><small>${esc(p.group.detail)}</small>`)}</td></tr>`).join('')}</tbody></table>`:'<p class="dv-note">질문한 약이 하나라서 두 약물을 함께 검토할 수 없습니다.</p>';
 // "DUR" once in the head line: written out twice, the line ran long.
 return `<div class="dv-head"><p><b>DUR 점검표</b> · 질문한 약 ${M.drugs.length}개 · 성분정보 목록 7가지 기준</p></div><table class="dv-table"><thead><tr><th scope="col">약</th>${FLAG_ORDER.map(c=>`<th scope="col">${esc(durName(c))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${pairs}`;
}

const FIELDS=[['grade','임부 금기 등급'],['age','연령 기준'],['max_dose','최대 투여량'],['max_days','최대 투여기간'],['group','효능군'],['family','계열명'],['detail','금기·주의 내용'],['note','비고'],['dosage_form','제형'],['form','단일제·복합제']];
const fieldsHTML=f=>`<dl class="dv-fields">${FIELDS.filter(([k])=>f[k]).map(([k,label])=>`<dt>${esc(label)}</dt><dd>${esc(String(f[k]).replace(/^"|"$/g,''))}</dd>`).join('')}</dl>`;
const cite=(c,cat)=>c.sources?.dur?sourceLine({sourceLabel:c.sources.dur.name,sourceOperation:c.sources.dur_operations?.[cat],sourcePage:c.sources.dur.page}):'';
const sayFlag=(name,f)=>{
 const head=`DUR ${durName(f.category)} 목록에 ${name} 기록이 ${f.count}건 있습니다.`;
 const said={임부금기:f.grade&&`적힌 등급은 ${f.grade}입니다.`,특정연령대금기:f.age&&`적힌 연령 기준은 ${f.age}입니다.`,용량주의:f.max_dose&&`적힌 최대 투여량은 ${f.max_dose}입니다.`,투여기간주의:f.max_days&&`적힌 최대 투여기간은 ${f.max_days}입니다.`,효능군중복:f.group&&`적힌 효능군은 ${f.group}${f.family?`, 계열명은 ${f.family}`:''}입니다.`}[f.category];
 return [head,said].filter(Boolean).join(' ');
};
// Right sidebar for a chosen cell (key "f<drug>|<list>") or pair row (key "p<a>|<b>").
export const durExplorerHTML=(c,key)=>fullTerms(durSideHTML(c,key));
function durSideHTML(c,key){
 const M=durModel(c);
 if(key.startsWith('f')){
  const [i,cat]=key.slice(1).split('|'),d=c.drugs[+i],x=M.drugs[+i]?.cells.find(y=>y.cat===cat);if(!d||!x)return '';
  const top=`<span class="badge">DUR 기록</span><h3>${esc(d.name)} · ${esc(durName(cat))}</h3><h4>한눈에 보기</h4>`;
  if(!x.flag)return `${top}<p class="explorer-takeaway">DUR ${esc(durName(cat))} 목록에서 ${esc(d.name)} 기록을 찾지 못했습니다.</p><p class="hint">${NOT_SAFE}</p>${cite(c,cat)}`;
  const f=x.flag;
  return `${top}<p class="explorer-takeaway">${esc(sayFlag(d.name,f))}</p><h4>DUR 기록 내용</h4>${fieldsHTML(f)}<p class="hint">${f.count>1?`이 목록에는 이 약의 기록이 ${f.count}건(단일제 ${f.single}건) 있습니다. 위 내용은 그중 단일제 기록을 먼저 골라 보여 준 첫 기록입니다.`:'이 목록에 있는 이 약의 기록입니다.'}</p><button type="button" data-open-document="${esc(f.chunk_id)}">원문 전체 보기 ↗</button>${cite(c,cat)}<p class="hint">${PATIENT}</p>`;
 }
 const p=M.pairs.find(x=>x.key===key);if(!p)return '';
 const A=c.drugs[p.a],B=c.drugs[p.b],dur=p.dur;
 const say={listed:`DUR 병용금기 목록에 두 약을 함께 적은 기록이 ${dur.direct}건 있습니다.${dur.reasons.length?` 적힌 금기·주의 내용은 “${dur.reasons.join('”, “')}”입니다.`:''}`,combination_only:`두 약 자체를 함께 적은 병용금기 기록은 없고, 복합제 기록만 ${dur.records.length}건 있습니다.`,not_listed:'DUR 병용금기 목록에서 두 약을 함께 적은 기록을 찾지 못했습니다.'}[p.status]||'병용금기 여부를 판정할 수 없습니다.';
 const side=s=>`${s.name}(${s.form||'제형 미기재'})${s.components?.length?` · 구성 성분: ${s.components.map(x=>x.name).join(', ')}`:''}`;
 const records=dur.records.map(r=>`<article class="explorer-source"><strong>${esc(side(r.a))} + ${esc(side(r.b))}</strong>${r.reason?`<p>금기·주의 내용: ${esc(r.reason)}</p>`:''}<p class="hint">${r.direct?'두 약 자체를 함께 적은 기록':'복합제 기록'}</p><button type="button" data-open-document="${esc(r.chunk_id)}">원문 전체 보기 ↗</button></article>`).join('');
 const g=p.group,groupLine=(d,f)=>`<p><strong>${esc(d.name)}</strong> · ${f?`효능군 ${esc(f.group||'미기재')}${f.family?` · 계열 ${esc(f.family)}`:''} <button type="button" data-open-document="${esc(f.chunk_id)}">원문 ↗</button>`:'효능군중복 목록에 없음'}</p>`;
 return `<span class="badge">두 약물 검토</span><h3>${esc(p.title)}</h3><h4>한눈에 보기</h4><p class="explorer-takeaway">${esc(say)}</p>${p.status==='not_listed'?`<p class="hint">${NOT_SAFE}</p>`:''}<h4>병용금기 기록${dur.records.length?` ${dur.records.length}건`:''}</h4>${records||'<p>두 약을 함께 적은 병용금기 기록이 없습니다.</p>'}${cite(c,'병용금기')}<h4>효능군 중복 · ${esc(g.text)}</h4>${groupLine(A,g.a)}${groupLine(B,g.b)}<p class="hint">효능군과 계열 이름은 각 약의 DUR 효능군중복 기록에 적힌 그대로입니다. 두 약이 실제로 효능군중복 알림 대상인지는 이 화면에서 판단하지 않습니다.</p><p class="hint">${PATIENT}</p>`;
}

export function durView(container,data,{clinical=null,onSelectDur=()=>{}}){
 const wrap=document.createElement('div');wrap.className='hv-dur';wrap.innerHTML=durViewHTML(clinical);container.append(wrap);
 const head=wrap.querySelector('.dv-head');
 if(head){
  const info=document.createElement('button');info.type='button';info.className='info-button';info.title=fullTerms('DUR 점검표 보는 법');info.innerHTML=INFO_ICON;info.setAttribute('aria-label',fullTerms('DUR 점검표 보는 법'));info.setAttribute('aria-expanded','false');head.append(info);
  const guide=document.createElement('div');guide.className='dv-guide';guide.hidden=true;guide.append(...DUR_GUIDE.map(t=>Object.assign(document.createElement('p'),{textContent:fullTerms(t)})));head.after(guide);
  info.onclick=()=>{guide.hidden=!guide.hidden;info.setAttribute('aria-expanded',String(!guide.hidden));};
 }
 wrap.onclick=e=>{const b=e.target.closest('[data-dur]');if(b)onSelectDur(b.dataset.dur);};
 // The chosen record keeps its look; while one is chosen the other cells fade but can still be clicked.
 function filter(ids,active=null,key=null){wrap.querySelectorAll('[data-dur]').forEach(b=>{b.classList.toggle('on',b.dataset.dur===key);b.classList.toggle('off',key!=null&&b.dataset.dur!==key);});}
 return {destroy(){wrap.remove();},fitView(){wrap.scrollTop=0;},zoomBy(){},resize(){},filter};
}
