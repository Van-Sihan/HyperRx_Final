import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drugPairs,pairCardHTML,pairExplorerHTML,pairGeometry,PAIR_GUIDE,MIN_W,MIN_H,BOX_W} from '../src/pair-view.js';
import {aliasGroups,aliasesFor,displayName,keyNodeIds} from '../src/medications.js';
import {focusQuestionGraph} from '../src/relation-explorer.js';

// The same steps the screen takes for a saved demo answer.
function saved(id){
 const r=JSON.parse(readFileSync(new URL(`../public/demo-answers/${id}.json`,import.meta.url),'utf8')).response;
 const groups=aliasGroups(r.retrieval?.matched_aliases),names=[...new Set(groups.map(displayName))];
 const drugs=names.map(name=>({name,aliases:aliasesFor(name,groups),ids:keyNodeIds([name],groups,r.graph)}));
 const graph=focusQuestionGraph(r.graph,keyNodeIds(names,groups,r.graph),{citations:r.citations,groups:drugs});
 return drugPairs(graph,drugs,r.citations);
}
const byTitle=(P,t)=>P.all.find(p=>p.title===t);
const kinds=p=>Object.fromEntries(p.groups.map(g=>[g.label,g.rows.length]));

// 약 쌍 is off the toolbar for now (2026-11-10); its view module and these tests stay so it can come back.
test('The tabs: map, flow, table and the DUR checklist; 약 쌍 is not shown',()=>{
 const html=readFileSync(new URL('../public/chatbot2.html',import.meta.url),'utf8');
 for(const d of ['2d','bipartite','matrix','dur'])assert.match(html,new RegExp(`data-dimension="${d}"`));
 assert.doesNotMatch(html,/data-dimension="pairs"/);
 assert.ok(html.indexOf('data-dimension="matrix"')<html.indexOf('data-dimension="dur"'));
});
test('Three-drug answer: each pair counts its relations and records, and 병용금기 counts only when the sentence pairs those two drugs',()=>{
 const P=saved('simvastatin-amlodipine-clarithromycin');
 const sc=byTitle(P,'심바스타틴 + 클래리트로마이신'),sa=byTitle(P,'심바스타틴 + 암로디핀'),ca=byTitle(P,'클래리트로마이신 + 암로디핀');
 assert.deepEqual([sc.edges.length,sc.rows.length,sc.direct],[4,4,4]);
 // Records cited by 심바스타틴+암로디핀 relations name one of them with some other drug: never shown as the pair's own 병용금기.
 assert.deepEqual([sa.edges.length,sa.rows.length,sa.direct],[24,36,0]);assert.equal(kinds(sa)['다른 약과의 병용금기'],7);
 // 암로디핀 is only a component of a 심바스타틴 combination product in the one 병용금기 record with 클래리트로마이신.
 assert.deepEqual([ca.edges.length,ca.rows.length,ca.direct],[4,4,0]);assert.equal(kinds(ca)['복합제 성분으로 적힌 병용금기'],1);
 assert.equal(P.multi.title,'세 약이 모두 든 관계');assert.deepEqual([P.multi.edges.length,P.multi.direct],[1,1]);
 for(const p of P.all)assert.equal(p.groups.reduce((n,g)=>n+g.rows.length,0),p.rows.length,p.title);
});
test('A pair with no shared relation says so and is not called safe',()=>{
 const P=saved('telmisartan-hydrochlorothiazide-ibuprofen'),none=byTitle(P,'이부프로펜 + 히드로클로로티아지드');
 assert.equal(none.edges.length,0);
 const card=pairCardHTML(none);assert.match(card,/pv-card none/);assert.match(card,/함께 든 관계 없음/);assert.match(card,/안전하다는 뜻은 아닙니다/);
 assert.match(pairExplorerHTML(none),/안전하다는 뜻은 아닙니다/);
 const th=byTitle(P,'히드로클로로티아지드 + 텔미사르탄');assert.deepEqual([th.edges.length,th.rows.length,th.direct],[17,18,0]);
 assert.match(pairCardHTML(th),/관계 17개 · 원문 18건/);assert.match(pairCardHTML(th),/사용상의 주의사항 12 · 용법·용량 3 · 외 3건/);
});
test('The pair explanation puts the summary first, then the records by kind, then the relations, with no risk numbers',()=>{
 const P=saved('simvastatin-clarithromycin'),p=P.pairs[0],html=pairExplorerHTML(p),at=s=>html.indexOf(s);
 assert.ok(at('한눈에 보기')<at('근거 자료 4건')&&at('근거 자료 4건')<at('data-open-document=')&&at('data-open-document=')<at('<h4>두 약이 함께 든 관계 5개</h4>'));
 assert.match(html,/두 약끼리의 병용금기 4건/);assert.match(html,/답변 인용 원문/);assert.match(html,/상호작용이 있다는 뜻은 아닙니다/);
 assert.equal((html.match(/data-explore-edge=/g)||[]).length,5);
 assert.doesNotMatch(html,/\d\s*%/);
});
test('DUR sentences: opposite sides count for the pair, one drug with another drug does not, and text is escaped',()=>{
 const doc=(id,excerpt)=>({id,title:id,category:'병용금기',excerpt});
 const graph={nodes:[{id:'a',label:'가약'},{id:'b',label:'나약'}],hyperedges:[{id:'e',members:['a','b'],sourceIds:['d1','d2','d3']}],evidenceDocuments:[
  doc('d1','[병용금기] 가약(Ga)(단일제)과(와) 나약(Na)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: <b>출혈</b>'),
  doc('d2','[병용금기] 가약(Ga)(단일제)과(와) 다약(Da)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 독성'),
  doc('d3','형식이 다른 문장')]};
 const drugs=[{name:'가약',aliases:['가약'],ids:new Set(['a'])},{name:'나약',aliases:['나약'],ids:new Set(['b'])}];
 const [p]=drugPairs(graph,drugs).pairs;
 assert.deepEqual(kinds(p),{'두 약끼리의 병용금기':1,'다른 약과의 병용금기':1,'병용금기 · 짝 확인 못 함':1});
 const html=pairExplorerHTML(p);assert.doesNotMatch(html,/<b>출혈/);assert.match(html,/&lt;b&gt;출혈/);
});
test('Boxes on the triangle do not overlap, and the reading guide stays behind the info icon',()=>{
 // Four-line pair boxes (about 90px) and a five-line all-drugs box (about 105px), at the smallest panel and a large one.
 for(const [W,H] of [[MIN_W,MIN_H],[1100,800]]){
  const G=pairGeometry(3,W,H),boxes=Object.entries(G.anchors).map(([k,[x,y]])=>{const h=k==='multi'?52:45;return {x0:x-BOX_W/2,x1:x+BOX_W/2,y0:y-h,y1:y+h};});
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x1<=b.x0||b.x1<=a.x0||a.y1<=b.y0||b.y1<=a.y0,`${W}x${H}: boxes ${i} and ${j}`);}
 }
 assert.ok(PAIR_GUIDE.some(t=>/안전하다는 뜻은 아닙니다/.test(t))&&PAIR_GUIDE.some(t=>/위험도가 아닙니다/.test(t)));
 assert.doesNotMatch(pairCardHTML(saved('simvastatin-clarithromycin').pairs[0]),/보는 법|누르면/);
});
