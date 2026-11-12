import test from 'node:test';
import assert from 'node:assert/strict';
import {apaHTML,sourceLine,sourceHeading,numberSentences,markPassage,relationSentences,citationRun,citationNumbers} from '../src/sources.js';

test('The verdict line lists every cited source in number order, with the sentences the answer pointed at',()=>{
 const run=citationRun([{ref:'S43'},{ref:'S6',sentences:{1:'a',2:'b'}},{ref:'S12',sentences:{}},{ref:'S8',sentences:{3:'c'}}]);
 assert.equal(run,'[S6.1][S6.2][S8.3][S12][S43]');
 assert.equal(citationRun([]),'');assert.equal(citationRun(),'');
});
test('Readers see cited sources numbered 1, 2, 3 … in their original order, whatever S numbers the model was given',()=>{
 const nums=citationNumbers([{ref:'S43'},{ref:'S6'},{ref:'S12'},{ref:'S8'},{ref:'S11'}]);
 assert.deepEqual([...nums],[['S6',1],['S8',2],['S11',3],['S12',4],['S43',5]]);
 assert.equal(citationNumbers().size,0);
});

const article={kind:'article',authors:'Kim, A., & Lee, B.',year:'2024',title:'Bleeding <risk>.',container:'Drug Safety',volume:'47',issue:'2',pages:'101–110',url:'https://doi.org/10.1/x'};
test('APA reference: journal and volume in italics, text escaped, only web links',()=>{
 const html=apaHTML(article);
 assert.equal(html,'Kim, A., &amp; Lee, B. (2024). Bleeding &lt;risk&gt;. <i>Drug Safety</i>, <i>47</i>(2), 101–110. <a href="https://doi.org/10.1/x" target="_blank" rel="noopener noreferrer">https://doi.org/10.1/x</a>');
 assert.doesNotMatch(apaHTML({...article,url:'javascript:alert(1)'}),/<a /);
 assert.match(apaHTML({kind:'chapter',authors:'Simone, C. G.',year:'2026',title:'Toxicity.',container:'StatPearls',publisher:'StatPearls Publishing',url:'https://www.ncbi.nlm.nih.gov/books/NBK562309/'}),/Toxicity\. In <i>StatPearls<\/i>\. StatPearls Publishing\./);
 assert.match(apaHTML({kind:'report',authors:'Abdus, S.',year:'2025',title:'Benzodiazepine use',report:'Statistical Brief No. 567',publisher:'Agency for Healthcare Research and Quality',url:''}),/<i>Benzodiazepine use<\/i> \(Statistical Brief No\. 567\)\. Agency/);
});
test('Source line names the official dataset and its operation, and links the portal page',()=>{
 const line=sourceLine({sourceLabel:'식품의약품안전처_의약품안전사용서비스(DUR)성분정보',sourceOperation:'병용금기 정보조회',sourcePage:'https://www.data.go.kr/data/15056780/openapi.do'});
 assert.match(line,/출처: 식품의약품안전처_의약품안전사용서비스\(DUR\)성분정보 · 병용금기 정보조회 · <a href="https:\/\/www\.data\.go\.kr\/data\/15056780\/openapi\.do"[^>]*>공공데이터포털 ↗<\/a>/);
 assert.match(sourceLine({source_label:'PubMed',source_page:'https://pubmed.ncbi.nlm.nih.gov/'}),/pubmed\.ncbi\.nlm\.nih\.gov ↗/);
 assert.equal(sourceLine({}),'');
 assert.match(sourceHeading({title:'제목',citation:article}),/^<p class="apa">/);assert.equal(sourceHeading({title:'제목'},'h3'),'<h3>제목</h3>');
});
import {originHTML} from '../src/sources.js';
test('Original-record rows: readable first, repeated labels once, internal ids folded underneath',()=>{
 const html=originHTML({id:'chunk-1',origin:{rows:[['원자료','DUR 성분정보 병용금기 파일, 48번째 행',''],['성분코드','D000027 심바스타틴',''],['성분코드','D000373 클래리트로마이신',''],['PMID','1','javascript:x']],ids:['DUR-b01']}},{open:true});
 assert.match(html,/<details class="source-metadata origin" open><summary>원자료 정보<\/summary>/);
 assert.match(html,/<dt>성분코드<\/dt><dd>D000027 심바스타틴<\/dd><dt><\/dt><dd>D000373 클래리트로마이신<\/dd>/);
 assert.doesNotMatch(html,/javascript:/);
 assert.match(html,/<summary>DB 내부 아이디<\/summary><p>DUR-b01<br>chunk-1<\/p>/);
});
test('Sentences get numbers; the product header keeps its place without one; decimals do not split a sentence',()=>{
 const text='[품목 | 주성분: 약 0.5 밀리그램] 효능·효과\n1) 첫 항목\n용량은 0.5mg 입니다. 둘째 문장. 영어 sentence.';
 const n=numberSentences(text);
 assert.deepEqual(n.sentences,['효능·효과','1) 첫 항목','용량은 0.5mg 입니다.','둘째 문장.','영어 sentence.']);
 assert.equal(n.text,'[품목 | 주성분: 약 0.5 밀리그램] ⟦1⟧ 효능·효과\n⟦2⟧ 1) 첫 항목\n⟦3⟧ 용량은 0.5mg 입니다. ⟦4⟧ 둘째 문장. ⟦5⟧ 영어 sentence.');
 assert.deepEqual(numberSentences('[약 | 주성분: 가 1 밀리그램] 1. 다음 환자에는 투여하지 말 것\n1) 임부').sentences,['1. 다음 환자에는 투여하지 말 것','1) 임부']);
 assert.deepEqual(numberSentences('').sentences,[]);assert.deepEqual(numberSentences(undefined).sentences,[]);
});
test('Only the exact sentences are marked: spacing tolerated, text escaped, never by resemblance',()=>{
 const text='경고 <주의>\n이 약을 PDE-5 저해제(예: 실데나필)와\n병용하지 말 것. 다음 문장. 마지막 문장.';
 const one=markPassage(text,['이 약을 PDE-5 저해제(예: 실데나필)와 병용하지 말 것.']);
 assert.equal(one.found,1);assert.match(one.html,/&lt;주의&gt;/);assert.match(one.html,/<mark class="source-mark">이 약을 PDE-5 저해제\(예: 실데나필\)와\n병용하지 말 것\.<\/mark>/);
 const two=markPassage(text,['마지막 문장.','다음 문장.']);assert.equal(two.found,2);assert.match(two.html,/<mark class="source-mark">다음 문장\.<\/mark> <mark class="source-mark">마지막 문장\.<\/mark>/);
 const similar=markPassage(text,['다음 문장과 비슷한 문장']);assert.equal(similar.found,0);assert.doesNotMatch(similar.html,/<mark/);
 assert.equal(markPassage(text).found,0);assert.equal(markPassage(text,null).found,0);
 assert.equal(markPassage('a(b)c',['(b)']).found,1);
 assert.equal(markPassage('가나다라마바',['가나다라','다라마바']).found,1);
});

test('A relation marks the sentences naming the most members, by the names written in the text',()=>{
 const text='심바스타틴은 스타틴이다. 심바 스타틴과 CLARITHROMYCIN은 함께 쓰지 않는다. 클래리트로마이신은 항생제이다. 관계없는 문장.';
 assert.deepEqual(relationSentences(text,['심바스타틴','Clarithromycin']),['심바 스타틴과 CLARITHROMYCIN은 함께 쓰지 않는다.']);
 assert.deepEqual(relationSentences(text,['클래리트로마이신']),['클래리트로마이신은 항생제이다.']);
 assert.equal(relationSentences('가 일. 가 이. 가 삼. 가 사.',['가']).length,3);
 assert.deepEqual(relationSentences(text,['없는약']),[]);assert.deepEqual(relationSentences(text,[]),[]);assert.deepEqual(relationSentences(null,['가']),[]);
 assert.deepEqual(relationSentences('[약 | 주성분: 가] 나는 항목이다.',['가']),[]); // the repeated product header is not a sentence
 assert.deepEqual(relationSentences('a(b)c 문장.',['(b)']),['a(b)c 문장.']);
});
