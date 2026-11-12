// How a source is named on screen. Public data: the official dataset name from 공공데이터포털 and the operation the record
// came from (evidence.py SOURCES). Papers: an APA 7 reference built from the PubMed record (tools/make_paper_refs.py).
// Accepts the browser shape (sourceLabel, citation…) and the DB server's shape (source_label, citation…).
export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A source's dataset by its full name, never shortened: 의약품안전사용서비스(DUR), 의약품 제품 허가정보, 의약품개요정보(e약은요),
// PubMed. Accepts the browser shape (sourceLabel, sourceShort) and the DB server's (source_label, source_short).
export function sourceName(d){
 const s=`${d?.sourceLabel||d?.source_label||''} ${d?.sourceShort||d?.source_short||''}`;
 return /DUR/.test(s)?'의약품안전사용서비스(DUR)':/허가/.test(s)?'의약품 제품 허가정보':/e약은요|개요정보/.test(s)?'의약품개요정보(e약은요)':/PubMed/i.test(s)?'PubMed':(d?.sourceShort||d?.source_short||d?.sourceLabel||d?.source_label||'');
}
export const INFO_ICON='<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.6v.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
// Every source the answer cited, as one marker run ("[S6.1][S8][S11.2]…") in number order, with the sentences the answer
// pointed at; shown beside the one-line verdict so its sources are visible before the details.
const refNumber=c=>Number(String(c.ref).slice(1))||0;
// The number a reader sees for each cited source: 1, 2, 3 … over the sources this answer cited, in their original order
// (S6, S8, S11 → 1, 2, 3). The original S number stays in data-ref and in the source window.
export function citationNumbers(citations=[]){return new Map([...citations].sort((a,b)=>refNumber(a)-refNumber(b)).map((c,i)=>[c.ref,i+1]));}
export function citationRun(citations=[]){
 const num=refNumber;
 return [...citations].sort((a,b)=>num(a)-num(b)).map(c=>{const ns=Object.keys(c.sentences||{});return ns.length?ns.map(n=>`[${c.ref}.${n}]`).join(''):`[${c.ref}]`;}).join('');
}
// ---- where a cited statement came from ----
// Source text is shown to the model with numbered sentences, so it can point at a sentence instead of retyping it (it rewords
// quotes it is asked to copy). The "[제품명 | 주성분: …]" header every label chunk repeats stays in the text, without a number.
export function sentenceSpans(text){
 const out=[],push=(s,e)=>{while(s<e&&/\s/.test(text[s]))s++;while(e>s&&/\s/.test(text[e-1]))e--;if(e-s>=2)out.push({start:s,end:e});};
 const split=(from,to)=>{
  const end=/(?<!\d)[.!?。](?=\s)|\n/g;end.lastIndex=from;let m,at=from; // "1. 다음 환자" is an item number, not a sentence
  while((m=end.exec(text))&&m.index<to){push(at,m[0]==='\n'?m.index:m.index+1);at=m.index+1;}
  push(at,to);
 };
 const header=/\[[^\[\]|]*\|\s*주성분:(?:[^\[\]]|\[[^\]]*\])*\]/g;
 let at=0,h;
 while((h=header.exec(text))){split(at,h.index);at=h.index+h[0].length;}
 split(at,text.length);
 return out;
}
// The sentences of a text, and the text with ⟦n⟧ before each of them.
export function numberSentences(content){
 const text=String(content??''),spans=sentenceSpans(text);let at=0,numbered='';
 spans.forEach((s,i)=>{numbered+=`${text.slice(at,s.start)}⟦${i+1}⟧ `;at=s.start;});
 return {sentences:spans.map(s=>text.slice(s.start,s.end)),text:numbered+text.slice(at)};
}
// Marks the given sentences in a source text. Spacing may differ; words may not, so nothing is ever marked by resemblance.
export function markPassage(content,keys=[]){
 const text=String(content??''),spans=[];
 for(const key of keys||[]){
  const chars=[...String(key??'').replace(/\s+/g,'')];if(!chars.length)continue;
  const m=new RegExp(chars.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*')).exec(text);
  if(m)spans.push({start:m.index,end:m.index+m[0].length});
 }
 spans.sort((a,b)=>a.start-b.start);
 let html='',at=0,found=0;
 for(const s of spans){if(s.start<at)continue;html+=`${esc(text.slice(at,s.start))}<mark class="source-mark">${esc(text.slice(s.start,s.end))}</mark>`;at=s.end;found++;}
 return {html:html+esc(text.slice(at)),found};
}
// The sentences of a source that name the most members of a relation, at most three. Names only, written out in the text
// (spacing and case may differ), so a sentence is never chosen by resemblance.
export function relationSentences(content,members=[],limit=3){
 const text=String(content??''),find=[...new Set((members||[]).map(m=>String(m??'').replace(/\s+/g,'')).filter(Boolean))].map(n=>new RegExp([...n].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),'i'));
 const scored=sentenceSpans(text).map(s=>{const t=text.slice(s.start,s.end);return {t,n:find.filter(r=>r.test(t)).length};});
 const best=Math.max(0,...scored.map(s=>s.n));
 return best?scored.filter(s=>s.n===best).slice(0,limit).map(s=>s.t):[];
}
const safe=u=>typeof u==='string'&&/^https?:\/\//.test(u)?u:'';
const link=u=>safe(u)?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`:'';

// APA 7 with italics where APA puts them: journal and volume; book title; report title.
export function apaHTML(c){
 if(!c||!c.title)return '';
 const year=esc(c.year||'n.d.'),authors=esc(c.authors||''),title=esc(c.title);
 if(c.kind==='report')return `${authors?`${authors} (${year}). `:''}<i>${title}</i> (${esc(c.report)}). ${esc(c.publisher)}. ${link(c.url)}`;
 if(c.kind==='chapter')return `${authors?`${authors} (${year}). `:''}${title} In <i>${esc(c.container)}</i>. ${esc(c.publisher)}. ${link(c.url)}`;
 const lead=authors?`${authors} (${year}). ${title}`:`${title} (${year}).`;
 const where=`<i>${esc(c.container)}</i>${c.volume?`, <i>${esc(c.volume)}</i>`:''}${c.issue?`(${esc(c.issue)})`:''}${c.pages?`, ${esc(c.pages)}`:''}`;
 return `${lead} ${where}. ${link(c.url)}`;
}
export const apaText=c=>c?.text||'';

// "출처: 식품의약품안전처_의약품안전사용서비스(DUR)성분정보 · 병용금기 정보조회 · 공공데이터포털" with the portal page linked.
export function sourceLine(d,{prefix='출처'}={}){
 const name=d?.sourceLabel??d?.source_label,operation=d?.sourceOperation??d?.source_operation,page=safe(d?.sourcePage??d?.source_page);
 if(!name)return '';
 if(d?.citation)return `<p class="source-line">${esc(prefix)}: ${esc(name)}</p>`;
 const site=page?(page.includes('data.go.kr')?'공공데이터포털':new URL(page).hostname):'';
 return `<p class="source-line">${esc(prefix)}: ${esc(name)}${operation?` · ${esc(operation)}`:''}${page?` · <a href="${esc(page)}" target="_blank" rel="noopener noreferrer">${esc(site)} ↗</a>`:''}</p>`;
}
// "원자료 정보": where the record came from, in words (file and row, dates, codes, product, company; evidence.py origin()).
// The DB's internal ids are folded underneath for checking. A label repeated on consecutive rows is written once.
export function originHTML(d,{open=false}={}){
 const o=d?.origin,ids=(o?.ids?.length?o.ids:String(d?.recordId??d?.record_id??'').split('|')).filter(Boolean),chunk=String(d?.id||'');
 const internal=ids.length||chunk?`<details class="db-ids"><summary>DB 내부 아이디</summary><p>${[...ids,chunk].filter(Boolean).map(esc).join('<br>')}</p></details>`:'';
 if(!o?.rows?.length)return internal?`<details class="source-metadata origin"${open?' open':''}><summary>원자료 정보</summary><p class="source-location">원자료 정보를 찾지 못했습니다.</p>${internal}</details>`:'';
 let prev='';
 const rows=o.rows.map(([k,v,u])=>{const label=k===prev?'':k;prev=k;return `<dt>${esc(label)}</dt><dd>${safe(u)?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`:esc(v)}</dd>`;}).join('');
 return `<details class="source-metadata origin"${open?' open':''}><summary>원자료 정보</summary><dl class="origin-rows">${rows}</dl>${internal}</details>`;
}
// The heading of a source card: the APA reference for a paper, otherwise the record title.
export function sourceHeading(d,tag='h4'){
 return d?.citation?`<p class="apa">${apaHTML(d.citation)}</p>`:`<${tag}>${esc(d?.title||'원문')}</${tag}>`;
}
