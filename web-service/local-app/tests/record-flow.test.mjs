import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {durPair,durReason,recordFlow,recordFlowHTML} from '../src/record-flow.js';
import {aliasGroups,aliasesFor,displayName,keyNodeIds} from '../src/medications.js';
import {focusQuestionGraph} from '../src/relation-explorer.js';

// The same steps the screen takes for an answer, on the answers saved for the demo.
function saved(id){
 const r=JSON.parse(readFileSync(new URL(`../public/demo-answers/${id}.json`,import.meta.url),'utf8')).response;
 const groups=aliasGroups(r.retrieval?.matched_aliases),names=[...new Set(groups.map(displayName))];
 const drugs=names.map(name=>({name,aliases:aliasesFor(name,groups),ids:keyNodeIds([name],groups,r.graph)}));
 const graph=focusQuestionGraph(r.graph,keyNodeIds(names,groups,r.graph),{citations:r.citations,groups:drugs});
 return {flow:recordFlow(graph,drugs),graph,drugs};
}
const section=(flow,key)=>flow.sections.find(s=>s.key===key)?.groups||[];
const drugIndex=(flow,name)=>flow.drugs.find(d=>d.name===name).i;

test('The "원문 기록 보기" switch and its view are gone (2026-11-09); the sidebar has only its two tabs, no mode switches',()=>{
 const html=readFileSync(new URL('../public/chatbot2.html',import.meta.url),'utf8');
 const side=html.slice(html.indexOf('<aside id="dashboard"'),html.indexOf('</aside>',html.indexOf('<aside id="dashboard"')));
 assert.doesNotMatch(html,/records-switch|records-panel|원문 기록 보기/);
 // 2026-11-09: the 근거 대시보드 and 이전/새 구성 switches are gone, and so are the map's 관계도·문서·관계 목록 tabs.
 assert.doesNotMatch(html,/id="dashboard-switch"|id="xai-switch"|data-tab="(graph|documents|relations)"/);
 assert.match(side,/<div id="panel-tabs" class="tabs panel-tabs" role="tablist"/);assert.match(side,/data-ptab="relation" class="active"/);
 // The views go by plain names.
 assert.match(html,/>관계 지도<\/button>/);assert.match(html,/>연결 흐름<\/button>/);assert.match(html,/>관계 표<\/button>/);
 // The 라벨 checkbox is gone (2026-11-09): names always show, the map hides only those that would overlap.
 assert.doesNotMatch(html,/id="show-labels"|> 라벨</);
 // The 구체적인 답변 choice lives in the question bar (a pressed toggle with a tooltip), not as a switch in the chat header.
 const form=html.slice(html.indexOf('<form id="question-form"'),html.indexOf('</form>'));
 assert.match(form,/<button type="button" id="long-toggle" class="think" aria-pressed="true" aria-label="더 구체적인 답변 받기" data-tip="더 구체적인 답변 받기">/);
 assert.ok(form.indexOf('id="long-toggle"')<form.indexOf('class="send"'));assert.doesNotMatch(html,/id="long-switch"/);
});
test('A DUR sentence gives its two sides, their components and the reason as written',()=>{
 const p=durPair('[병용금기] 심바스타틴(Simvastatin)(복합제; 복합 구성 성분: [D000152]Amlodipine (암로디핀)/[D000972]Olmesartan(올메사르탄))과(와) 클래리트로마이신(Clarithromycin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: - 횡문근융해증 보고');
 assert.equal(p.a.name,'심바스타틴');assert.deepEqual(p.a.names,['심바스타틴','Simvastatin']);assert.equal(p.a.combination,true);
 assert.deepEqual(p.a.parts,[['Amlodipine','암로디핀'],['Olmesartan','올메사르탄']]);
 assert.equal(p.b.name,'클래리트로마이신');assert.equal(p.b.combination,false);assert.deepEqual(p.b.parts,[]);
 assert.equal(p.reason,'횡문근융해증 보고');
});
test('Text in any other form is not read as a pair',()=>{
 assert.equal(durPair('[임부금기] 대상 성분은 암로디핀(Amlodipine )입니다.'),null);
 assert.equal(durPair('두 약은 함께 쓰지 않습니다.'),null);
 assert.equal(durReason('제품 설명'),'');
});
test('Three-drug answer: boxes follow what the records name, and no record is lost or counted twice',()=>{
 const {flow}=saved('simvastatin-amlodipine-clarithromycin');
 assert.deepEqual(section(flow,'direct').map(g=>[g.pair,g.records.length]),[['심바스타틴·암로디핀 복합제 + 클래리트로마이신',1],['심바스타틴 + 클래리트로마이신',3]]);
 assert.deepEqual(section(flow,'other').map(g=>[g.pair,g.records.length]),[['심바스타틴·암로디핀 복합제 + 다른 약 5종',6]]);
 assert.deepEqual(section(flow,'info').map(g=>[g.title,g.records.length]),[['사용상의 주의사항',27],['용법·용량',2],['임부금기',1],['효능·효과',1]]);
 assert.equal(flow.total,41);assert.equal(flow.boxes,7);
 const ids=flow.sections.flatMap(s=>s.groups).flatMap(g=>g.records.map(r=>r.doc.id));assert.equal(ids.length,41);assert.equal(new Set(ids).size,41);
});
test('A drug listed only as a component gets a dashed line, and no box pairs two drugs the records never pair',()=>{
 const {flow}=saved('simvastatin-amlodipine-clarithromycin');
 const [simva,clari,amlo]=['심바스타틴','클래리트로마이신','암로디핀'].map(n=>drugIndex(flow,n));
 const [combo,single]=section(flow,'direct');
 assert.equal(combo.links.get(simva),'solid');assert.equal(combo.links.get(clari),'solid');assert.equal(combo.links.get(amlo),'dashed');
 assert.equal(single.links.get(simva),'solid');assert.equal(single.links.get(clari),'solid');assert.equal(single.links.has(amlo),false);
 const other=section(flow,'other')[0];assert.equal(other.links.get(simva),'solid');assert.equal(other.links.get(amlo),'dashed');assert.equal(other.links.has(clari),false);
 const pairs=flow.sections.flatMap(s=>s.groups).map(g=>g.pair||'');
 for(const wrong of ['심바스타틴 + 암로디핀','암로디핀 + 심바스타틴','클래리트로마이신 + 암로디핀','암로디핀 + 클래리트로마이신'])assert.ok(!pairs.includes(wrong),wrong);
 const total=flow.sections.flatMap(s=>s.groups).reduce((n,g)=>n+g.links.size,0);assert.equal(total,16);
});
test('A component not asked about stays out of the box label',()=>{
 const {flow}=saved('simvastatin-clarithromycin');
 assert.deepEqual(section(flow,'direct').map(g=>[g.pair,g.records.length]),[['심바스타틴 + 클래리트로마이신',4]]);
 assert.equal(flow.boxes,1);
});
test('An answer with no 병용금기 record has no pair box and reads by category',()=>{
 const {flow}=saved('telmisartan-hydrochlorothiazide-ibuprofen');
 assert.equal(section(flow,'direct').length,0);assert.equal(section(flow,'other').length,0);
 assert.deepEqual(section(flow,'info').map(g=>[g.title,g.records.length]),[['사용상의 주의사항',13],['용법·용량',3],['효능·효과',2],['임부금기',1]]);
});
test('The screen shows records and reasons, not extracted keywords; the guide stays behind the info icon',()=>{
 const {flow,graph}=saved('simvastatin-amlodipine-clarithromycin'),html=recordFlowHTML(flow);
 assert.ok(graph.hyperedges.some(e=>e.label.includes('{병용 금기')));assert.doesNotMatch(html,/\{병용 금기/);assert.doesNotMatch(html,/increased exposure/);
 assert.match(html,/횡문근융해증 보고/);assert.match(html,/원문 기록 41건 · 상자 7개/);assert.match(html,/코비시스타트|다른 약 5종/);
 assert.match(html,/id="rf-guide" class="rf-guide" hidden/);assert.match(html,/위험도가 아닙니다/);assert.match(html,/안전하다는 뜻도 아닙니다/);
 assert.doesNotMatch(html,/\d\s*%/);
 assert.equal((html.match(/data-open-document=/g)||[]).length,41);
});
test('Permit documents say so instead of a reason, and a DUR 임부금기 shows its written reason',()=>{
 const {flow}=saved('simvastatin-amlodipine-clarithromycin'),html=recordFlowHTML(flow);
 assert.match(html,/제품별 문서/);
 assert.equal(section(flow,'info').find(g=>g.title==='임부금기').records[0].reason,'임부에 대한 안전성 미확립 태아 발육에 필수적인 콜레스테롤의 생합성 감소 가능성.');
});
test('A 병용금기 record without a readable pair is kept and says the pair is unconfirmed',()=>{
 const drugs=[{name:'가약',aliases:['가약'],ids:new Set(['가약'])}];
 const graph={nodes:[{id:'가약',label:'가약'}],hyperedges:[{id:'e',members:['가약'],sourceIds:['d']}],evidenceDocuments:[{id:'d',category:'병용금기',title:'문서',excerpt:'형식이 다른 문장입니다.'}]};
 const flow=recordFlow(graph,drugs),[g]=section(flow,'info');
 assert.equal(flow.total,1);assert.equal(g.title,'병용금기');assert.match(g.pair,/확인하지 못함/);assert.equal(g.links.get(0),'solid');
});
test('Untrusted text is escaped, relations without a source are disclosed, and an empty answer is not called safe',()=>{
 const drugs=[{name:'가약',aliases:['가약'],ids:new Set(['가약'])}];
 const graph={nodes:[{id:'가약',label:'가약'}],hyperedges:[{id:'e',members:['가약'],sourceIds:['d']},{id:'x',members:['가약'],sourceIds:[]}],evidenceDocuments:[{id:'d',category:'병용금기',title:'문서',excerpt:'[병용금기] 가약(Ga)(단일제)과(와) <img src=x>(B)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: <script>alert(1)</script>'}]};
 const html=recordFlowHTML(recordFlow(graph,drugs));
 assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/원문이 연결되지 않은 관계 1개/);
 assert.match(recordFlowHTML(recordFlow({nodes:[],hyperedges:[],evidenceDocuments:[]},drugs)),/안전하다는 뜻은 아닙니다/);
 assert.match(recordFlowHTML(null),/원문 기록으로 살펴보세요/);
});
