// Saved answers behind the home screen's "시연용 답변" buttons: each button opens the answer to its own question, word for word as generated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../public/',import.meta.url);
const html=readFileSync(new URL('chatbot2.html',root),'utf8');
const buttons=[...html.matchAll(/<button type="button" data-saved="([^"]+)">([^<]+)<\/button>/g)].map(m=>({id:m[1],question:m[2]}));
const load=id=>JSON.parse(readFileSync(new URL(`demo-answers/${id}.json`,root),'utf8'));

test('The home screen offers only saved answers, folded until ▼ is pressed, and the settings button is a drawn gear',()=>{
 assert.doesNotMatch(html,/id="suggestions"/);
 assert.match(html,/id="saved-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="saved-list"/);
 assert.match(html,/id="saved-list" hidden/);
 assert.doesNotMatch(html,/⚙/);assert.match(html,/id="settings-button"[^>]*><svg/);
});
test('every button opens the saved answer to its own question',()=>{
 assert.ok(buttons.length>0);
 for(const b of buttons)assert.equal(load(b.id).question,b.question);
});
test('every saved answer has a button',()=>{
 const files=readdirSync(new URL('demo-answers/',root)).map(x=>x.replace(/\.json$/,'')).sort();
 assert.deepEqual(files,buttons.map(b=>b.id).sort());
});
// Each file holds one recorded run (2026-11-09): the screen shows it in full or, with 구체적인 답변 off, its 핵심 정리.
const versions=id=>[[id,load(id).response]];
test('saved answers are real answers with resolvable numbers and no raw sentence marks',()=>{
 for(const b of buttons)for(const [name,r] of versions(b.id)){
  const text=`${r.headline} ${r.details}`,known=new Set(r.citations.map(c=>c.ref));
  assert.equal(r.demo,false,name);
  assert.doesNotMatch(text,/⟦\d+⟧/);
  for(const m of text.matchAll(/\[(S\d+)(?:\.(\d+))?\]/g)){
   assert.ok(known.has(m[1]),`${name}: ${m[0]}`);
   if(m[2])assert.ok(r.citations.find(c=>c.ref===m[1]).sentences[m[2]],`${name}: ${m[0]}`);
  }
 }
});
test('a saved answer never tells the reader the combination is fine',()=>{
 // "피하는 것이 안전합니다" advises against the combination, so it is not a permission; "가능하나" is a conditional one.
 const permit=/(해도|되어도|드셔도)\s*(됩|괜찮|무방)|(?<!피하는 (?:것이|편이) )안전합니다|문제(가)? 없|가능합니다|가능하나|가능하지만/;
 for(const b of buttons)for(const [name,r] of versions(b.id))assert.doesNotMatch(`${r.headline} ${r.details}`,permit,name);
});
test('each saved answer is one recorded run in sections, with the runs it replaced listed (2026-11-09)',()=>{
 // Every button shows relations on the map: the 아미트리프틸린 answer (no relation of both drugs) was dropped on 2026-11-09.
 assert.ok(!buttons.some(b=>b.id==='amitriptyline-diazepam'));
 for(const b of buttons){
  const f=load(b.id);
  assert.equal(f.long,undefined,b.id);assert.match(f.source,/^user_check_\d+_.+\.json$/,b.id);
  assert.ok((f.response.details.match(/^## /gm)||[]).length>=4,b.id);
  assert.ok(Array.isArray(f.previous),b.id); // empty for a question added on 2026-11-09 (로바스타틴, in place of 아미트리프틸린)
  for(const p of f.previous){assert.match(p.source,/^user_check_\d+_.+\.json$/,b.id);assert.notEqual(p.source,f.source,b.id);}
 }
});
test('every saved answer shows relations on the map, and the answer cites at least one of them (2026-11-09)',async()=>{
 const {aliasGroups,aliasesFor,displayName,keyNodeIds}=await import('../src/medications.js');
 const {focusQuestionGraph}=await import('../src/relation-explorer.js');
 for(const b of buttons){
  const r=load(b.id).response,groups=aliasGroups(r.retrieval?.matched_aliases),names=[...new Set(groups.map(displayName))];
  const drugs=names.map(name=>({name,aliases:aliasesFor(name,groups),ids:keyNodeIds([name],groups,r.graph)}));
  const g=focusQuestionGraph(r.graph,keyNodeIds(names,groups,r.graph),{citations:r.citations,groups:drugs});
  assert.ok(g.hyperedges.length>=2,`${b.id}: ${g.hyperedges.length} relations`);
  assert.ok(g.hyperedges.some(e=>e.evidencePriority?.cited>0),`${b.id}: no cited relation`);
 }
});
