import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runQuery,DEFAULT_MODEL,DEMO_SCALES,OPENAI_KEY_FORMAT,requireUserKey,serverKey} from './service.mjs';
import {lookupLabel,MFDS_KEY_FORMAT} from './mfds-label.mjs';
const labelCache=path.resolve(fileURLToPath(new URL('./data/mfds-label-cache/',import.meta.url)));
const root=path.resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const port=Number(process.env.PORT||8787);
// BIND_HOST=0.0.0.0 in a container (Dockerfile); on this computer the server stays on 127.0.0.1.
const bind=process.env.BIND_HOST||'127.0.0.1';
// Host names the server answers to besides 127.0.0.1 and localhost: the public name behind HTTPS, e.g.
// ALLOWED_HOSTS=hyperrx.example.org. Any other name is refused (DNS rebinding).
const extraHosts=new Set((process.env.ALLOWED_HOSTS||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean));
const hostName=h=>{try{return new URL(`http://${h}`).hostname.toLowerCase();}catch{return '';}};
export const hostAllowed=h=>['127.0.0.1','localhost'].includes(hostName(h))||extraHosts.has(hostName(h));
// A browser request must come from this page: the same host it was sent to, or one of ALLOWED_HOSTS (a proxy may
// rewrite the Host header to 127.0.0.1).
export const originAllowed=(origin,host)=>{try{const o=new URL(origin);return ['http:','https:'].includes(o.protocol)&&(o.host===String(host||'').toLowerCase()||extraHosts.has(o.hostname));}catch{return false;}};
// The reader's own keys arrive as request headers only (never in a URL), are used for that request and are not
// logged, stored or returned. A malformed key is refused before anything is sent out.
function readKey(req,name,format){const v=String(req.headers[name]||'').trim();return !v?{key:''}:format.test(v)?{key:v}:{bad:true};}
let active=0;
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
export const server=http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host;
  if(!hostAllowed(host||''))return send(res,403,{error:'허용되지 않은 주소로 접속했습니다.'});
  if(req.headers.origin && !originAllowed(req.headers.origin,host))return send(res,403,{error:'허용되지 않은 요청입니다.'});
  const url=new URL(req.url,`http://${host}`);
  if(url.pathname==='/api/status'){
   let db=null;try{if(process.env.HYPERRAG_URL){const check=await fetch(new URL('/health',process.env.HYPERRAG_URL),{signal:AbortSignal.timeout(2000)});if(check.ok)db=await check.json();}}catch{}
   // openai/mfds: whether the server itself has a key to use. keyMode 'user': every reader brings their own OpenAI key.
   return send(res,200,{service:'galyaksi-local',openai:!!serverKey(),mfds:!!process.env.MFDS_API_KEY,keyMode:requireUserKey()?'user':'server',backend:!!process.env.HYPERRAG_URL,db,model:process.env.OPENAI_MODEL||DEFAULT_MODEL});
  }
  if(url.pathname.startsWith('/api/evidence/') && req.method==='GET'){
   const id=url.pathname.slice('/api/evidence/'.length);
   if(!/^chunk-[a-f0-9]{32}$/.test(id))return send(res,400,{error:'올바른 문서 ID가 필요합니다.'});
   if(!process.env.HYPERRAG_URL)return send(res,503,{error:'DB 서버가 연결되지 않았습니다.'});
   try{const r=await fetch(new URL('/evidence/'+id,process.env.HYPERRAG_URL),{signal:AbortSignal.timeout(5000)});if(!r.ok)return send(res,r.status===404?404:502,{error:'원문을 불러오지 못했습니다.'});return send(res,200,await r.json());}catch{return send(res,502,{error:'DB 서버에 연결할 수 없습니다.'});}
  }
  // Rule lookups for the dashboard (DUR, label sentences). The DB server answers from the local corpus; no OpenAI call.
  if(url.pathname==='/api/clinical' && req.method==='POST'){
   if(!process.env.HYPERRAG_URL)return send(res,503,{error:'DB 서버가 연결되지 않았습니다.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000)return send(res,413,{error:'질문이 너무 깁니다.'});}
   let input;try{input=JSON.parse(body);}catch{return send(res,400,{error:'올바른 JSON 요청이 필요합니다.'});}
   if(typeof input.question!=='string'||!input.question.trim()||input.question.length>2000)return send(res,400,{error:'질문을 확인해 주세요.'});
   try{const r=await fetch(new URL('/clinical',process.env.HYPERRAG_URL),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:input.question.trim()}),signal:AbortSignal.timeout(15000)});if(!r.ok)return send(res,502,{error:'규칙 조회에 실패했습니다.'});return send(res,200,await r.json());}catch{return send(res,502,{error:'DB 서버에 연결할 수 없습니다.'});}
  }
  // The drugs named in a question being typed, for the RAG/HyperRAG 추천 label (src/method-pick.js). No OpenAI call.
  if(url.pathname==='/api/drugs' && req.method==='POST'){
   if(!process.env.HYPERRAG_URL)return send(res,503,{error:'DB 서버가 연결되지 않았습니다.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000)return send(res,413,{error:'질문이 너무 깁니다.'});}
   let input;try{input=JSON.parse(body);}catch{return send(res,400,{error:'올바른 JSON 요청이 필요합니다.'});}
   if(typeof input.question!=='string'||!input.question.trim()||input.question.length>2000)return send(res,400,{error:'질문을 확인해 주세요.'});
   try{const r=await fetch(new URL('/drugs',process.env.HYPERRAG_URL),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:input.question.trim()}),signal:AbortSignal.timeout(5000)});if(!r.ok)return send(res,502,{error:'약 이름을 찾지 못했습니다.'});
    const d=await r.json();const found=Array.isArray(d.drugs)?d.drugs.filter(x=>typeof x==='string').slice(0,12):[];return send(res,200,{drugs:found,count:found.length});}
   catch{return send(res,502,{error:'DB 서버에 연결할 수 없습니다.'});}
  }
  // 노드 사전: an entity's DB description sentence by sentence with the records each most likely came from (no OpenAI call).
  if(url.pathname==='/api/entity' && req.method==='POST'){
   if(!process.env.HYPERRAG_URL)return send(res,503,{error:'DB 서버가 연결되지 않았습니다.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4000)return send(res,413,{error:'요청이 너무 깁니다.'});}
   let input;try{input=JSON.parse(body);}catch{return send(res,400,{error:'올바른 JSON 요청이 필요합니다.'});}
   const names=Array.isArray(input.names)?input.names.filter(n=>typeof n==='string'&&n.trim()).map(n=>n.trim().slice(0,200)).slice(0,8):[];
   if(!names.length)return send(res,400,{error:'항목 이름이 필요합니다.'});
   try{const r=await fetch(new URL('/entity',process.env.HYPERRAG_URL),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({names}),signal:AbortSignal.timeout(15000)});if(!r.ok)return send(res,r.status===404?404:502,{error:'항목 설명을 불러오지 못했습니다.'});return send(res,200,await r.json());}catch{return send(res,502,{error:'DB 서버에 연결할 수 없습니다.'});}
  }
  // 의약품안전나라 허가정보 for a drug (mfds-label.mjs): 식약처 공공데이터포털 service, cached on disk; no OpenAI call.
  if(url.pathname==='/api/label' && req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4000)return send(res,413,{error:'요청이 너무 깁니다.'});}
   let input;try{input=JSON.parse(body);}catch{return send(res,400,{error:'올바른 JSON 요청이 필요합니다.'});}
   const names=Array.isArray(input.names)?input.names.filter(n=>typeof n==='string').slice(0,6):[];
   const itemSeq=typeof input.itemSeq==='string'&&/^\d{6,12}$/.test(input.itemSeq)?input.itemSeq:'';
   // The reader's 공공데이터포털 key, else the server's (MFDS_API_KEY). The data is public, so answers are cached for everyone.
   const mfds=readKey(req,'x-mfds-key',MFDS_KEY_FORMAT);
   if(mfds.bad)return send(res,400,{error:'공공데이터포털 인증키 형식이 올바르지 않습니다. 일반 인증키(Decoding)를 넣어 주세요.',needsKey:true});
   try{const r=await lookupLabel({names,itemSeq},{key:mfds.key||process.env.MFDS_API_KEY,cacheDir:labelCache});return r?send(res,200,r):send(res,404,{error:'허가정보를 찾을 이름이 없습니다.'});}
   catch(e){return send(res,e.status||502,{error:e.message,needsKey:!!e.needsKey});}
  }
  if(url.pathname==='/api/query' && req.method==='POST'){
   if(active>=6)return send(res,429,{error:'현재 실행이 많습니다. 잠시 후 다시 시도해 주세요.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000)return send(res,413,{error:'질문이 너무 깁니다.'});}
   let input;try{input=JSON.parse(body);}catch{return send(res,400,{error:'올바른 JSON 요청이 필요합니다.'});}
   if(typeof input.question!=='string'||!input.question.trim()||input.question.length>2000||!['llm','rag','hyperrag'].includes(input.mode)||typeof input.demo!=='boolean'||(input.demoScale!==undefined&&!DEMO_SCALES.includes(input.demoScale)))return send(res,400,{error:'질문과 답변 방식을 확인해 주세요.'});
   const openai=readKey(req,'x-openai-key',OPENAI_KEY_FORMAT);
   if(openai.bad)return send(res,400,{error:'OpenAI API 키 형식이 올바르지 않습니다. sk-로 시작하는 키를 넣어 주세요.',needsKey:'openai'});
   active++;const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{send(res,200,await runQuery({question:input.question.trim(),mode:input.mode,demo:input.demo,demoScale:input.demoScale,key:openai.key},controller.signal));}catch(e){send(res,e.status||502,{error:e.message,...(e.needsKey?{needsKey:e.needsKey}:{})});}finally{active--;}return;
  }
  if(req.method!=='GET')return send(res,405,{error:'지원하지 않는 요청입니다.'});
  // ver.chatbot2 is the start screen; earlier screens and the landing stay reachable for comparison.
  const pages={'/':'chatbot2.html','/app':'chatbot2.html','/app/':'chatbot2.html','/chatbot1':'chatbot1.html','/classic':'index.html','/classic/':'index.html','/landing':'landing.html'};
  const name=pages[url.pathname]||decodeURIComponent(url.pathname).replace(/^\//,'');
  const full=path.resolve(root,name);
  if(!full.startsWith(root+path.sep))return send(res,403,{error:'접근 불가'});
  // no-referrer: an outgoing link (PubMed, 의약품안전나라) is not told which page it came from; DENY: not framed by other sites.
  try{const content=await readFile(full);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(content);}catch{send(res,404,{error:'페이지를 찾을 수 없습니다.'});}
 }catch{send(res,500,{error:'요청 처리 중 문제가 발생했습니다.'});}
});
// Tests import the checks above without opening a port.
if(!process.env.HYPERRX_NO_LISTEN)server.listen(port,bind,()=>console.log(`HyperRx ready: http://${bind==='0.0.0.0'?'127.0.0.1':bind}:${port}`));
