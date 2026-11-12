import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fullTerms,DUR_FULL} from '../src/terms.js';

test('DUR on its own is written out as 의약품안전사용서비스(DUR), once',()=>{
 assert.equal(DUR_FULL,'의약품안전사용서비스(DUR)');
 assert.equal(fullTerms('DUR 점검표'),'의약품안전사용서비스(DUR) 점검표');
 assert.equal(fullTerms('DUR 성분정보 · DUR에서 찾지 못함 · DUR과 허가사항'),'의약품안전사용서비스(DUR) 성분정보 · 의약품안전사용서비스(DUR)에서 찾지 못함 · 의약품안전사용서비스(DUR)과 허가사항');
 assert.equal(fullTerms('의약품안전사용서비스(DUR) 병용금기'),'의약품안전사용서비스(DUR) 병용금기'); // already written out
 assert.equal(fullTerms(fullTerms('DUR 기록')),'의약품안전사용서비스(DUR) 기록');                 // idempotent
 assert.equal(fullTerms('DURATION, data-dur, KDUR1'),'DURATION, data-dur, KDUR1');                  // other words stay
 assert.equal(fullTerms(null),'');
});
test('The main screen writes DUR out and watches what is drawn later; the pairs view is off the toolbar',()=>{
 const html=readFileSync(new URL('../public/chatbot2.html',import.meta.url),'utf8'),js=readFileSync(new URL('../src/chatbot2.js',import.meta.url),'utf8');
 const text=html.replace(/<[^>]+>/g,' ');
 assert.doesNotMatch(text,/(?<!의약품안전사용서비스\()(?<![A-Za-z0-9_-])DUR(?![A-Za-z0-9_])/);
 assert.match(html,/>의약품안전사용서비스\(DUR\) 점검표<\/button>/);
 assert.match(js,/import \{watchTerms\} from '\.\/terms\.js';\n[^\n]*\nwatchTerms\(\);/);
 assert.doesNotMatch(html,/data-dimension="pairs"/);
 assert.match(html,/<button id="fit" class="icon-tool" aria-label="화면에 맞춤" title="화면에 맞춤"><\/button>/);
});
