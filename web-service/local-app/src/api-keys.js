// The reader's own API keys (2026-11-10). Kept in this browser only: sessionStorage, cleared when the tab closes,
// unless the reader asks to remember them (localStorage). They go to this site's server only as request headers,
// never in a URL, and the server uses them for that request alone (server.mjs, db_server.py).
export const OPENAI_KEY=/^sk-[A-Za-z0-9_-]{20,300}$/;
// The 공공데이터포털 key as the portal shows it: Decoding (letters, digits, + / =) or Encoding (%2B …).
export const MFDS_KEY=/^[A-Za-z0-9%+/=]{20,400}$/;
const NAMES={openai:'hyperrx-openai-key',mfds:'hyperrx-mfds-key'},REMEMBER='hyperrx-remember-keys';
const HEADERS={openai:'X-OpenAI-Key',mfds:'X-MFDS-Key'};
const browser=()=>{try{return {session:globalThis.sessionStorage,local:globalThis.localStorage};}catch{return {};}};
// stores: {session, local}, both Storage-like; the browser's own when left out (tests pass their own).
export function keyStore(stores=browser()){
 const get=(s,k)=>{try{return s?.getItem(k)||'';}catch{return '';}};
 const put=(s,k,v)=>{try{v?s?.setItem(k,v):s?.removeItem(k);}catch{}};
 const remembered=()=>get(stores.local,REMEMBER)==='1';
 const key=kind=>get(stores.session,NAMES[kind])||get(stores.local,NAMES[kind]);
 return {
  key,remembered,
  // Saves both keys in one place and removes them from the other; an empty value removes that key.
  save(keys,remember){
   for(const kind of Object.keys(NAMES)){const v=String(keys[kind]??'').trim();put(remember?stores.local:stores.session,NAMES[kind],v);put(remember?stores.session:stores.local,NAMES[kind],'');}
   put(stores.local,REMEMBER,remember?'1':'');
  },
  clear(){for(const k of Object.values(NAMES)){put(stores.session,k,'');put(stores.local,k,'');}put(stores.local,REMEMBER,'');},
  headers(kind){const v=key(kind);return v?{[HEADERS[kind]]:v}:{};},
 };
}
// What is wrong with a typed key, or '' when it looks right (or is empty). Only the form is checked here; the
// service itself says whether the key works.
export function keyProblem(kind,value){
 const v=String(value??'').trim();if(!v)return '';
 if(kind==='openai')return OPENAI_KEY.test(v)?'':/\s/.test(v)?'키 중간에 빈칸이 있습니다. 복사한 키를 다시 붙여 넣어 주세요.':'OpenAI API 키는 sk-로 시작합니다. 키 전체를 붙여 넣어 주세요.';
 return MFDS_KEY.test(v)?'':'공공데이터포털 일반 인증키(Decoding)를 붙여 넣어 주세요.';
}
// A key shown back to the reader: its first and last characters only.
export const maskKey=v=>{const s=String(v||'');return s.length>12?`${s.slice(0,s.startsWith('sk-proj-')?8:3)}…${s.slice(-4)}`:s?'입력됨':'';};
