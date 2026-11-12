// A public server (REQUIRE_USER_KEY=1): each reader's own key goes to the DB server for that one request, the server's
// key is never used, and requests for other host names are refused. A stand-in DB server answers; nothing leaves
// this computer and no model is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
const USER='sk-proj-'+'U5er_k3y-'.repeat(10),SERVER='sk-'+'S'.repeat(48);
const seen=[];
const db=http.createServer(async(req,res)=>{
 let body='';for await(const c of req)body+=c;seen.push({path:req.url,key:req.headers['x-openai-key'],mode:(()=>{try{return JSON.parse(body).mode;}catch{return undefined;}})()});
 res.writeHead(200,{'Content-Type':'application/json'});
 res.end(req.url==='/health'?JSON.stringify({ready:true,documents:1}):req.url==='/drugs'?JSON.stringify({drugs:['베라파밀','아수나프레비르'],count:2}):JSON.stringify({success:true,retrieval_only:true,response:'',text_units:[],hyperedges:[],entities:[]}));
});
await new Promise(r=>db.listen(0,'127.0.0.1',r));
Object.assign(process.env,{HYPERRX_NO_LISTEN:'1',REQUIRE_USER_KEY:'1',OPENAI_API_KEY:SERVER,ALLOWED_HOSTS:'hyperrx.example.org',HYPERRAG_URL:`http://127.0.0.1:${db.address().port}`});
const {server,hostAllowed,originAllowed}=await import('../server.mjs');
const {answerFromRetrieval}=await import('../service.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const ask=(headers={},body={question:'심바스타틴과 클래리트로마이신을 함께 먹어도 되나요?',mode:'hyperrag',demo:false})=>fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test.after(()=>{server.close();db.close();});

test('Only this server\'s own names are answered; a page elsewhere cannot call it (2026-11-10)',()=>{
 assert.ok(hostAllowed('127.0.0.1:8787')&&hostAllowed('localhost')&&hostAllowed('HyperRx.example.org'));
 assert.ok(!hostAllowed('evil.example')&&!hostAllowed('hyperrx.example.org.evil.example')&&!hostAllowed(''));
 assert.ok(originAllowed('http://localhost:8787','localhost:8787'));
 assert.ok(originAllowed('https://hyperrx.example.org','127.0.0.1:8787')); // a proxy that rewrites Host
 assert.ok(!originAllowed('http://localhost:3000','localhost:8787')&&!originAllowed('https://evil.example','hyperrx.example.org')&&!originAllowed('null','localhost:8787'));
});
test('The status says readers bring their own key and that the server has none to use',async()=>{
 const s=await(await fetch(base+'/api/status')).json();
 assert.equal(s.keyMode,'user');assert.equal(s.openai,false);assert.ok(!JSON.stringify(s).includes(SERVER.slice(3,20)));
});
test('Without the reader\'s key the question is refused before the DB is asked; the server key is not used',async()=>{
 seen.length=0;const r=await ask();const body=await r.json();
 assert.equal(r.status,401);assert.equal(body.needsKey,'openai');assert.match(body.error,/설정의 API 키/);
 assert.equal(seen.filter(s=>s.path==='/hyperrag/query').length,0);
 assert.equal((await ask({'X-OpenAI-Key':'not-a-key'})).status,400);
});
test('The reader\'s key goes to the DB server for that search and never comes back in the answer',async()=>{
 seen.length=0;const r=await ask({'X-OpenAI-Key':USER});const text=await r.text();
 assert.equal(r.status,200);assert.deepEqual(seen.map(s=>[s.path,s.key]),[['/hyperrag/query',USER]]);
 assert.ok(!text.includes(USER)&&!text.includes(SERVER));assert.match(JSON.parse(text).headline,/판단할 수 없습니다/);
 const demo=await ask({},{question:'예시',mode:'hyperrag',demo:true});assert.equal(demo.status,200); // the demo needs no key
});
test('RAG searches the DB with naive and HyperRAG with hyper; the drugs of a typed question need no key (2026-11-10)',async()=>{
 seen.length=0;
 assert.equal((await ask({'X-OpenAI-Key':USER},{question:'베라파밀과 아수나프레비르를 함께 처방해도 되나요?',mode:'rag',demo:false})).status,200);
 assert.equal((await ask({'X-OpenAI-Key':USER},{question:'베라파밀과 아수나프레비르를 함께 처방해도 되나요?',mode:'hyperrag',demo:false})).status,200);
 assert.deepEqual(seen.filter(s=>s.path==='/hyperrag/query').map(s=>s.mode),['naive','hyper']);
 const r=await fetch(base+'/api/drugs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'베라파밀과 아수나프레비르를 함께 처방해도 되나요?'})});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{drugs:['베라파밀','아수나프레비르'],count:2});
 assert.equal((await fetch(base+'/api/drugs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:''})})).status,400);
});
test('Requests for another host name, from another site, or with a malformed label key are refused',async()=>{
 const other=await new Promise(done=>http.get(base+'/api/status',{headers:{Host:'evil.example'}},res=>{res.resume();done(res.statusCode);}));
 assert.equal(other,403);
 assert.equal((await ask({Origin:'https://evil.example','X-OpenAI-Key':USER})).status,403);
 const label=await fetch(base+'/api/label',{method:'POST',headers:{'Content-Type':'application/json','X-MFDS-Key':'not a key!'},body:JSON.stringify({names:['심바스타틴']})});
 assert.equal(label.status,400);
});
test('A wrong key reads as a wrong key; OpenAI\'s own error text, which repeats part of the key, is not passed on',async()=>{
 const real=globalThis.fetch;
 globalThis.fetch=async url=>new Response(JSON.stringify({error:{message:`Incorrect API key provided: ${USER.slice(0,8)}***${USER.slice(-4)}`}}),{status:String(url).includes('api.openai.com')?401:500});
 try{
  const raw={retrieval_only:true,text_units:[{id:'c1',title:'문서',content:'심바스타틴은 근병증 위험이 있습니다.'}],hyperedges:[],entities:[]};
  await assert.rejects(answerFromRetrieval('질문',raw,'rag',undefined,USER),e=>e.status===401&&e.needsKey==='openai'&&/올바르지 않습니다/.test(e.message)&&!e.message.includes(USER.slice(0,8)));
  globalThis.fetch=async()=>new Response('{}',{status:429});
  await assert.rejects(answerFromRetrieval('질문',raw,'rag',undefined,USER),e=>e.status===429&&/Billing/.test(e.message));
 }finally{globalThis.fetch=real;}
});
