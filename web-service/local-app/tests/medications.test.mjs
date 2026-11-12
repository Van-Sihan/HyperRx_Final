import test from 'node:test';
import assert from 'node:assert/strict';
import {aliasGroups,aliasesFor,displayName,foundMedications,keyNodeIds,nodesMatching} from '../src/medications.js';

// Shape returned by the DB server for "와파린과 아스피린을 복용 중인 환자에게 클로피도그렐을 추가해도 되나요?" (kdb-v1.0.1-20261029).
const matched=[['aspirin','아스피린'],['warfarin','와파린'],['clopidogrel','클로피도그렐']];
const graph={nodes:['CLOPIDOGREL','클로피도그렐황산염','클로피도그렐','WARFARIN','와파린','와파린 장기복용 환자','아스피린','ASPIRIN','출혈'].map((label,i)=>({id:`n${i}`,label}))};
const labels=list=>list.map(n=>n.label);

test('Each alias group is one drug shown by its Korean name, never a comma-joined list',()=>{
 const groups=aliasGroups(matched);
 assert.deepEqual(groups.map(displayName),['아스피린','와파린','클로피도그렐']);
 assert.equal(displayName(['metformin']),'metformin');
 for(const name of foundMedications(groups,[]))assert.ok(!name.includes(','),name);
});
test('Drugs already listed (by any alias) are not offered again',()=>{
 const groups=aliasGroups(matched);
 assert.deepEqual(foundMedications(groups,['와파린','아스피린','클로피도그렐']),[]);
 assert.deepEqual(foundMedications(groups,['Warfarin',undefined]),['아스피린','클로피도그렐']);
});
test('Malformed alias values are ignored or kept as single-name groups',()=>{
 assert.deepEqual(aliasGroups(undefined),[]);
 assert.deepEqual(aliasGroups(['심바스타틴',[],['',' ']]),[['심바스타틴']]);
 assert.deepEqual(aliasGroups([['a','a','b']]),[['a','b']]);
});
test('A typed name expands to its alias group so English node labels are found too',()=>{
 const groups=aliasGroups(matched);
 assert.deepEqual(aliasesFor('와파린',groups),['warfarin','와파린']);
 assert.deepEqual(aliasesFor('메트포르민',groups),['메트포르민']);
 assert.deepEqual(labels(nodesMatching(aliasesFor('클로피도그렐',groups),graph)),['CLOPIDOGREL','클로피도그렐황산염','클로피도그렐']);
 assert.deepEqual(labels(nodesMatching('클로피도그렐',graph)),['클로피도그렐황산염','클로피도그렐']);
});
test('Node matching keeps the earlier single-name rule',()=>{
 assert.deepEqual(labels(nodesMatching('와파린',graph)),['와파린','와파린 장기복용 환자']);
 assert.deepEqual(nodesMatching('와',graph),[]);
 assert.deepEqual(nodesMatching('와파린',null),[]);
});
test('Asked drugs are emphasized by exact name, not by every label that contains the name',()=>{
 const g={nodes:[['심바스타틴(SIMVASTATIN)','ACTIVE_INGREDIENT'],['심바스타틴','ACTIVE_INGREDIENT'],['SIMVASTATIN','ACTIVE_INGREDIENT'],['심바스타틴 40 MG','DRUG_PRODUCT'],['심바스타틴/암로디핀','DRUG_PRODUCT'],
  ['클래리트로마이신','ACTIVE_INGREDIENT'],['횡문근융해증','ADVERSE_EVENT'],['와파린 장기복용 환자','PATIENT_GROUP']].map(([label,type],i)=>({id:`k${i}`,label,type}))};
 const groups=aliasGroups([['simvastatin','심바스타틴'],['clarithromycin','클래리트로마이신']]);
 const keyLabels=ids=>g.nodes.filter(n=>ids.has(n.id)).map(n=>n.label);
 assert.deepEqual(keyLabels(keyNodeIds(['심바스타틴','클래리트로마이신'],groups,g)),['심바스타틴(SIMVASTATIN)','심바스타틴','SIMVASTATIN','클래리트로마이신']);
 assert.deepEqual(keyLabels(keyNodeIds(['와파린'],[],g)),[]); // a patient group that merely contains the name is not the drug
 assert.equal(keyNodeIds(['심바스타틴'],groups,null).size,0);
});
test('A drug with no exact node falls back to drug-typed partial matches such as a salt form',()=>{
 const g={nodes:[['클로피도그렐황산염','ACTIVE_INGREDIENT'],['클로피도그렐 투여 환자','PATIENT_GROUP'],['아스피린','ACTIVE_INGREDIENT']].map(([label,type],i)=>({id:`s${i}`,label,type}))};
 const ids=keyNodeIds(['클로피도그렐','아스피린'],aliasGroups([['clopidogrel','클로피도그렐']]),g);
 assert.deepEqual(g.nodes.filter(n=>ids.has(n.id)).map(n=>n.label),['클로피도그렐황산염','아스피린']);
});
test('Salt and hydrate forms count as the asked drug; other words that start with the name do not',()=>{
 const g={nodes:['CLOPIDOGREL','클로피도그렐','클로피도그렐황산수소염','클로피도그렐나파디실레이트일수화물','CLOPIDOGREL BISULFATE','아토르바스타틴 칼슘','와파린 유발 피부염','와파린 장기복용 환자','와르파린','클로피도그렐 75 MG'].map((label,i)=>({id:`t${i}`,label}))};
 const groups=aliasGroups([['clopidogrel','클로피도그렐'],['warfarin','와파린']]);
 const keyLabels=names=>{const ids=keyNodeIds(names,groups,g);return g.nodes.filter(n=>ids.has(n.id)).map(n=>n.label);};
 assert.deepEqual(keyLabels(['클로피도그렐']),['CLOPIDOGREL','클로피도그렐','클로피도그렐황산수소염','클로피도그렐나파디실레이트일수화물','CLOPIDOGREL BISULFATE']);
 assert.deepEqual(keyLabels(['아토르바스타틴']),['아토르바스타틴 칼슘']);
 assert.deepEqual(keyLabels(['와파린']),[]); // "와르파린" is a spelling variant: it needs alias data, not a name rule
});
