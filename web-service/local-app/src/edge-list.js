// The relation list under the map: one row per hyperedge with its colour, number, members (asked drugs first and bold),
// up to two keywords and how many source texts it links to. The search box narrows the list only, never the map.
// Numbers stay the relation's own number, as in tooltips and 관계 목록.
import {esc,apaHTML,relationSentences} from './sources.js';
import {norm} from './medications.js';

const squash=s=>norm(s).replace(/[·・\-_/]/g,'');
// Keywords without repeats that differ only by spacing ("병용금기" and "병용 금기").
export function keywords(edge,limit=2){
 const raw=(edge.tags?.length?edge.tags:String(edge.label||'').split(' · ')).map(x=>String(x).trim()).filter(Boolean);
 const seen=new Set(),out=[];
 for(const k of raw){const key=squash(k);if(!key||seen.has(key))continue;seen.add(key);out.push(k);}
 return {shown:out.slice(0,limit),all:out};
}
export function sourceCount(edge){
 const p=edge.provenance||{};
 if(p.status==='demo')return '가상';
 if(!p.resolved_count)return '원문 확인 필요';
 return p.resolved_count<p.source_count?`원문 ${p.resolved_count}/${p.source_count}`:`원문 ${p.resolved_count}`;
}
export function members(edge,graph,keyIds=new Set(),limit=3){
 const label=id=>graph.nodes.find(n=>n.id===id)?.label||id;
 const ids=[...edge.members].sort((a,b)=>(keyIds.has(b)?1:0)-(keyIds.has(a)?1:0));
 return {shown:ids.slice(0,limit).map(id=>({id,label:label(id),key:keyIds.has(id)})),more:Math.max(0,ids.length-limit),all:ids.map(label)};
}
export function edgeRows(graph,{palette,keyIds=new Set(),chosen=new Set(),text=''}){
 const q=squash(text);
 const rows=graph.hyperedges.map((edge,i)=>({edge,i,m:members(edge,graph,keyIds),k:keywords(edge)}));
 const visible=rows.filter(({m,k})=>!q||[...m.all,...k.all].some(x=>squash(x).includes(q)));
 const html=visible.map(({edge,i,m,k})=>{
  const color=palette[(edge.colorIndex??i)%palette.length];
  const names=m.shown.map(x=>x.key?`<b>${esc(x.label)}</b>`:esc(x.label)).join(' · ')+(m.more?` <span class="more">외 ${m.more}</span>`:'');
  const title=`관계 ${i+1}: ${m.all.join(', ')}${k.all.length?` · ${k.all.join(', ')}`:''}`;
  return `<button type="button" class="edge-row" data-pick="${esc(edge.id)}" aria-pressed="${chosen.has(edge.id)}" title="${esc(title)}" style="--edge-color:${color}"><span class="sw" aria-hidden="true"></span><span class="no">${i+1}</span><span class="mem">${names}</span><span class="meta">${k.shown.map(x=>`<i>${esc(x)}</i>`).join('')}<span class="src">${esc(sourceCount(edge))}</span></span></button>`;
 }).join('');
 return {html:html||'<p class="edge-empty">조건에 맞는 관계가 없습니다.</p>',shown:visible.length,total:rows.length,withAsked:rows.filter(({edge})=>edge.members.some(id=>keyIds.has(id))).length,visible:visible.map(x=>x.edge)};
}
// The sources of one relation: which documents it was extracted from, the member names found in each, and a sentence naming them.
export function edgeSources(edge,graph){
 const label=id=>graph.nodes.find(n=>n.id===id)?.label||id;
 return (edge.sourceIds||[]).map(id=>{
  const doc=(graph.evidenceDocuments||[]).find(d=>d.id===id);if(!doc)return null;
  const span=edge.sourceSpans?.find(s=>s.id===id),names=span?.matched_members?.length?span.matched_members:edge.members.map(label),text=span?.excerpt??doc.excerpt??'';
  return {id,doc,names,quote:relationSentences(text,names)[0]||text.slice(0,200)};
 }).filter(Boolean);
}
// The strip under 점·선 and 행렬: the selected relation and a way into each of its sources.
export function edgeEvidence(edge,graph,{palette=[]}={}){
 const i=graph.hyperedges.findIndex(e=>e.id===edge.id),rows=edgeSources(edge,graph),color=palette[(edge.colorIndex??i)%palette.length]||'var(--line)';
 const list=rows.map(r=>`<article class="ee-row"><p class="ee-title">${r.doc.citation?`<span class="apa">${apaHTML(r.doc.citation)}</span>`:`${esc(r.doc.title)}${r.doc.sourceLabel?`<small>${esc(r.doc.sourceLabel)}</small>`:''}`}</p><p class="ee-quote">${esc(r.quote)}</p><button type="button" data-edge-source="${esc(r.id)}">원문 보기</button></article>`).join('');
 return `<div class="ee" style="--edge-color:${color}"><div class="ee-head"><b>관계 ${i+1}번 · 근거 ${rows.length}건</b><span class="ee-label" title="${esc(edge.label)}">${esc(edge.label)}</span><button type="button" class="link-button" data-edge-details>관계 상세</button></div>${list?`<div class="ee-rows">${list}</div>`:'<p class="hint">이 관계의 원문을 연결하지 못했습니다.</p>'}</div>`;
}
// 전체 선택: the rows in view join the selection; what is already selected stays.
export function addEdges(selected,list){
 return [...selected,...list.filter(e=>!selected.some(x=>x.id===e.id))];
}
