// 의약품안전나라 허가정보 (2026-11-10): a drug's approved label, the same record 의약품안전나라 (nedrug.mfds.go.kr) shows,
// read from the 식품의약품안전처 '의약품 제품 허가정보' service on 공공데이터포털 (DrugPrdtPrmsnInfoService08). The site
// itself forbids automated reading (robots.txt: Disallow: /), so its pages are only linked, never fetched.
// The key is the reader's own (X-MFDS-Key, server.mjs) or MFDS_API_KEY, and is never logged or returned. Answers are
// cached on disk without the key.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const API='https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnDtlInq08';
export const NEDRUG_ITEM='https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=';
export const NEDRUG_SEARCH='https://nedrug.mfds.go.kr/searchDrug?searchYn=true&itemName=';
// A 공공데이터포털 key as the portal shows it: the Decoding key (letters, digits, + / =) or the Encoding key (%2B …).
export const MFDS_KEY_FORMAT=/^[A-Za-z0-9%+/=]{20,400}$/;
export const SOURCE={name:'의약품안전나라',provider:'식품의약품안전처',service:'공공데이터포털 의약품 제품 허가정보',site:'https://nedrug.mfds.go.kr'};
const CACHE_DAYS=14,PAGE=100,MAX_PAGES=3;
const squash=s=>String(s||'').replace(/\s+/g,'').toLowerCase();

const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
export function decode(s){
 return String(s||'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):ENT[e.toLowerCase()]??m);
}
const text=s=>decode(String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t ]+/g,' ').replace(/ *\n */g,'\n').trim();
// A table from the label as plain HTML: only table tags, line breaks and super/subscripts, and only rowspan/colspan kept.
const KEEP=new Set(['table','thead','tbody','tr','td','th','br','sup','sub','p']);
export function sanitizeTable(html){
 const out=String(html||'').replace(/<\/?([a-zA-Z0-9]+)([^>]*)>|<!--[\s\S]*?-->/g,(m,tag,attrs='')=>{
  if(!tag)return '';const t=tag.toLowerCase();if(!KEEP.has(t))return '';
  if(m.startsWith('</'))return `</${t}>`;
  const span=[...String(attrs).matchAll(/\b(rowspan|colspan)\s*=\s*["']?(\d{1,2})["']?/gi)].map(a=>` ${a[1].toLowerCase()}="${a[2]}"`).join('');
  return t==='br'?'<br>':`<${t}${span}>`;
 }).replace(/<p>\s*(&nbsp;)?\s*<\/p>/g,'').replace(/\s{2,}/g,' ').trim();
 // Some label tables start at <tbody> (no <table>): a browser drops rows that stand outside a table, so wrap them.
 return /^<table[\s>]/.test(out)||!/<tr[\s>]/.test(out)?out:`<table>${out}</table>`;
}
// EE/UD/NB_DOC_DATA: <DOC><SECTION title><ARTICLE title><PARAGRAPH tagName="p|table"><![CDATA[…]]></PARAGRAPH>…
export function parseDoc(xml){
 const sections=[];
 for(const s of String(xml||'').matchAll(/<SECTION\b[^>]*?title="([^"]*)"[^>]*>([\s\S]*?)<\/SECTION>/g)){
  const articles=[];
  for(const a of s[2].matchAll(/<ARTICLE\b[^>]*?title="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/ARTICLE>)/g)){
   const blocks=[];
   for(const p of String(a[2]||'').matchAll(/<PARAGRAPH\b[^>]*?tagName="([^"]*)"[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/PARAGRAPH>/g)){
    const raw=p[2]??p[3]??'';
    if(p[1]==='table'||/<table/i.test(raw)){const html=sanitizeTable(raw);if(html)blocks.push({kind:'table',html});}
    else{const t=text(raw);if(t)blocks.push({kind:'p',text:t});}
   }
   articles.push({title:text(a[1]),blocks});
  }
  sections.push({title:text(s[1]),articles});
 }
 return sections.filter(s=>s.title||s.articles.length);
}
// MATERIAL_NAME: "총량 : 1캡슐(556 밀리그램) 중|성분명 : 이트라코나졸|분량 : 100|단위 : 밀리그램|…;…"
export function parseMaterial(s){
 return String(s||'').split(';').map(part=>Object.fromEntries(part.split('|').map(x=>x.split(/\s*:\s*/)).filter(x=>x.length>=2).map(([k,...v])=>[k.trim(),v.join(':').trim()])))
  .filter(m=>m['성분명']).map(m=>({total:m['총량']||'',name:m['성분명'],amount:m['분량']||'',unit:m['단위']||''}));
}
export const ingredients=s=>String(s||'').split('|').map(x=>x.replace(/\[[^\]]*\]/g,'').trim()).filter(Boolean);
const date=s=>/^\d{8}$/.test(String(s||''))?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`:String(s||'');
// The products of an ingredient whose only main ingredient is that one (a formulation of it, "이트라코나졸고체분산체", too),
// in three groups: in use (정상) and not only for export, then those only for export, then withdrawn or expired ones
// (취하, 유효기간만료, …). Each group: the ingredient exactly first, the label changed most recently, the fuller label.
// A main ingredient listed once per strength ("로바스타틴|로바스타틴|로바스타틴") is one ingredient, not a combination.
export function groupProducts(items,ingredient){
 const want=squash(ingredient);
 const rows=items.map(it=>{const ing=[...new Set(ingredients(it.MAIN_ITEM_INGR).map(squash))];return {it,exact:ing.length===1&&ing[0]===want,same:ing.length===1&&ing[0].startsWith(want),
  live:(it.CANCEL_NAME||'정상')==='정상',home:!/수출용/.test(it.ITEM_NAME||''),changed:String(it.CHANGE_DATE||it.ITEM_PERMIT_DATE||''),size:String(it.NB_DOC_DATA||'').length};}).filter(r=>r.same);
 const order=(a,b)=>b.exact-a.exact||b.changed.localeCompare(a.changed)||b.size-a.size,pick=f=>rows.filter(f).sort(order).map(r=>r.it);
 return {inUse:pick(r=>r.live&&r.home),exportOnly:pick(r=>r.live&&!r.home),ended:pick(r=>!r.live)};
}
// The product shown first: the first in use; when every one is only for export, the first of those.
export function rankProducts(items,ingredient){const g=groupProducts(items,ingredient);return g.inUse.length?g.inUse:g.exportOnly;}
const status=it=>({status:it.CANCEL_NAME||'정상',endDate:date(it.CANCEL_DATE),exportOnly:/수출용/.test(it.ITEM_NAME||'')});
export function product(it){
 return {itemSeq:String(it.ITEM_SEQ),name:it.ITEM_NAME||'',company:it.ENTP_NAME||'',kind:it.ETC_OTC_CODE||'',permitDate:date(it.ITEM_PERMIT_DATE),changeDate:date(it.CHANGE_DATE),...status(it),
  chart:String(it.CHART||'').trim(),material:parseMaterial(it.MATERIAL_NAME),ingredients:ingredients(it.MAIN_ITEM_INGR),ingredientEng:it.MAIN_INGR_ENG||'',
  atc:it.ATC_CODE||'',storage:it.STORAGE_METHOD||'',validTerm:it.VALID_TERM||'',pack:it.PACK_UNIT||'',url:NEDRUG_ITEM+encodeURIComponent(String(it.ITEM_SEQ)),
  docs:{ee:parseDoc(it.EE_DOC_DATA),ud:parseDoc(it.UD_DOC_DATA),nb:parseDoc(it.NB_DOC_DATA)}};
}
// group: 'inUse', 'export' or 'ended', the reader's product list is drawn in these groups.
const brief=(it,group)=>({itemSeq:String(it.ITEM_SEQ),name:it.ITEM_NAME||'',company:it.ENTP_NAME||'',changeDate:date(it.CHANGE_DATE),...status(it),group,url:NEDRUG_ITEM+encodeURIComponent(String(it.ITEM_SEQ))});
const MAX_LISTED=150;

// The portal refuses a key it does not know, or one not approved for this service, with an error header
// (OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode, checked 2026-11-10: 403 and code 30 for an unknown key), not
// with an empty list. Read as an empty list, such an answer was cached as "no product" and shown to every reader for
// CACHE_DAYS (2026-11-10). It is now an error, and errors are never cached. Codes are the portal's common result codes;
// 03 (no data) is a real empty answer.
const KEY_CODES=new Set(['20','21','30','31','32']),EMPTY_OK=new Set(['','0','00','03']);
function refused(code,httpStatus){
 if(KEY_CODES.has(code)||(!code&&(httpStatus===401||httpStatus===403)))
  return Object.assign(new Error('공공데이터포털 인증키가 올바르지 않거나, 이 키로 「의약품 제품 허가정보」 활용신청이 승인되지 않았습니다. 발급 직후라면 동작하기까지 시간이 걸릴 수 있습니다. 설정의 API 키 칸에서 키를 확인해 주세요.'),{status:401,needsKey:true});
 if(code==='22'||httpStatus===429)return Object.assign(new Error('공공데이터포털에서 이 인증키의 하루 호출 한도를 넘었습니다. 내일 다시 시도해 주세요.'),{status:429});
 return Object.assign(new Error(`식약처 허가정보 서비스가 오류를 알려 왔습니다${code?`(코드 ${code})`:''}. 잠시 뒤 다시 시도해 주세요.`),{status:502});
}
async function call(params,key,fetchImpl){
 const q=new URLSearchParams({serviceKey:/%[0-9A-F]{2}/i.test(key)?decodeURIComponent(key):key,type:'json',numOfRows:String(PAGE),...params});
 let r,body;try{r=await fetchImpl(`${API}?${q}`,{signal:AbortSignal.timeout(30000)});body=await r.text();}catch{throw Object.assign(new Error('식약처 허가정보 서비스에 연결하지 못했습니다.'),{status:502});}
 let d=null;try{d=JSON.parse(body);}catch{}
 const head=d?.OpenAPI_ServiceResponse?.cmmMsgHeader,httpStatus=Number(r?.status)||200;
 const code=String(head?.returnReasonCode??d?.header?.resultCode??(d?'':/<(?:returnReasonCode|resultCode)>\s*(\d+)\s*</.exec(body)?.[1])??'').trim();
 if(head||httpStatus>=400||!EMPTY_OK.has(code))throw refused(code,httpStatus);
 if(!d)throw Object.assign(new Error('식약처 허가정보 서비스가 올바른 응답을 주지 않았습니다. 인증키와 서비스 상태를 확인해 주세요.'),{status:502});
 const b=d?.body||{};return {total:Number(b.totalCount||0),items:Array.isArray(b.items)?b.items:b.items?.item?[].concat(b.items.item):[]};
}
async function cached(cacheDir,key,make){
 const file=path.join(cacheDir,createHash('sha1').update(key).digest('hex')+'.json');
 try{const c=JSON.parse(await readFile(file,'utf8'));if(Date.now()-Date.parse(c.fetchedAt)<CACHE_DAYS*864e5)return c;}catch{}
 const value=await make();if(!value)return value;
 const c={...value,fetchedAt:new Date().toISOString()};
 try{await mkdir(cacheDir,{recursive:true});await writeFile(file,JSON.stringify(c));}catch{}
 return c;
}
// names: the drug's names, Korean first (product names in 의약품안전나라 carry the Korean ingredient: "스포라녹스캡슐(이트라코나졸)").
// itemSeq: a product the reader chose in the list. The answer: the product shown (product), every product of the
// ingredient in its group (products), the one shown when nothing is chosen (defaultSeq) and how many are in use (count).
export async function lookupLabel({names=[],itemSeq=''}={},{key=process.env.MFDS_API_KEY,cacheDir,fetchImpl=fetch}={}){
 const ko=[...new Set(names.map(n=>String(n||'').trim()).filter(n=>/[가-힣]/.test(n)&&n.length<=60))].slice(0,3);
 if(!ko.length&&!itemSeq)return null;
 const need=()=>{if(!key)throw Object.assign(new Error('의약품안전나라 허가정보를 불러올 공공데이터포털 인증키가 없습니다. 설정의 API 키 칸에 넣어 주세요.'),{status:503,needsKey:true});};
 const list=ko.length?await cached(cacheDir,'list2:'+ko.join('|'),async()=>{
  need();
  for(const name of ko){
   const items=[];let total=0;
   for(let page=1;page<=MAX_PAGES;page++){const r=await call({item_name:name,pageNo:String(page)},key,fetchImpl);total=r.total;items.push(...r.items);if(items.length>=total||!r.items.length)break;}
   const g=groupProducts(items,name),first=g.inUse[0]||g.exportOnly[0]||g.ended[0];
   if(first)return {query:name,total,count:g.inUse.length,first:product(first),
    products:[...g.inUse.map(x=>brief(x,'inUse')),...g.exportOnly.map(x=>brief(x,'export')),...g.ended.map(x=>brief(x,'ended'))].slice(0,MAX_LISTED)};
  }
  return {query:ko[0],total:0,count:0,first:null,products:[]};
 }):null;
 const base={source:SOURCE,query:list?.query||'',count:list?.count??0,products:list?.products||[],defaultSeq:list?.first?.itemSeq||'',search:NEDRUG_SEARCH+encodeURIComponent(list?.query||ko[0]||'')};
 if(itemSeq&&/^\d{6,12}$/.test(String(itemSeq))&&itemSeq!==list?.first?.itemSeq){
  const one=await cached(cacheDir,'item:'+itemSeq,async()=>{need();const r=await call({item_seq:String(itemSeq)},key,fetchImpl);return r.items[0]?{first:product(r.items[0])}:null;});
  if(one?.first)return {...base,product:one.first,products:base.products.length?base.products:[{...one.first,docs:undefined,group:'inUse'}],fetchedAt:one.fetchedAt,chosen:true};
 }
 if(!list)return null;
 return {...base,product:list.first,fetchedAt:list.fetchedAt};
}
