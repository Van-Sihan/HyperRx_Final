import test from 'node:test';
import assert from 'node:assert/strict';
import {durModel,durViewHTML,durExplorerHTML,flagValue,groupCompare,DUR_GUIDE} from '../src/dur-view.js';

// Shaped like the DB server's /clinical answer (clinical.py summary) for "이부프로펜과 나프록센을 함께 복용해도 되나요?".
const flag=(category,extra)=>({category,count:1,single:1,form:'단일제',chunk_id:`c-${category}`,...extra});
const nsaid={group:'해열진통소염제',family:'비스테로이드성 소염제'};
const clinical={drugs:[
 {name:'이부프로펜',known:true,flags:[flag('임부금기',{grade:'2등급',count:10,single:4}),flag('노인주의',{}),flag('용량주의',{max_dose:'이부프로펜 3,200밀리그램'}),flag('효능군중복',nsaid)]},
 {name:'나프록센',known:true,flags:[flag('임부금기',{grade:'2등급'}),flag('노인주의',{}),flag('용량주의',{max_dose:'나프록센 1250밀리그램'}),flag('투여기간주의',{max_days:'3일'}),flag('효능군중복',nsaid)]},
],pairs:[{a:0,b:1,status:'not_listed',dur:{listed:false,direct:0,records:[],reasons:[]}}],
 sources:{dur:{name:'식품의약품안전처_의약품안전사용서비스(DUR)성분정보',page:'https://www.data.go.kr/data/15056780/openapi.do'},dur_operations:{병용금기:'병용금기 정보조회',용량주의:'용량주의 정보조회',노인주의:'노인주의 정보조회'}}};

test('Each cell repeats the value its DUR record gives, as written',()=>{
 assert.equal(flagValue(flag('임부금기',{grade:'1등급'})),'1등급');
 assert.equal(flagValue(flag('특정연령대금기',{age:'12세 미만'})),'12세 미만');
 assert.equal(flagValue(flag('용량주의',{max_dose:'0.25밀리그램'})),'최대 투여량 0.25밀리그램');
 assert.equal(flagValue(flag('투여기간주의',{max_days:'21일'})),'최대 투여기간 21일');
 assert.equal(flagValue(flag('효능군중복',{group:'정신신경용제'})),'정신신경용제');
 assert.equal(flagValue(flag('노인주의',{})),'목록에 있음');
});
test('The table has one row per drug and one column per DUR list; an empty list is "기록 없음", never safe',()=>{
 const html=durViewHTML(clinical);
 for(const h of ['임부금기','노인주의','용량주의','투여기간주의','연령금기','효능군중복'])assert.match(html,new RegExp(`<th scope="col">${h}</th>`));
 assert.match(html,/최대 투여량 이부프로펜 3,200밀리그램/);assert.match(html,/기록 10건/);
 assert.equal((html.match(/<span>기록 없음<\/span>/g)||[]).length,3); // 이부프로펜 투여기간·연령, 나프록센 연령
 // The head line names the service once.
 assert.match(html,/<b>의약품안전사용서비스\(DUR\) 점검표<\/b> · 질문한 약 2개 · 성분정보 목록 7가지 기준/);
 // 두 약물을 한번에 검토하기: 병용금기 and 효능군 중복, each cell saying its result, then what it rests on.
 assert.match(html,/<th scope="col">두 약물<\/th><th scope="col">병용금기<\/th><th scope="col">효능군 중복<\/th>/);
 assert.match(html,/병용금기 목록에 없음/);
 assert.match(html,/class="dv-cell has" data-dur="p0\|1"><b>같은 효능군 · 같은 계열<\/b><small>해열진통소염제 · 비스테로이드성 소염제<\/small>/);
 assert.match(html,/class="dv-cell" data-dur="p0\|1"><b>병용금기 목록에 없음<\/b>/); // marked by its own finding only
 assert.doesNotMatch(html,/\d\s*%/);assert.doesNotMatch(html,/안전합니다|괜찮/);
 assert.equal(durModel(clinical).drugs[0].cells.length,6);
});
test('효능군 names are compared as written; a drug missing from the list means the two do not share a class',()=>{
 const A={name:'텔미사르탄',flags:[flag('효능군중복',{group:'혈압강하작용의약품',family:'ARB'})]},B={name:'히드로클로로티아지드',flags:[flag('효능군중복',{group:'혈압강하작용의약품',family:'Thiazide계 및 Thiazide-like 이뇨제'})]};
 const g=(x,y)=>{const r=groupCompare(x,y);return [r.text,r.detail];};
 assert.deepEqual(g(A,B),['같은 효능군','혈압강하작용의약품 · 계열은 다름']);
 // 2026-11-10: "암로디핀만 효능군 기록 있음" did not say what it meant.
 assert.deepEqual(g({name:'암로디핀',flags:[flag('효능군중복',{group:'혈압강하작용의약품'})]},{name:'클래리트로마이신',flags:[]}),['효능군이 겹치지 않음','클래리트로마이신은 효능군중복 목록에 없음']);
 assert.deepEqual(g(A,{name:'아스피린',flags:[]}),['효능군이 겹치지 않음','아스피린은 효능군중복 목록에 없음']);
 assert.deepEqual(g({name:'가',flags:[]},{name:'나',flags:[]}),['효능군이 겹치지 않음','두 약 모두 효능군중복 목록에 없음']);
 assert.deepEqual(g(A,{name:'심바스타틴',flags:[flag('효능군중복',{group:'지질저하제'})]}),['효능군이 겹치지 않음','혈압강하작용의약품 / 지질저하제']);
});
test('A cell opens its record with the source; an empty cell and an unlisted pair are not called safe',()=>{
 const cell=durExplorerHTML(clinical,'f0|용량주의');
 assert.match(cell,/의약품안전사용서비스\(DUR\) 용량주의 목록에 이부프로펜 기록이 1건 있습니다\. 적힌 최대 투여량은 이부프로펜 3,200밀리그램입니다\./);
 assert.match(cell,/data-open-document="c-용량주의"/);assert.match(cell,/용량주의 정보조회/);assert.match(cell,/환자 상태는 직접 확인하세요/);
 assert.match(durExplorerHTML(clinical,'f0|임부금기'),/10건\(단일제 4건\)/);
 assert.match(durExplorerHTML(clinical,'f0|특정연령대금기'),/연령금기 목록에서 이부프로펜 기록을 찾지 못했습니다[\s\S]*안전하다는 뜻은 아닙니다/);
 const pair=durExplorerHTML(clinical,'p0|1');assert.match(pair,/찾지 못했습니다[\s\S]*안전하다는 뜻은 아닙니다/);assert.match(pair,/알림 대상인지는 이 화면에서 판단하지 않습니다/);
});
test('A listed pair shows its reason and every record, and untrusted text is escaped',()=>{
 const side=(name,form='단일제')=>({name,form,components:[]});
 const c={drugs:[{name:'이소트레티노인',flags:[]},{name:'<img>',flags:[]}],pairs:[{a:0,b:1,status:'listed',dur:{direct:1,reasons:['두개내 고혈압'],records:[{chunk_id:'x',a:side('이소트레티노인'),b:side('<img>'),reason:'두개내 고혈압',direct:true}]}}]};
 const html=durViewHTML(c),side_=durExplorerHTML(c,'p0|1');
 assert.match(html,/병용금기 목록에 있음/);assert.match(html,/기록 1건 · 두개내 고혈압/);assert.doesNotMatch(html+side_,/<img>/);
 assert.match(side_,/두 약을 함께 적은 기록이 1건 있습니다\. 적힌 금기·주의 내용은 “두개내 고혈압”입니다\./);assert.match(side_,/data-open-document="x"/);
});
test('Waiting, failure, the demo mode and a one-drug question each say what they are; the guide is not on the page itself',()=>{
 assert.match(durViewHTML(null),/실제 DB를 쓰는 답변에서만/);assert.match(durViewHTML({pending:true}),/확인하는 중/);
 assert.match(durViewHTML({error:'규칙 조회에 실패했습니다.'}),/조회하지 못했습니다/);assert.match(durViewHTML({drugs:[],pairs:[]}),/의약품안전사용서비스\(DUR\) 성분명을 찾지 못했습니다/);
 assert.match(durViewHTML({drugs:[clinical.drugs[0]],pairs:[]}),/약이 하나라서/);
 assert.ok(DUR_GUIDE.some(t=>/안전하다는 뜻은 아닙니다/.test(t))&&DUR_GUIDE.some(t=>/AI가 쓴 내용이 아니라/.test(t)));
 assert.doesNotMatch(durViewHTML(clinical),/AI가 쓴 내용이 아니라/);
});
test('A chosen record keeps its look and the other cells fade until the choice is cleared (2026-11-09)',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../src/dur-view.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/chatbot2.css',import.meta.url),'utf8');
 const filter=src.slice(src.indexOf(' function filter('),src.indexOf('\n',src.indexOf(' function filter(')));
 assert.match(filter,/toggle\('on',b\.dataset\.dur===key\)/);assert.match(filter,/toggle\('off',key!=null&&b\.dataset\.dur!==key\)/);
 assert.match(css,/\.dv-cell\.off\{opacity:\.3\}/);
});
