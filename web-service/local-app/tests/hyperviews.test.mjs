import test from 'node:test';
import assert from 'node:assert/strict';
import {bipartiteLayout,matrixLayout,matrixGuide} from '../src/hyperviews.js';

const nodes=['심바스타틴','클래리트로마이신','근병증','에제티미브','고령자','디곡신','소아','임부'].map((label,i)=>({id:`n${i}`,label}));
const rel=(id,members,colorIndex)=>({id,label:`관계 ${id}`,members,colorIndex});
const data={nodes,hyperedges:[
 rel('big',['n0','n4','n5','n6','n7'],0),      // simvastatin + 4 others (generic, large)
 rel('pair',['n0','n1'],1),                    // both asked drugs
 rel('myo',['n0','n1','n2'],2),                // both + 근병증
 rel('eze',['n0','n1','n3'],3),                // both + 에제티미브
 rel('cla',['n1','n4'],4),                     // clarithromycin + 고령자
 rel('none',['n5','n6'],5)]};                  // no asked drug
const drugs=[['심바스타틴',['n0']],['클래리트로마이신',['n1']]].map(([name,ids])=>({name,ids:new Set(ids)}));

test('Bipartite: only relations with an asked drug, joint ones first, members capped and spread apart',()=>{
 const L=bipartiteLayout(data,drugs,{maxMembers:3});
 // Boxes with both asked drugs first, then 심바스타틴-only before 클래리트로마이신-only (the drugs' order); myo and eze tie,
 // so the lower relation number comes first.
 assert.deepEqual(L.rels.map(r=>r.edge.id),['pair','myo','eze','big','cla']);
 assert.equal(L.unlinked,1);
 const big=L.rels.find(r=>r.edge.id==='big');
 assert.equal(big.shown.length,3);assert.equal(big.more,1);
 assert.ok(big.shown.includes('n4')); // 고령자 is in two shown relations, so it is kept before single-use members
 const gaps=list=>list.slice(1).map((m,i)=>m.y-list[i].y);
 assert.ok(gaps(L.members).every(g=>g>=22-1e-9));
 assert.ok(gaps(L.drugs).every(g=>g>=64-1e-9));
 for(const m of L.members)assert.ok(m.rels.every(r=>r.shown.includes(m.id)));
});
test('Bipartite: the relation cap is counted, never silently dropped',()=>{
 const L=bipartiteLayout(data,drugs,{maxRelations:2});
 assert.equal(L.rels.length,2);assert.equal(L.hidden,3);
});
test('Matrix: asked drugs are merged rows on top, shared entities follow, cells mark membership',()=>{
 const M=matrixLayout(data,[{name:'심바스타틴',ids:new Set(['n0'])},{name:'클래리트로마이신',ids:new Set(['n1'])}]);
 // 8 members: the 2 asked drugs, the 3 shared ones, then 근병증 (the first one-relation member in column order) fill the
 // six rows; 에제티미브 and 임부 are the 7th and 8th, so they are counted in +n.
 assert.deepEqual(M.rows.map(r=>r.label),['심바스타틴','클래리트로마이신','고령자','디곡신','소아','근병증']);
 assert.deepEqual(M.cols.map(c=>c.edge.id),['pair','myo','eze','cla','big','none']);
 const cells=id=>M.cols.find(c=>c.edge.id===id).cells,col=id=>M.cols.find(c=>c.edge.id===id);
 assert.deepEqual(cells('pair'),[0,1]);
 assert.deepEqual(cells('myo'),[0,1,5]);assert.equal(col('myo').rest,0);
 assert.deepEqual(cells('eze'),[0,1]);assert.deepEqual(col('eze').hidden.map(m=>m.label),['에제티미브']);
 assert.deepEqual(cells('big'),[0,2,3,4]);assert.deepEqual(col('big').hidden.map(m=>m.label),['임부']);
 assert.equal(M.hiddenRows,2);
});
test('Matrix: a table of six members or fewer gives every member a row, so no +n (2026-11-09)',()=>{
 // The saved 심바스타틴 + 클래리트로마이신 case: relations of 2 and 3 members used to show +1 under a two-row table.
 const small={nodes,hyperedges:[rel('pair',['n0','n1'],0),rel('myo',['n0','n1','n2'],1),rel('eze',['n0','n1','n3'],2)]};
 const M=matrixLayout(small,drugs);
 assert.deepEqual(M.rows.map(r=>r.label),['심바스타틴','클래리트로마이신','근병증','에제티미브']);
 assert.ok(M.cols.every(c=>c.rest===0));assert.equal(M.hiddenRows,0);
 // Exactly six members: still all rows. A seventh one is the first +n.
 const six={nodes,hyperedges:[rel('a',['n0','n1','n2','n3'],0),rel('b',['n0','n4','n5'],1)]};
 assert.equal(matrixLayout(six,drugs).rows.length,6);assert.ok(matrixLayout(six,drugs).cols.every(c=>c.rest===0));
 const seven={nodes,hyperedges:[...six.hyperedges,rel('c',['n1','n6'],2)]};
 const S=matrixLayout(seven,drugs);
 // Columns run a, c, b (c has fewer members), so 소아 from c takes a row before 고령자 and 디곡신 from b; 디곡신 is 7th.
 assert.deepEqual(S.cols.map(c=>c.edge.id),['a','c','b']);
 assert.equal(S.rows.length,6);assert.deepEqual(S.cols.flatMap(c=>c.hidden.map(m=>m.label)),['디곡신']);
});
test('Matrix selection fades the other columns and rows instead of hiding them (2026-11-09)',async()=>{
 const {readFileSync}=await import('node:fs'),{FADE_COL,FADE_ROW}=await import('../src/hyperviews.js');
 const src=readFileSync(new URL('../src/hyperviews.js',import.meta.url),'utf8');
 const body=src.slice(src.indexOf('export function matrixView'),src.indexOf('// ---------- cards'));
 const filter=body.slice(body.indexOf(' function filter('));
 assert.match(filter,/style\.opacity=[^;]*FADE_COL/);assert.match(filter,/style\.opacity=[^;]*FADE_ROW/);
 assert.doesNotMatch(filter.slice(0,filter.indexOf('\n }')),/display='none'|'none'/);
 assert.ok(FADE_COL>0&&FADE_COL<.5&&FADE_ROW>0&&FADE_ROW<.6);
});
test('Relations tied on asked drugs and size keep their own number order, whatever their names say',()=>{
 const tied={nodes,hyperedges:[rel('b',['n0','n1'],0),{...rel('a',['n0','n1'],1),label:'가나다'},{...rel('c',['n0','n1'],2),label:'하파타'}]};
 tied.hyperedges[0].label='병용 금기';
 assert.deepEqual(matrixLayout(tied,drugs).cols.map(c=>c.index+1),[1,2,3]);
 assert.deepEqual(bipartiteLayout(tied,drugs).rels.map(r=>r.index+1),[1,2,3]);
});
test('Matrix +n: names exactly the members with no row, and another spelling of an asked drug is not one of them',()=>{
 const M=matrixLayout(data,drugs);
 const col=id=>M.cols.find(c=>c.edge.id===id);
 assert.deepEqual(col('eze').hidden.map(m=>m.label),['에제티미브']);assert.equal(col('eze').rest,1);
 assert.deepEqual(col('pair').hidden,[]);assert.equal(col('pair').rest,0);
 for(const c of M.cols)assert.equal(c.cells.length+c.hidden.length,new Set(c.edge.members).size);
 // fillRows:0 keeps rows to the asked drugs and shared entities, so the small cases below still have members left over.
 const twoSpellings={nodes:[...nodes,{id:'en',label:'SIMVASTATIN'}],hyperedges:[rel('dup',['n0','en','n1','n2'],0)]};
 const merged=matrixLayout(twoSpellings,[{name:'심바스타틴',ids:new Set(['n0','en'])},{name:'클래리트로마이신',ids:new Set(['n1'])}],{fillRows:0}).cols[0];
 assert.deepEqual(merged.hidden.map(m=>m.label),['근병증']);assert.equal(merged.rest,1);
 const filled=matrixLayout(twoSpellings,[{name:'심바스타틴',ids:new Set(['n0','en'])},{name:'클래리트로마이신',ids:new Set(['n1'])}]).cols[0];
 assert.deepEqual(filled.cells,[0,1,2]);assert.equal(filled.rest,0); // both spellings sit in the 심바스타틴 row
 const sorted=matrixLayout({nodes,hyperedges:[rel('sort',['n0','n7','n3','n5'],0)]},drugs,{fillRows:0}).cols[0].hidden.map(m=>m.label);
 assert.deepEqual(sorted,[...sorted].sort((a,b)=>a.localeCompare(b)));assert.equal(sorted.length,3);
});
test('Matrix guide: explains order, numbers and +n, and names the omitted relations only when there are any',()=>{
 const all=matrixGuide(matrixLayout(data,drugs));
 assert.equal(all.length,4);assert.match(all[0],/질문한 약이 많이 든 관계, 구성원이 적은 관계 순/);assert.match(all[1],/순위가 아닙니다/);assert.match(all[2],/\+n을 누르면/);assert.match(all[3],/근거 자료/);
 const capped=matrixLayout(data,drugs,{maxColumns:4});
 assert.deepEqual(capped.hiddenNumbers,[1,6]);
 assert.equal(matrixGuide(capped)[4],'이 순서에서 맨 뒤에 오는 관계 2개(1, 6번)는 생략했습니다.');
 const many=Array.from({length:40},(_,i)=>rel(`r${i}`,['n0','n4'],i));
 assert.equal(matrixGuide(matrixLayout({nodes,hyperedges:many},drugs)).at(-1),'이 순서에서 맨 뒤에 오는 관계 10개(31, 32, 33, 34, 35, 36, 37, 38, 39, 40번)는 생략했습니다.');
 assert.equal(matrixGuide(matrixLayout({nodes,hyperedges:many},drugs,{maxColumns:5})).at(-1),'이 순서에서 맨 뒤에 오는 관계 35개는 생략했습니다.');
});
test('Bipartite middle layer: same name and same asked drugs share one box; a same name on other drugs keeps its own box',()=>{
 const named=(id,label,members)=>({id,label,members});
 const g={nodes,hyperedges:[
  named('a','병용금기',['n0','n1','n2']),
  named('b','병용금기 ',['n0','n1','n3']),   // same name (spacing aside), same two drugs: shares the box
  named('c','병용금기',['n1','n4']),         // same name, clarithromycin only: its own box
  named('d','',['n0','n1']),named('e','',['n0','n1']), // no name: never merged
  named('f','노출 증가',['n0','n5'])]};
 const L=bipartiteLayout(g,drugs);
 const box=id=>L.rels.find(r=>r.edges.some(e=>e.id===id));
 assert.deepEqual(box('a').edges.map(e=>e.id),['a','b']);assert.equal(box('b'),box('a'));
 assert.notEqual(box('c'),box('a'));assert.deepEqual(box('c').edges.map(e=>e.id),['c']);
 assert.notEqual(box('d'),box('e'));
 assert.equal(L.rels.length,5);assert.equal(L.rels.reduce((n,r)=>n+r.edges.length,0),6);
 assert.deepEqual([...box('a').shown].sort(),['n2','n3']); // the shared box joins the members of both relations
 for(const m of L.members)assert.ok(m.rels.every(r=>r.shown.includes(m.id)));
 // The cap counts relations, not boxes.
 const capped=bipartiteLayout(g,drugs,{maxRelations:1});assert.equal(capped.rels.length,1);assert.equal(capped.hidden,6-capped.rels[0].edges.length);
});
test('Bipartite middle layer on the saved answers: only exact repeats are merged',async()=>{
 const {readFileSync}=await import('node:fs');
 const {aliasGroups,aliasesFor,displayName,keyNodeIds}=await import('../src/medications.js');
 const {focusQuestionGraph}=await import('../src/relation-explorer.js');
 const layout=id=>{
  const r=JSON.parse(readFileSync(new URL(`../public/demo-answers/${id}.json`,import.meta.url),'utf8')).response;
  const groups=aliasGroups(r.retrieval?.matched_aliases),names=[...new Set(groups.map(displayName))];
  const ds=names.map(name=>({name,aliases:aliasesFor(name,groups),ids:keyNodeIds([name],groups,r.graph)}));
  const graph=focusQuestionGraph(r.graph,keyNodeIds(names,groups,r.graph),{citations:r.citations,groups:ds});
  return {L:bipartiteLayout(graph,ds,{maxRelations:graph.hyperedges.length}),ds};
 };
 const {L,ds}=layout('simvastatin-amlodipine-clarithromycin'),merged=L.rels.filter(r=>r.edges.length>1);
 assert.equal(L.rels.length,27);assert.equal(L.rels.reduce((n,r)=>n+r.edges.length,0),30);
 assert.deepEqual(merged.map(r=>[r.edge.label,r.edges.length]),[['약물 상호작용 · 노출 증가',3],['약물 상호작용 · 안전성 문제',2]]);
 // The two "병용금기" relations join different drug pairs, so each keeps its own box.
 const ban=L.rels.filter(r=>r.edge.label==='병용금기');
 assert.equal(ban.length,2);assert.deepEqual(ban.map(r=>r.hit.map(i=>ds[i].name).sort().join('+')).sort(),['심바스타틴+클래리트로마이신','암로디핀+클래리트로마이신']);
 assert.equal(layout('telmisartan-hydrochlorothiazide-ibuprofen').L.rels.length,19);
 // Folded: the boxes the answer cited, then one dashed box for the rest.
 const fold=(id,state)=>{const r=JSON.parse(readFileSync(new URL(`../public/demo-answers/${id}.json`,import.meta.url),'utf8')).response;
  const groups=aliasGroups(r.retrieval?.matched_aliases),names=[...new Set(groups.map(displayName))];
  const ds=names.map(name=>({name,aliases:aliasesFor(name,groups),ids:keyNodeIds([name],groups,r.graph)}));
  const graph=focusQuestionGraph(r.graph,keyNodeIds(names,groups,r.graph),{citations:r.citations,groups:ds});
  return bipartiteLayout(graph,ds,{maxRelations:graph.hyperedges.length,fold:state});};
 const s=fold('simvastatin-amlodipine-clarithromycin','closed');
 // 2026-11-09: the saved answer is now the run the screen shows, which cites 3 relations (the earlier short one cited 7).
 assert.equal(s.rels.length,4);assert.ok(s.rels.at(-1).fold);assert.deepEqual([s.folded.edges.length,s.folded.boxes],[27,24]);
 assert.equal(fold('simvastatin-amlodipine-clarithromycin','open').rels.length,28);
 const t=fold('telmisartan-hydrochlorothiazide-ibuprofen','closed');assert.equal(t.rels.length,3);assert.equal(t.folded.edges.length,18);
});
test('Bipartite order: cited part first, boxes of one drug combination together with a gap between combinations, drugs evenly spaced in their order',()=>{
 const cited=(id,members,n)=>({id,label:`관계 ${id}`,members,evidencePriority:{tier:n?5:3,cited:n}});
 const three=[...drugs,{name:'고령자',ids:new Set(['n4'])}];
 const g={nodes,hyperedges:[cited('ac',['n0','n4'],1),cited('ab',['n0','n1'],1),cited('abc',['n0','n1','n4'],1),cited('bc',['n1','n4'],1),cited('ab2',['n0','n1'],1),cited('u',['n0','n2'],0)]};
 const L=bipartiteLayout(g,three);
 assert.deepEqual(L.rels.map(r=>r.edge.id),['abc','ab','ab2','ac','bc','u']);
 const gaps=L.rels.slice(1).map((r,i)=>r.y-L.rels[i].y);
 assert.deepEqual(gaps,[56,40,56,56,56]); // 40 between boxes, 16 more where the combination or the part changes
 assert.deepEqual(L.drugs.map(d=>d.drug.name),['심바스타틴','클래리트로마이신','고령자']);
 const dy=L.drugs.slice(1).map((d,i)=>d.y-L.drugs[i].y);assert.equal(dy[0],dy[1]);assert.ok(dy[0]>=64&&dy[0]<=150);
 assert.equal((L.drugs[0].y+L.drugs.at(-1).y)/2,(L.rels[0].y+L.rels.at(-1).y)/2);
});
test('Matrix fold: cited relations are the columns until opened; rows follow the shown columns; nothing folds without a citation',async()=>{
 const cited=(id,members,n)=>({id,label:`관계 ${id}`,members,evidencePriority:{tier:n?5:3,cited:n}});
 const g={nodes,hyperedges:[cited('c1',['n0','n1','n2'],1),cited('u1',['n0','n3','n4'],0),cited('u2',['n1','n4'],0),cited('c2',['n0','n1','n2'],1)]};
 const closed=matrixLayout(g,drugs,{fold:'closed'});
 assert.deepEqual(closed.cols.map(c=>c.edge.id),['c1','c2']);assert.deepEqual(closed.folded.edges.map(e=>e.id).sort(),['u1','u2']);assert.equal(closed.folded.open,false);
 assert.deepEqual(closed.rows.map(r=>r.label),['심바스타틴','클래리트로마이신','근병증']); // 고령자 sits only in folded relations
 const open=matrixLayout(g,drugs,{fold:'open'});
 assert.deepEqual(open.cols.map(c=>c.edge.id),['c1','c2','u2','u1']);assert.ok(open.rows.some(r=>r.label==='고령자')); // the opened ones keep the usual order (fewer members first)
 assert.equal(matrixLayout({nodes,hyperedges:g.hyperedges.map(e=>({...e,evidencePriority:{tier:3,cited:0}}))},drugs,{fold:'closed'}).folded,null);
 assert.equal(matrixLayout({nodes,hyperedges:g.hyperedges.slice(0,2)},drugs,{fold:'closed'}).folded,null);
 assert.equal(matrixLayout(g,drugs).folded,null);
 // On the saved 심바스타틴 3제 answer: 3 cited columns first, 27 waiting.
 const {readFileSync}=await import('node:fs'),{aliasGroups,aliasesFor,displayName,keyNodeIds}=await import('../src/medications.js'),{focusQuestionGraph}=await import('../src/relation-explorer.js');
 const r=JSON.parse(readFileSync(new URL('../public/demo-answers/simvastatin-amlodipine-clarithromycin.json',import.meta.url),'utf8')).response;
 const groups=aliasGroups(r.retrieval?.matched_aliases),names=[...new Set(groups.map(displayName))],ds=names.map(name=>({name,aliases:aliasesFor(name,groups),ids:keyNodeIds([name],groups,r.graph)}));
 const M=matrixLayout(focusQuestionGraph(r.graph,keyNodeIds(names,groups,r.graph),{citations:r.citations,groups:ds}),ds,{fold:'closed'});
 assert.deepEqual([M.cols.length,M.folded.edges.length],[3,27]);
});
test('Bipartite fold: cited boxes stay, the rest share one dashed box that lists them below itself when open',()=>{
 const cited=(id,members,n)=>({id,label:`관계 ${id}`,members,evidencePriority:{tier:n?5:3,cited:n}});
 const g={nodes,hyperedges:[cited('c1',['n0','n1','n2'],1),cited('u1',['n0','n3'],0),cited('u2',['n1','n4'],0),cited('c2',['n0','n1'],2)]};
 const closed=bipartiteLayout(g,drugs,{fold:'closed'});
 assert.deepEqual(closed.rels.map(r=>r.fold?'fold':r.edge.id),['c2','c1','fold']);
 assert.deepEqual(closed.folded.edges.map(e=>e.id).sort(),['u1','u2']);assert.deepEqual(closed.folded.hit,[0,1]);
 assert.deepEqual(closed.members.map(m=>m.id),['n2']); // members of folded relations wait until the box opens
 const open=bipartiteLayout(g,drugs,{fold:'open'});
 assert.deepEqual(open.rels.map(r=>r.fold?'fold':r.edge.id),['c2','c1','fold','u1','u2']);
 assert.deepEqual(open.members.map(m=>m.id).sort(),['n2','n3','n4']);
 // Nothing folds when the answer cited nothing, or when only one box would fold.
 const none={nodes,hyperedges:g.hyperedges.map(e=>({...e,evidencePriority:{tier:3,cited:0}}))};
 assert.equal(bipartiteLayout(none,drugs,{fold:'closed'}).folded,null);
 assert.equal(bipartiteLayout({nodes,hyperedges:g.hyperedges.slice(0,2)},drugs,{fold:'closed'}).folded,null);
 assert.equal(bipartiteLayout(g,drugs).folded,null);
});
