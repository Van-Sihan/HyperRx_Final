import test from 'node:test';
import assert from 'node:assert/strict';
import {focusQuestionGraph,evidencePriority,nodeConnections,explorerHTML,tagExplanation} from '../src/relation-explorer.js';
import {bipartiteLayout} from '../src/hyperviews.js';
import {CLINICAL_ANSWER_STRUCTURE} from '../service.mjs';
const nodes=['drug','outcome','other','unrelated'].map(id=>({id,label:id,type:'ACTIVE_INGREDIENT',description:`${id} DB 설명`}));
const edge=(id,members,sourceIds,matched=[])=>({id,label:id,members,sourceIds,sourceSpans:sourceIds.map(id=>({id,matched_members:matched})),provenance:{status:'linked'},description:'DB 추출 설명'});
const graph={nodes,hyperedges:[edge('uncited',['drug','other'],['s1']),edge('cited',['drug','outcome'],['s2'],['drug','outcome']),edge('unrelated',['other','unrelated'],['s3'])],evidenceDocuments:['s1','s2','s3'].map(id=>({id,title:id,excerpt:'원문 발췌'}))};
test('Drug totals include relations outside the drawing limit and do not mutate on selections',()=>{
 const drugs=[{name:'drug',ids:new Set(['drug'])},{name:'other',ids:new Set(['other'])}];
 const layout=bipartiteLayout(graph,drugs,{maxRelations:1});
 assert.equal(layout.drugs.find(d=>d.drug.name==='drug').count,2);
 assert.equal(layout.drugs.find(d=>d.drug.name==='other').count,2);
 assert.equal(graph.hyperedges.length,3);
});
test('Tag disclosure uses actual extraction context, escapes markup and admits missing explanations',()=>{
 const e={...graph.hyperedges[0],tags:['혈압','<img>','없는태그'],description:'혈압 변화에 관한 추출문입니다. 다른 설명입니다.'};
 const html=explorerHTML({...graph,hyperedges:[e]},{kind:'node',id:'drug'}); // tags stay in an entity's relation list
 assert.equal(tagExplanation(e,'혈압'),'혈압 변화에 관한 추출문입니다.');
 assert.equal(tagExplanation(e,'없는태그'),'');
 assert.match(html,/explorer-tag/);assert.match(html,/의미를 확정할 수 없습니다/);
 assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/<img>/);
});
test('Every view receives only asked-drug relations, used nodes and their actual sources',()=>{
 const focus=focusQuestionGraph(graph,new Set(['drug']),{citations:[{id:'s2'}]});
 assert.deepEqual(focus.hyperedges.map(e=>e.id),['uncited','cited']);assert.deepEqual(focus.nodes.map(n=>n.id),['drug','outcome','other']);assert.equal(focus.excluded,1);assert.deepEqual(focus.evidenceDocuments.map(d=>d.id),['s1','s2']);assert.equal(graph.hyperedges[0].evidencePriority,undefined);
 assert.equal(focusQuestionGraph(graph,new Set()).hyperedges.length,0);
 assert.equal(focusQuestionGraph(graph,new Set(),{demo:true}).hyperedges.length,3);
});
test('Dot-line puts answer-cited and source-matched edges above others regardless of DB weight',()=>{
 const focus=focusQuestionGraph(graph,new Set(['drug']),{citations:[{id:'s2'}]});focus.hyperedges[0].weight=9999;
 const layout=bipartiteLayout(focus,[{name:'drug',ids:new Set(['drug'])}]);assert.deepEqual(layout.rels.map(r=>r.edge.id),['cited','uncited']);
 assert.equal(evidencePriority({...graph.hyperedges[0],sourceIds:['missing']},graph,[{id:'missing'}]).tier,1);
});
test('A merged 점·선 box explains its relations one by one: summary, then each relation with its own sources',()=>{
 const g={...graph,hyperedges:[{...edge('x',['drug','other'],['s1']),label:'노출 증가',description:'첫째 설명'},{...edge('y',['drug','other'],['s2','s1']),label:'노출 증가',description:'<b>둘째</b> 설명'}]};
 const html=explorerHTML(g,{kind:'group',ids:['x','y']}),at=s=>html.indexOf(s);
 assert.match(html,/묶은 관계 · 2개/);assert.match(html,/관계별 설명과 근거 자료 <span class="xp-count">2건<\/span>/); // s1 belongs to both and is counted once
 assert.ok(at('한눈에 보기')<at('관계별 설명과 근거 자료')&&at('관계별 설명과 근거 자료')<at('data-explore-edge="x"')&&at('data-explore-edge="x"')<at('data-explore-edge="y"'));
 assert.equal((html.match(/data-open-document=/g)||[]).length,3);
 // Each relation keeps its own numbered list behind "근거 자료 n건 ▼", and its chips number into that list.
 assert.equal((html.match(/<details class="xp-sources">/g)||[]).length,2);assert.match(html,/<h5>근거 자료 <span class="xp-count">2건<\/span><\/h5>/);
 assert.match(html,/같은 원문이나 같은 내용이라는 뜻은 아닙니다/);assert.doesNotMatch(html,/<b>둘째/);
 assert.match(explorerHTML(g,{kind:'group',ids:['missing']}),/어떤 연결이 궁금하신가요/);
});
test('A chosen relation first names every member: asked drugs in question order, other medicines, then typed non-medicines apart',()=>{
 const N=(id,label,type)=>({id,label,...(type?{type}:{})});
 const nodes=[N('simva','심바스타틴','ACTIVE_INGREDIENT'),N('amlo','암로디핀'),N('clari','클래리트로마이신'),N('rhabdo','RHABDOMYOLYSIS','ADVERSE_EVENT'),N('cobi','코비시스타트','ACTIVE_INGREDIENT'),N('ataz','아타자나비르'),N('old','고령자','PATIENT_GROUP'),N('kid','신장애','DISEASE_OR_CONDITION')];
 const drugs=[{name:'심바스타틴',ids:new Set(['simva'])},{name:'암로디핀',ids:new Set(['amlo'])},{name:'클래리트로마이신',ids:new Set(['clari'])}];
 const g={nodes,evidenceDocuments:[],hyperedges:[{id:'e3',label:'약물 병용금기 · 횡문근융해증',members:['clari','rhabdo','simva','amlo'],sourceIds:[]},{id:'e20',label:'병용금기 · 부작용 · 병용금지',members:['cobi','amlo','simva'],sourceIds:[]},
  {id:'e30',label:'다약물 상호작용',members:['simva','ataz','amlo','cobi'],sourceIds:[]},{id:'e1',label:'주의',members:['simva','old','kid'],sourceIds:[]},{id:'e0',label:'환자군',members:['old','kid'],sourceIds:[]}]};
 const lead=id=>explorerHTML(g,{kind:'edge',id},drugs).match(/<p class="explorer-lead">(.*?)<\/p>/)[1].replace(/<[^>]+>/g,'');
 const html=explorerHTML(g,{kind:'edge',id:'e3'},drugs),at=s=>html.indexOf(s);
 assert.equal(lead('e3'),'심바스타틴 - 암로디핀 - 클래리트로마이신의 관계에 대한 설명입니다.함께 든 항목: RHABDOMYOLYSIS');
 assert.ok(at('선택한 관계')<at('의 관계에 대한 설명입니다')&&at('의 관계에 대한 설명입니다')<at('<h3>약물 병용금기 · 횡문근융해증</h3>'));
 // A medicine that was not asked about (코비시스타트) is part of the relation and is named.
 assert.equal(lead('e20'),'심바스타틴 - 암로디핀 - 코비시스타트의 관계에 대한 설명입니다.');
 assert.equal(lead('e30'),'심바스타틴 - 암로디핀 - 아타자나비르 - 코비시스타트의 관계에 대한 설명입니다.'); // an untyped member counts as a medicine
 assert.equal(lead('e1'),'심바스타틴 - 고령자 - 신장애의 관계에 대한 설명입니다.'); // one medicine: everything in one line
 assert.equal(lead('e0'),'고령자 - 신장애의 관계에 대한 설명입니다.');
 assert.doesNotMatch(explorerHTML(g,null,drugs),/개체 \d+개 · 관계/); // the empty state no longer lists counts
});
test('Combination scope requires two different asked drugs, not two aliases of one drug',()=>{
 const g={...graph,hyperedges:[edge('pair',['drug','other'],['s1']),edge('alias',['drug','alias'],['s1']),edge('single',['drug','outcome'],['s2'])]};
 const focus=focusQuestionGraph(g,new Set(['drug','alias','other']),{groups:[{ids:new Set(['drug','alias'])},{ids:new Set(['other'])}]});
 assert.deepEqual(focus.hyperedges.map(e=>e.id),['pair']);
});
test('Node explorer lists its neighbours with descriptions and only actual connected relations',()=>{
 const focus=focusQuestionGraph(graph,new Set(['drug']));assert.deepEqual(nodeConnections(focus,['drug']).nodes.map(n=>n.id),['outcome','other']);
 const html=explorerHTML(focus,{kind:'node',id:'drug'});assert.match(html,/drug DB 설명/);assert.match(html,/data-explore-node="outcome"/);assert.doesNotMatch(html,/data-explore-node="unrelated"/);assert.match(html,/직접적인 약물 상호작용이라는 뜻은 아닙니다/);
});
test('Relation explorer preserves source provenance and escapes untrusted text',()=>{
 const focus=focusQuestionGraph(graph,new Set(['drug']));focus.hyperedges[0].description='<script>alert(1)</script>';
 const html=explorerHTML(focus,{kind:'edge',id:'uncited'});assert.match(html,/data-open-document="s1"/);assert.doesNotMatch(html,/data-open-document="s3"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/DB가 원문에서 자동으로 추출한 문장입니다/);
});
test('Relation explorer reads: chosen relation, at-a-glance with source numbers, then source records behind 근거 자료 n건 ▼',()=>{
 const html=explorerHTML(focusQuestionGraph(graph,new Set(['drug'])),{kind:'edge',id:'uncited'});
 const at=s=>html.indexOf(s);
 assert.match(html,/<details class="xp-sources"><summary><h4>근거 자료 <span class="xp-count">1건<\/span><\/h4><span class="xp-caret" aria-hidden="true"><\/span><\/summary>/); // closed until pressed
 assert.ok(at('선택한 관계')<at('한눈에 보는 관계')&&at('한눈에 보는 관계')<at('data-cite-source="s1"')&&at('data-cite-source="s1"')<at('근거 자료 <span')&&at('근거 자료 <span')<at('data-quote')&&at('data-quote')<at('data-open-document="s1"'));
 assert.doesNotMatch(html,/왜 하나의 관계로|묶음의 근거와 확인 범위|답변과의 근거 연결/);
 assert.match(html,/<span class="es-no">근거 1<\/span>s1/);
 assert.equal(html.split('data-open-document="s1"').length-1,1);
 assert.match(html,/<button type="button" class="es-btn" data-quote aria-expanded="false">발췌 읽기<\/button><button type="button" class="es-btn" data-open-document="s1">전체 보기 ↗<\/button>/);
 assert.match(html,/<blockquote class="es-quote" hidden>/);
});
test('A chosen entity lists the source records of its relations, each once, shared ones first, after its description',()=>{
 const g={nodes,hyperedges:[edge('a',['drug','other'],['s1','s2']),edge('b',['drug','outcome'],['s2']),edge('c',['other','unrelated'],['s3'])],evidenceDocuments:['s1','s2','s3'].map(id=>({id,title:`원문 ${id}`,excerpt:'원문 발췌'}))};
 const html=explorerHTML(g,{kind:'node',id:'drug',ids:['drug']}),at=s=>html.indexOf(s);
 assert.match(html,/<details class="xp-sources"><summary><h4>근거 자료 <span class="xp-count">2건<\/span><\/h4>/);assert.match(html,/이 개체가 든 관계의 원문입니다/);
 assert.ok(at('개체 설명')<at('근거 자료 <span')&&at('근거 자료 <span')<at('어떻게 연결되어 있나요'));
 assert.ok(at('data-open-document="s2"')<at('data-open-document="s1"')); // s2 backs both of drug's relations
 assert.match(html,/이 개체가 든 관계 2개의 근거입니다/);assert.doesNotMatch(html,/data-open-document="s3"/);
 const many={nodes,hyperedges:[edge('m',['drug','other'],['d1','d2','d3','d4','d5','d6','d7'])],evidenceDocuments:['d1','d2','d3','d4','d5','d6','d7'].map(id=>({id,title:id,excerpt:'x'}))};
 assert.match(explorerHTML(many,{kind:'node',id:'drug',ids:['drug']}),/<summary>근거 자료 2건 더 보기<\/summary>/);
});
test('A relation explanation names its sources once per block, not after every sentence',()=>{
 const docs=['s1','s2','s3'].map((id,i)=>({id,title:`원문 ${id}`,excerpt:'원문 발췌',sourceShort:i<2?'DUR 성분정보':'의약품 제품 허가정보',category:i<2?'병용금기':'사용상의 주의사항'}));
 const one={...edge('one',['drug','other'],['s1'],['drug','other']),description:'첫 문장입니다.<SEP>둘째 문장입니다.<SEP>셋째 문장입니다.'};
 const three={...edge('three',['drug','outcome'],['s1','s2','s3']),description:'가 문장입니다.<SEP>나 문장입니다.'};
 const g={nodes,hyperedges:[one,three],evidenceDocuments:docs};
 // One source record: every sentence came from it; "근거 1" opens it with the members' sentences marked.
 const a=explorerHTML(g,{kind:'edge',id:'one'}),line='<p class="xp-src"><span class="xp-src-label">출처</span><button type="button" class="xp-cite" data-cite-source="s1" data-cite-names="drug|other" title="원문 열기">근거 1</button><span class="xp-src-text">원문 s1</span></p>';
 assert.match(a,/<summary>관계 설명 전체 읽기 \(3문장\)<\/summary>/);
 assert.equal(a.split(line).length-1,2); // under the summary, and on top of the whole explanation
 assert.match(a,/<ul class="xp-sentences"><li>첫 문장입니다.<\/li><li>둘째 문장입니다.<\/li><li>셋째 문장입니다.<\/li><\/ul>/);
 // Several: the DB keeps only the relation's sources, so the line names them all, says what kind they are, opens the list.
 const b=explorerHTML(g,{kind:'edge',id:'three'});
 assert.equal((b.match(/data-show-sources[^>]*>근거 1–3<\/button><span class="xp-src-text">의약품안전사용서비스\(DUR\) 병용금기 2건, 의약품 제품 허가정보 사용상의 주의사항 1건<\/span>/g)||[]).length,2);
 assert.doesNotMatch(b,/data-cite-source/);assert.match(b,/<span class="es-no">근거 3<\/span>원문 s3/);
 assert.match(b,/'근거 1–4'처럼 범위로 적습니다/);
 // An entity's relation list has no numbered list beside it: "원문 열기" opens the record, "근거 n건" opens the relation.
 const c=explorerHTML(g,{kind:'node',id:'drug',ids:['drug']});
 assert.match(c,/data-cite-source="s1"[^>]*>원문 열기<\/button>/);assert.match(c,/data-explore-edge="three"[^>]*>근거 3건<\/button>/);
 // No description, no chip; no source, no chip.
 assert.match(explorerHTML({...g,hyperedges:[{...one,description:''}]},{kind:'edge',id:'one'}),/상세 설명이 제공되지 않았습니다/);
 assert.doesNotMatch(explorerHTML({...g,hyperedges:[{...one,sourceIds:[]}]},{kind:'edge',id:'one'}),/xp-cite/);
});
test('Clinical answer structure asks for specific interpretation without invented patient facts or studies',()=>{
 for(const term of ['임상적 해석과 기전','근거와 한계','모니터링과 다음 단계','질문에 없는 나이·용량·기간','원문에 실제로 있을 때만','2제 자료만으로 3제'])assert.ok(CLINICAL_ANSWER_STRUCTURE.includes(term),term);
 // The section that only restated the question is gone, and no wording asks the answer to announce missing material.
 assert.ok(!CLINICAL_ANSWER_STRUCTURE.includes('질문의 검토 범위'));assert.ok(!CLINICAL_ANSWER_STRUCTURE.includes('확인되지 않음'));
});
