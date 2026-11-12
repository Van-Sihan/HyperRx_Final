import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787';
const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/무슨 약물이 궁금하신가요/);
const classic=await fetch(base+'/classic');assert.equal(classic.status,200);assert.match(await classic.text(),/id="workspace"/);
assert.match(await(await fetch(base+'/landing')).text(),/location.href='\/app'/);
assert.equal((await fetch(base+'/chatbot1.js')).status,200);
assert.equal((await fetch(base+'/chatbot2.js')).status,200);
assert.match(await(await fetch(base+'/chatbot1')).text(),/chatbot1\.js/);
assert.match(await(await fetch(base+'/')).text(),/근거 대시보드/);
const landing=await(await fetch(base+'/landing.html')).text();assert.match(landing,/location.href='\/app'/);
assert.equal((await fetch(base+'/landing.html')).status,200);
assert.equal((await fetch(base+'/app.js')).status,200);
const call=(body,headers={})=>fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
assert.equal((await call({question:'',mode:'llm',demo:true})).status,400);
assert.equal((await call({question:'예시',mode:'llm',demo:true},{Origin:'https://other.example'})).status,403);
for(const mode of ['llm','rag','hyperrag']){const r=await call({question:'약물 A의 예시 관계',mode,demo:true});assert.equal(r.status,200);assert.equal((await r.json()).demo,true);}
console.log('HTTP checks passed: pages, bundle, validation, origin restriction, 3 demo modes.');

assert.equal((await fetch(base+'/api/evidence/not-a-chunk')).status,400);
assert.equal((await fetch(base+'/api/evidence/chunk-00000000000000000000000000000000')).status,404);
const source=await fetch(base+'/api/evidence/chunk-4f67ca32ea83a554817ab6711a8681e9');assert.equal(source.status,200);
const doc=await source.json();assert.equal(doc.title,'플루다라빈 — 임부금기');assert.ok(doc.content.includes('플루다라빈'));assert.equal(doc.source_label,'DUR 안전사용 정보');assert.ok(!doc.source_url);
console.log('Source endpoint checks passed: ID validation, unknown source, exact original text, no invented external URL.');
