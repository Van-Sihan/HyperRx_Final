import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeRows,keywords,sourceCount,members,addEdges,edgeSources,edgeEvidence} from '../src/edge-list.js';

const graph={nodes:[{id:'s',label:'심바스타틴'},{id:'c',label:'클래리트로마이신'},{id:'m',label:'근병증'},{id:'e',label:'에제티미브'},{id:'a',label:'암로디핀'}],
 hyperedges:[
  {id:'h1',colorIndex:0,members:['m','s','c'],label:'병용금기 · 병용 금기 · 근육병증 위험',tags:['병용금기','병용 금기','근육병증 위험'],provenance:{status:'linked',resolved_count:1,source_count:1}},
  {id:'h2',colorIndex:1,members:['e','a','m','s','c'],label:'복합제',tags:['복합제<b>'],provenance:{status:'partial',resolved_count:1,source_count:2}},
  {id:'h3',colorIndex:2,members:['a','m'],label:'부작용',tags:[],provenance:{status:'unresolved',resolved_count:0,source_count:1}}]};
const palette=['#111','#222','#333'],keyIds=new Set(['s','c']);

test('Keywords drop repeats that differ only by spacing; source counts read plainly',()=>{
 assert.deepEqual(keywords(graph.hyperedges[0]).all,['병용금기','근육병증 위험']);
 assert.equal(sourceCount(graph.hyperedges[0]),'원문 1');assert.equal(sourceCount(graph.hyperedges[1]),'원문 1/2');assert.equal(sourceCount(graph.hyperedges[2]),'원문 확인 필요');
});
test('Asked drugs come first among members and the rest is counted',()=>{
 const m=members(graph.hyperedges[1],graph,keyIds);
 assert.deepEqual(m.shown.map(x=>x.label),['심바스타틴','클래리트로마이신','에제티미브']);assert.equal(m.more,2);
});
test('Rows keep their own numbers, escape text, count asked-drug relations, and narrow by text',()=>{
 const all=edgeRows(graph,{palette,keyIds,chosen:new Set(['h2'])});
 assert.equal(all.total,3);assert.equal(all.shown,3);assert.equal(all.withAsked,2);
 assert.match(all.html,/<span class="no">2<\/span><span class="mem"><b>심바스타틴<\/b> · <b>클래리트로마이신<\/b> · 에제티미브 <span class="more">외 2<\/span>/);
 assert.match(all.html,/data-pick="h2" aria-pressed="true"/);assert.match(all.html,/복합제&lt;b&gt;/);
 const found=edgeRows(graph,{palette,keyIds,text:'근육병증'});assert.equal(found.shown,1);assert.match(found.html,/<span class="no">1<\/span>/);
 assert.match(edgeRows(graph,{palette,text:'없는말'}).html,/조건에 맞는 관계가 없습니다/);
});
test('전체 선택 adds the cards in view and keeps what is already selected; cards carry no check mark',()=>{
 const [a,b,c]=graph.hyperedges;
 assert.deepEqual(addEdges([c],[a,b]).map(e=>e.id),['h3','h1','h2']);
 assert.deepEqual(addEdges([a],[a]).map(e=>e.id),['h1']);
 const r=edgeRows(graph,{palette,keyIds,text:'근육병증'});
 assert.deepEqual(r.visible.map(e=>e.id),['h1']);assert.doesNotMatch(r.html,/class="ck"/);
});

test('A relation lists its own sources, with the sentence naming its members and the way into each source',()=>{
 const g={nodes:[{id:'s',label:'심바스타틴'},{id:'c',label:'클래리트로마이신'}],hyperedges:[{id:'x',members:['s','c'],sourceIds:[]},{id:'h',colorIndex:1,members:['s','c'],label:'병용<금기>',sourceIds:['d1','d2','gone'],sourceSpans:[{id:'d1',excerpt:'첫 문장입니다. 심바스타틴과 클래리트로마이신은 함께 쓰지 않습니다. 끝.',matched_members:['심바스타틴','클래리트로마이신']}]}],evidenceDocuments:[{id:'d1',title:'DUR 기록',sourceLabel:'DUR<성분>',excerpt:'무시'},{id:'d2',title:'논문',excerpt:'Simvastatin 논문 요약',citation:{title:'Paper',year:'2024',container:'J',url:'https://example.org'}}]};
 const rows=edgeSources(g.hyperedges[1],g);
 assert.deepEqual(rows.map(r=>r.id),['d1','d2']);
 assert.equal(rows[0].quote,'심바스타틴과 클래리트로마이신은 함께 쓰지 않습니다.');
 assert.deepEqual(rows[1].names,['심바스타틴','클래리트로마이신']);
 assert.equal(rows[1].quote,'Simvastatin 논문 요약'); // no member name in it: the excerpt itself, nothing made up
 const html=edgeEvidence(g.hyperedges[1],g,{palette:['#111','#222']});
 assert.match(html,/관계 2번 · 근거 2건/);assert.match(html,/--edge-color:#222/);assert.match(html,/data-edge-source="d1"/);assert.match(html,/data-edge-details/);
 assert.match(html,/병용&lt;금기&gt;/);assert.match(html,/DUR&lt;성분&gt;/);assert.doesNotMatch(html,/<금기>/);
 assert.match(html,/class="apa"/); // a paper reads as its APA reference, as everywhere else
 assert.match(edgeEvidence(g.hyperedges[0],g,{palette:['#111']}),/원문을 연결하지 못했습니다/);
});
