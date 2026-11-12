import test from 'node:test';
import assert from 'node:assert/strict';
import {keyStore,keyProblem,maskKey} from '../src/api-keys.js';
// Storage-like stand-ins for sessionStorage and localStorage.
const storage=()=>{const m=new Map();return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const OPENAI='sk-proj-'+'A1b2_c3-'.repeat(12),MFDS='abcDEF123+/='.repeat(4);

test('Keys stay in this tab unless the reader asks to remember them, and only one place holds them (2026-11-10)',()=>{
 const session=storage(),local=storage(),keys=keyStore({session,local});
 keys.save({openai:OPENAI,mfds:''},false);
 assert.equal(session.m.get('hyperrx-openai-key'),OPENAI);assert.equal(local.m.size,0);assert.equal(keys.remembered(),false);
 assert.deepEqual(keys.headers('openai'),{'X-OpenAI-Key':OPENAI});assert.deepEqual(keys.headers('mfds'),{});
 keys.save({openai:OPENAI,mfds:MFDS},true);
 assert.equal(session.m.size,0);assert.equal(local.m.get('hyperrx-mfds-key'),MFDS);assert.equal(keys.remembered(),true);
 assert.deepEqual(keys.headers('mfds'),{'X-MFDS-Key':MFDS});
 keys.clear();assert.equal(session.m.size+local.m.size,0);assert.equal(keys.key('openai'),'');
});
test('Blocked storage does not break the page; there are simply no keys',()=>{
 const broken={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
 const keys=keyStore({session:broken,local:broken});
 keys.save({openai:OPENAI},true);assert.equal(keys.key('openai'),'');assert.deepEqual(keys.headers('openai'),{});
});
test('A typed key is checked for its form, and shown back only by its ends',()=>{
 assert.equal(keyProblem('openai',''),'');assert.equal(keyProblem('openai',OPENAI),'');
 assert.match(keyProblem('openai','pk-123'),/sk-로 시작합니다/);assert.match(keyProblem('openai','sk-abc def'+'x'.repeat(30)),/빈칸/);
 assert.equal(keyProblem('mfds',MFDS),'');assert.equal(keyProblem('mfds','abc%2Bdef%3D'.repeat(3)),'');assert.match(keyProblem('mfds','키'),/Decoding/);
 assert.equal(maskKey(OPENAI),'sk-proj-…'+OPENAI.slice(-4));assert.equal(maskKey('sk-'+'x'.repeat(40)+'wxyz'),'sk-…wxyz');assert.equal(maskKey(''),'');
 assert.ok(!maskKey(OPENAI).includes(OPENAI.slice(8,20)));
});
