// 약물 개수 → 검색 방식 (2026-11-10): the slider's count sets the method (1·2제 RAG, 3제 이상 HyperRAG, as in the team
// evaluation), a 새로 추가할 약 review counts its own drugs, and the method cannot be chosen any other way.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recommended,reviewMethod,clampCount,countLabel,EVALUATED} from '../src/method-pick.js';

test('One or two drugs are answered with RAG, three or more with HyperRAG; no drug found gives no method',()=>{
 assert.equal(recommended(1),'rag');assert.equal(recommended(2),'rag');
 assert.equal(recommended(3),'hyperrag');assert.equal(recommended(5),'hyperrag');
 assert.equal(recommended(0),null);assert.equal(recommended(undefined),null);
 // The rule is the evaluation's own ordering.
 for(const n of [1,2])assert.ok(EVALUATED[n].rag>EVALUATED[n].hyperrag);
 assert.ok(EVALUATED[3].hyperrag>EVALUATED[3].rag);
});
test('The slider has three stops: 1제, 2제 and 3제 이상',()=>{
 assert.deepEqual([0,1,2,3,7,'2',null].map(clampCount),[1,1,2,3,3,2,1]);
 assert.deepEqual([1,2,3,6].map(countLabel),['1제','2제','3제 이상','3제 이상']);
});
test('A review counts its own drugs: two current and one added is HyperRAG, one and one is RAG',()=>{
 assert.deepEqual(reviewMethod(['와파린','아스피린'],'클로피도그렐'),{method:'hyperrag',count:3});
 assert.deepEqual(reviewMethod(['와파린'],'아스피린'),{method:'rag',count:2});
 // The added drug already in the list is not counted twice.
 assert.deepEqual(reviewMethod(['와파린','아스피린'],'아스피린'),{method:'rag',count:2});
});
test('The question bar has only the drug-count slider, with a stop circle at each end and in the middle',()=>{
 const html=readFileSync(new URL('../public/chatbot2.html',import.meta.url),'utf8');
 const start=html.indexOf('<form id="question-form"'),form=html.slice(start,html.indexOf('</form>',start));
 assert.match(form,/<input type="range" id="drug-count" min="1" max="3" step="1"/);
 assert.equal((form.match(/<span class="count-ticks"[^>]*>((?:<i[^>]*><\/i>)+)<\/span>/)?.[1].match(/<i/g)||[]).length,3);
 // No method chips, no 추천! label, no ⓘ (2026-11-10).
 assert.doesNotMatch(form,/data-method|method-chip|추천!|method-info|method-guide|info-button/);
});
