import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedPairs,overall,missingNames,verdictSection,combinedVerdict,isLabelBan,problemSection,labelSection,flagsSection,mechanismSection,basisSection,eul,ro} from '../src/clinical-view.js';

const side=(name,form='단일제',components=[])=>({name,en:name,form,components});
const drug=(name,spellings,flags=[],known=true)=>({name,aliases:spellings,spellings,known,flags,label_products:[]});
const pair=(a,b,status,records=[],mentions=[])=>({a,b,status,dur:{listed:status==='listed',direct:records.filter(r=>r.direct).length,records,reasons:[...new Set(records.filter(r=>r.direct||status!=='listed').map(r=>r.reason).filter(Boolean))],combination_reasons:[...new Set(records.filter(r=>!r.direct&&status==='listed').map(r=>r.reason).filter(Boolean))]},label:{mentions,mechanism:[],searched:{}},papers:{count:0,items:[]}});
const q1={database:'kdb-test',drugs:[drug('심바스타틴',['simvastatin','심바스타틴'],[{category:'임부금기',grade:'1등급',count:3,single:1,chunk_id:'f1'}]),drug('클래리트로마이신',['clarithromycin','클래리트로마이신','클라리트로마이신'])],
 pairs:[pair(0,1,'listed',[{chunk_id:'p1',direct:true,a:side('심바스타틴'),b:side('클래리트로마이신'),reason:'근병증 위험증가'},{chunk_id:'p2',direct:false,a:side('심바스타틴','복합제',[{name:'에제티미브'}]),b:side('클래리트로마이신'),reason:'근육병증 위험'}],
  [{chunk_id:'l1',item:'심바정',section:'2. 다음 환자에는 투여하지 말 것',text:'예. 클라리트로마이신 <b>',hits:[{start:3,end:11}],spelling:'클라리트로마이신',single:true,products:['심바정'],start:0}])]};

test('Overall verdict comes from the DUR lookup only',()=>{
 assert.equal(overall(q1),'listed');
 assert.equal(overall({pairs:[pair(0,1,'not_listed')]}),'not_listed');
 assert.equal(overall({pairs:[pair(0,1,'not_listed'),pair(0,2,'unknown')]}),'unknown');
 assert.equal(overall({pairs:[]}),'none');
});
test('Pairs with the drug being added come first',()=>{
 const data={drugs:[drug('와파린',['와파린']),drug('아스피린',['아스피린']),drug('클로피도그렐',['클로피도그렐'])],pairs:[pair(0,1,'listed'),pair(0,2,'not_listed'),pair(1,2,'not_listed')]};
 assert.deepEqual(orderedPairs(data,'클로피도그렐').map(p=>[p.a,p.b]),[[2,0],[2,1],[0,1]]); // the added drug is named first
 assert.deepEqual(orderedPairs(data,null).map(p=>[p.a,p.b]),[[0,1],[0,2],[1,2]]);
});
const notListed=(mentions=[])=>({drugs:q1.drugs,pairs:[pair(0,1,'not_listed',[],mentions)]});
const level=(data,ai,expected=[])=>combinedVerdict(data,ai?{assessment:ai}:null,null,expected).level;
test('Combined verdict: records decide first, and the model cannot declare or lower 금기 by itself',()=>{
 assert.equal(level(q1,'주의'),'금기'); // a DUR record outranks the model
 assert.equal(level(q1,'금기'),'금기');
 assert.equal(level(notListed(),'금기'),'확인 필요');
 assert.equal(level(notListed(),'상충'),'확인 필요'); // the model's own value is still 상충
 const told=verdictSection(notListed(),{assessment:'상충'},null);
 assert.match(told,/verdict-conflict xl">확인 필요/);assert.match(told,/<dt>AI 답변<\/dt><dd>확인 필요<\/dd>/);assert.doesNotMatch(told,/상충/);
 assert.match(verdictSection(q1,{assessment:'상충'},null),/AI는 '확인 필요'로 판단했습니다/);
 assert.equal(level(notListed(),'주의'),'주의');
 for(const ai of ['설명','근거 부족','분류 미확인',null])assert.equal(level(notListed(),ai),'근거 부족');
 assert.match(combinedVerdict(notListed(),null,null).reason,/안전하다는 뜻은 아닙니다/);
 const none={drugs:[],pairs:[]};
 assert.equal(level(none,'주의'),'주의');assert.equal(level(none,'금기'),'확인 필요');assert.equal(level(none,'분류 미확인'),'판정할 수 없음');assert.equal(level(none,null),'판정할 수 없음');
 const combo={drugs:q1.drugs,pairs:[pair(0,1,'combination_only',[{chunk_id:'c',direct:false,a:side('심바스타틴','복합제',[{name:'에제티미브'}]),b:side('클래리트로마이신'),reason:'x'}])]};
 assert.equal(level(combo,null),'주의');assert.equal(level(combo,'설명'),'주의');
 assert.equal(level(notListed([{section:'6. 상호작용',text:'신기능을 모니터링한다.',action:true,single:true}]),'설명'),'주의');
 assert.equal(level(notListed([{section:'6. 상호작용',text:'신기능을 모니터링한다.',action:true,single:false}]),'설명'),'근거 부족'); // may be about the product's other ingredient
 assert.match(combinedVerdict(notListed(),null,null,[],true).reason,/AI 답변이 끝나면 바뀔 수 있습니다/);assert.doesNotMatch(combinedVerdict(q1,null,null,[],true).reason,/바뀔 수/);
 assert.doesNotMatch(combinedVerdict(notListed(),{assessment:'금기',demo:true},null).level,/확인 필요/);
});
test('A label contraindication counts only as a numbered item of a single-ingredient product',()=>{
 const ban='2. 다음 환자에는 투여하지 말 것';
 assert.ok(isLabelBan({section:ban,single:true,text:'5) 강한 CYP3A4 억제제 (예: 케토코나졸)를 투여 중인 환자'}));
 assert.ok(isLabelBan({section:ban,single:true,text:'① 케토코나졸 투여 환자'}));
 assert.ok(!isLabelBan({section:ban,single:true,text:'그러나 PLATO 연구에서 서맥을 유발하는 약물 (예: 베라파밀)과 병용 투여'}));
 assert.ok(!isLabelBan({section:ban,single:true,text:'단, 플루코나졸의 경우 주의해서 투여'}));
 assert.ok(!isLabelBan({section:ban,single:false,text:'5) 사이클로스포린 병용투여 환자'}));
 assert.ok(!isLabelBan({section:'6. 상호작용',single:true,text:'5) 케토코나졸과 병용 시 주의'}));
 assert.ok(!isLabelBan({section:ban,single:true,cut_start:true,text:'5) 일부만 잘린 문장'}));
 const data=notListed([{chunk_id:'t',item:'브릴린타정',section:ban,single:true,text:'5) 강한 CYP3A4 억제제 (예: 케토코나졸)를 투여 중인 환자',hits:[],start:0}]);
 const v=combinedVerdict(data,{assessment:'설명'},null);assert.equal(v.level,'금기');assert.match(v.reason,/허가사항의 투여 금지 항목에 적혀 있습니다\. DUR 병용금기에는 없습니다/);
});
test('Verdict stays large above the tabs with what it was combined from; the AI verdict is a line, not a badge',()=>{
 const hero=verdictSection(q1,{assessment:'주의'},null);
 assert.match(hero,/<b>종합 판정<\/b>/);assert.match(hero,/verdict-contra xl">금기/);
 assert.match(hero,/심바스타틴 ＋ 클래리트로마이신/);assert.match(hero,/DUR 병용금기에 등재되어 있습니다/);
 assert.match(hero,/AI는 '주의'로 판단했습니다/);
 assert.match(hero,/<dt>DUR 병용금기<\/dt><dd>병용금기 \(기록 2건\)<\/dd>/);assert.match(hero,/<dt>허가사항<\/dt><dd>관련 문장 1개 · 투여 금지 항목 0개<\/dd>/);assert.match(hero,/<dt>AI 답변<\/dt><dd>주의<\/dd>/);
 assert.doesNotMatch(hero,/AI 판단|ai-verdict|verdict-caution/);
 const quiet=verdictSection(notListed(),{assessment:'주의',documents:[{id:'a',sourceLabel:'PubMed'}],graph:{evidenceDocuments:[{id:'a',sourceLabel:'PubMed'},{id:'b',sourceLabel:'PubMed'},{id:'c',sourceLabel:'식약처'}]},citations:[{sourceLabel:'PubMed'}]},null);
 assert.match(quiet,/verdict-caution xl">주의/);assert.match(quiet,/<dt>DUR 병용금기<\/dt><dd>미등재<\/dd>/);assert.match(quiet,/<dt>연구 문헌<\/dt><dd>검색 2편 · 답변 인용 1편<\/dd>/);
 assert.match(verdictSection(notListed(),null,null,[],true),/<dt>AI 답변<\/dt><dd>확인 중<\/dd>/);
 const pairs={drugs:[...q1.drugs,drug('암로디핀',['암로디핀'])],pairs:[pair(0,1,'listed',[{chunk_id:'p1',direct:true,a:side('심바스타틴'),b:side('클래리트로마이신'),reason:'근병증'}]),pair(0,2,'not_listed'),pair(1,2,'not_listed')]};
 const multi=verdictSection(pairs,null,null);assert.match(multi,/심바스타틴 ＋ 클래리트로마이신: DUR 병용금기에 등재/);assert.match(multi,/병용금기 1쌍 · 미등재 2쌍/);assert.doesNotMatch(multi,/pair-row/);
 assert.match(problemSection(pairs,null),/verdict-contra sm">병용금기.*verdict-info sm">DUR 병용금기 미등재/s);
 assert.match(verdictSection(q1,null,null),/data-verdict-info/);assert.match(verdictSection(q1,null,null),/AI 혼자서 금기로 만들거나/);
});
test('예상 문제 tab: regulator wording, combination products and the drugs found',()=>{
 const html=problemSection(q1,null);
 assert.match(html,/<h3>예상되는 문제<\/h3>/);
 assert.match(html,/질문에서 찾은 약: 심바스타틴, 클래리트로마이신/);
 assert.match(html,/복합제 기록에만 있는 내용/);
 assert.match(html,/심바스타틴\+에제티미브/);
 assert.match(html,/근병증 위험증가/);
 assert.match(html,/data-open-document="p1"/);
 assert.match(problemSection({drugs:q1.drugs,pairs:[pair(0,1,'not_listed')]},null),/허가사항 탭의 문장을 확인하세요/);
 assert.match(problemSection({drugs:q1.drugs,pairs:[pair(0,1,'not_listed')]},null),/함께 써도 된다는 뜻은 아니므로/);
 assert.match(html,/DUR 기록 2건 \(두 약 자체 1건, 복합제 1건\)/);
});
test('Label sentences are escaped, keep the underlined name and say when a variant spelling was used',()=>{
 const html=labelSection(q1,null);
 assert.match(html,/<h3>식약처 허가사항의 관련 문장<\/h3>/);assert.doesNotMatch(html,/허가 문서|원문 그대로/);
 assert.match(html,/예\. <mark>클라리트로마이신<\/mark> &lt;b&gt;/);
 assert.match(html,/클라리트로마이신으로 적혀 있어 임시 표기 변형표로/);
 const empty=labelSection({drugs:q1.drugs,pairs:[{...pair(0,1,'not_listed'),label:{mentions:[],mechanism:[],searched:{'와파린':1,'아스피린':0}}}]},null);
 assert.match(empty,/아스피린 제품은 이 서비스의 허가사항 자료에 없습니다\. 자료는 [^<]*치매 약 중심으로 한정되어 있습니다\. 찾아본 허가사항\(와파린 1개 제품\)에서는 상대 약 이름을 찾지 못했습니다/);assert.match(empty,/안전하다는 뜻은 아닙니다/);
});
test('Label card says when a drug has no product in the stored labels, instead of reading as searched',()=>{
 const withLabel=(searched,mentions=[])=>labelSection({drugs:q1.drugs,pairs:[{...pair(0,1,'listed'),label:{mentions,mechanism:[],searched}}]},null);
 const none=withLabel({'알프라졸람':0,'이트라코나졸':0});
 assert.match(none,/이 서비스의 허가사항 자료에는 알프라졸람, 이트라코나졸 제품이 없어 문장을 찾아볼 수 없습니다\./);
 assert.match(none,/자료는 고혈압, 당뇨, 이상지질혈증, 심근경색증, 뇌졸중, 치매 약 중심으로 한정되어 있습니다\./);
 assert.match(none,/허가사항에 관련 내용이 없다는 뜻이 아니며, 안전하다는 뜻도 아닙니다\./);assert.doesNotMatch(none,/0개 제품|상대 약 이름을 찾지/);
 const both=withLabel({'와파린':1,'아스피린':2});
 assert.match(both,/찾아본 허가사항: 와파린 1개 제품, 아스피린 2개 제품\./);assert.doesNotMatch(both,/한정되어 있습니다/);
 const sentence=[{chunk_id:'l1',item:'심바정',section:'',text:'클라리트로마이신',hits:[],single:true,products:['심바정'],start:0}];
 assert.match(withLabel({'심바스타틴':4,'클래리트로마이신':0},sentence),/클래리트로마이신 제품은 이 서비스의 허가사항 자료에 없어, 심바스타틴이 든 제품의 문장만 보여 줍니다\./);
 assert.match(withLabel({'티카그렐러':2,'클래리트로마이신':0},sentence),/티카그렐러가 든 제품의 문장만/);
 assert.doesNotMatch(withLabel({'심바스타틴':4,'클래리트로마이신':1},sentence),/허가사항 자료에 없어/);
});
test('Flags list what is recorded and what is not, and never ask for patient data',()=>{
 const html=flagsSection(q1);
 assert.match(html,/임부금기 1등급/);assert.match(html,/등재 없음/);assert.match(html,/질문한 약 모두 DUR의 [^<]*노인주의[^<]* 목록에 없습니다\. 목록에 없다고 안전하다는 뜻은 아닙니다\./);assert.doesNotMatch(html,/환자 확인용/);assert.match(html,/환자 정보는 이 화면에서 받지 않습니다/);
});
test('Basis counts records, not probabilities',()=>{
 const html=basisSection(q1);
 assert.match(html,/DUR 병용금기<\/span>.*?<span class="count">2<\/span>/s);
 assert.match(html,/위험 확률이 아닙니다/);assert.doesNotMatch(html,/%<\/span>/);
});
test('Particles follow the last sound',()=>{
 assert.equal(eul('와파린'),'을');assert.equal(eul('아스피린'),'을');assert.equal(eul('클로피도그렐'),'을');assert.equal(eul('에제티미브'),'를');
 assert.equal(ro('주의'),'로');assert.equal(ro('금기'),'로');assert.equal(ro('클라리트로마이신'),'으로');assert.equal(ro('와르파린'),'으로');assert.equal(ro('케톨'),'로');
});
test('A name the user listed but the lookup did not find blocks the "not listed" claim',()=>{
 const data={drugs:[drug('심바스타틴',['심바스타틴']),drug('아스피린',['아스피린'])],pairs:[pair(0,1,'not_listed')]};
 assert.deepEqual(missingNames(data,['심바스타틴','아스피린','니르마트렐비르']),['니르마트렐비르']);
 assert.equal(overall(data,['심바스타틴','아스피린','니르마트렐비르']),'unknown');
 const html=verdictSection(data,{assessment:'금기'},'니르마트렐비르',['심바스타틴','아스피린','니르마트렐비르']);
 assert.match(html,/verdict-conflict xl">확인 필요/);assert.match(html,/니르마트렐비르를 DUR 성분명에서 찾지 못해/);assert.doesNotMatch(html,/DUR 병용금기 미등재/);assert.match(verdictSection(data,null,'니르마트렐비르',['심바스타틴','아스피린','니르마트렐비르']),/판정할 수 없음/);
 assert.equal(overall({...data,pairs:[pair(0,1,'listed')]},['니르마트렐비르']),'listed'); // a definite finding still shows
});
test('Combination-only records get their own badge and explanation, never the red one',()=>{
 const data={drugs:[drug('에제티미브',['에제티미브']),drug('이트라코나졸',['이트라코나졸'])],pairs:[pair(0,1,'combination_only',[{chunk_id:'e1',direct:false,a:side('에제티미브','복합제',[{name:'심바스타틴'}]),b:side('이트라코나졸'),reason:'근병증'}])]};
 assert.equal(overall(data),'combination_only');
 const html=verdictSection(data,null,null);
 assert.match(html,/verdict-caution xl">주의/);assert.doesNotMatch(html,/verdict-contra/);
 assert.match(html,/두 약 자체의 기록은 없고 복합제 병용금기 기록만 있습니다/);
 const tab=problemSection(data,null);assert.match(tab,/verdict-caution sm">복합제 병용금기/);
 assert.match(tab,/두 약 자체의 병용금기 기록은 없고, 복합제 기록만 있습니다\(에제티미브\+심바스타틴\)/);
 assert.match(tab,/근병증/);
});

test('A label sentence reads under the product it belongs to',()=>{
 const m={item:'쿠파린정5밀리그램(와파린나트륨)',section:'5. 상호작용',text:'이 약은 아스피린과 병용 시 주의한다.',hits:[],single:true,chunk_id:'c1',products:['a','b']};
 const data={drugs:[{name:'와파린'},{name:'아스피린'}],pairs:[{a:0,b:1,status:'not_listed',dur:{records:[],reasons:[]},label:{mentions:[m],searched:{와파린:1,아스피린:1},mechanism:[{...m,enzymes:['CYP2C9']}]}}]};
 for(const html of [labelSection(data),mechanismSection(data)]){
  const item=html.indexOf('쿠파린정5밀리그램'),tag=html.indexOf('5. 상호작용'),box=html.indexOf('<blockquote>');
  assert.ok(item>=0&&item<tag&&tag<box,'제품명, 항목, 문장 순서');
 }
 assert.match(labelSection(data),/같은 문장 2개 제품/);assert.match(mechanismSection(data),/CYP2C9/);assert.match(labelSection(data),/data-open-document="c1"/);
});
