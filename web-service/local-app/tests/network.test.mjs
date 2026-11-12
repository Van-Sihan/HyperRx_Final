import test from 'node:test';
import assert from 'node:assert/strict';
import {drugSummary,networkModel,networkLayout,PER_PAIR} from '../src/network.js';

// Shaped like the 3-drug review answer: many warfarin-only relations, a few aspirin-only, clopidogrel-only, and shared ones.
const nodes=['와파린','아스피린','클로피도그렐','고령자','출혈','CYP2C19','디곡신','소아'].map((label,i)=>({id:`n${i}`,label}));
const rel=(id,members,colorIndex)=>({id,label:`관계 ${id}`,members,colorIndex});
const edges=[
 ...Array.from({length:11},(_,i)=>rel(`w${i}`,['n0','n3',...(i%2?['n6']:[])],i)),  // warfarin only (11)
 ...Array.from({length:3},(_,i)=>rel(`a${i}`,['n1','n4'],20+i)),                    // aspirin only (3)
 rel('c0',['n2','n5'],30),                                                          // clopidogrel only
 ...Array.from({length:6},(_,i)=>rel(`ac${i}`,['n1','n2','n4'],40+i)),               // aspirin + clopidogrel (6)
 rel('wa0',['n0','n1','n3','n7'],50),                                               // warfarin + aspirin
 rel('wac',['n0','n1','n2'],51),                                                    // all three
 rel('wac2',['n0','n1','n2','n4','n5','n6','n7','n3'],53),                           // all three, large
 ...Array.from({length:4},(_,i)=>rel(`cw${i}`,['n0','n2',...(i?['n3']:[])],60+i)),     // clopidogrel + warfarin (4)
 rel('x0',['n6','n7'],52)];                                                         // none of the asked drugs
const data={nodes,hyperedges:edges};
const drugs=[['클로피도그렐',['n2']],['와파린',['n0']],['아스피린',['n1']]].map(([name,ids])=>({name,ids:new Set(ids)}));

test('Each asked drug counts every relation it is in; one-drug relations are capped and counted',()=>{
 const m=networkModel(data,drugs);
 assert.deepEqual(m.hubs.map(h=>[h.name,h.total,h.leaves.length,h.hidden]),[['클로피도그렐',13,1,0],['와파린',18,8,3],['아스피린',12,3,0]]);
 assert.equal(m.unlinked,1);
 const byPair={};for(const r of m.shared)byPair[r.hubs.join('-')]=(byPair[r.hubs.join('-')]||0)+1;
 assert.deepEqual(byPair,{'0-1-2':2,'0-1':4,'0-2':6,'1-2':1});
 assert.deepEqual(m.shared.slice(0,2).map(r=>r.edge.id),['wac','wac2']); // relations joining more drugs come first, smaller first
});
test('Shared relations link to every drug they contain, at most PER_PAIR per drug pair, the rest counted',()=>{
 const L=networkLayout(networkModel(data,drugs));
 const pairs=L.bridges.map(b=>b.row.hubs.join('-'));
 assert.equal(pairs.filter(p=>p==='0-2').length,PER_PAIR);
 assert.deepEqual(L.notes.map(n=>n.text),['외 1개']); // only the overflowing pair; a hub counts its own hidden relations
 for(const b of L.bridges)assert.equal(L.links.filter(l=>l.b===b).length,b.row.hubs.length);
 assert.equal(L.links.filter(l=>l.kind==='spoke').length,3);
});
test('No two circles overlap (centre, drugs, relations), for 1, 2 and 3 asked drugs',()=>{
 for(const ds of [drugs,drugs.slice(1),drugs.slice(0,1)]){
  const L=networkLayout(networkModel(data,ds)),all=[L.core,...L.hubs,...L.leaves,...L.bridges];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>a.r+b.r+2,`${a.kind} ${i} overlaps ${b.kind} ${j} with ${ds.length} drug(s)`);}
 }
});
test('A drug with no relation still gets a hub with zero relations',()=>{
 const m=networkModel(data,[...drugs,{name:'메트포르민',ids:new Set()}]);
 assert.deepEqual(m.hubs.at(-1),{name:'메트포르민',ids:new Set(),total:0,leaves:[],hidden:0});
 assert.equal(networkLayout(m).hubs.length,4);
});
test('A drug summary merges its spellings: every relation once, each spelling counted, shared relations first',()=>{
 const g={nodes:['클로피도그렐','클로피도그렐황산염','CLOPIDOGREL','아스피린','출혈'].map((label,i)=>({id:`s${i}`,label})),hyperedges:[
  {id:'e1',label:'A',members:['s1','s4']},{id:'e2',label:'B',members:['s0','s1','s3']},{id:'e3',label:'C',members:['s0','s4','s3','s1']},{id:'e4',label:'D',members:['s3','s4']}]};
 const clop={name:'클로피도그렐',ids:new Set(['s0','s1','s2'])},asp={name:'아스피린',ids:new Set(['s3'])};
 const s=drugSummary(g,clop,[asp]);
 assert.deepEqual(s.edges.map(e=>e.id),['e1','e2','e3']); // e2 and e3 hold two spellings but count once
 assert.deepEqual(s.spellings.map(x=>[x.label,x.count]),[['클로피도그렐황산염',3],['클로피도그렐',2],['CLOPIDOGREL',0]]);
 assert.deepEqual(s.rows.map(r=>[r.edge.id,r.with]),[['e2',['아스피린']],['e3',['아스피린']],['e1',[]]]);
});
