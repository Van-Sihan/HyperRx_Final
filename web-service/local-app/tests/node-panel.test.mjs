import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeHTML,NODE_KIND,descParagraphs,clipSentence,iga,DESC_NOTE,topicOf,actionTags,labelItems} from '../src/node-panel.js';
import {parseDoc} from '../mfds-label.mjs';

// A question on 로바스타틴 + 이트라코나졸: a DUR record and a combination label, two relations, the entity 횡문근융해증.
const nodes=[
 {id:'lova',label:'로바스타틴',type:'DRUG_PRODUCT',description:'로바스타틴은 고지혈증 치료제로 사용되는 약물로, HMG-CoA 환원효소 억제제에 해당한다. 이 약물은 콜레스테롤 생성을 억제한다.\n\n여러 약물과의 병용 시 주의가 필요하다.'},
 {id:'LOVA',label:'LOVASTATIN',type:'ACTIVE_INGREDIENT',description:'A cholesterol-lowering agent of the statin class.<SEP>로바스타틴은 콜레스테롤 저하제로 사용되는 단일제 약물이다.'},
 {id:'itra',label:'이트라코나졸',type:'ACTIVE_INGREDIENT'},
 {id:'rhab',label:'횡문근융해증',type:'ADVERSE_EVENT',description:'Rhabdomyolysis is a severe muscle injury.<SEP>횡문근융해증은 근육 세포가 <b>파괴</b>되는 심각한 근육병증이다. 신장 기능이 나빠질 수 있다.'},
 {id:'old',label:'고령자',type:'PATIENT_GROUP'}];
const docs=[
 {id:'dur',title:'로바스타틴 · 이트라코나졸 — 병용금기',sourceShort:'DUR 성분정보',category:'병용금기',excerpt:'[병용금기] 로바스타틴(Lovastatin)(단일제)과(와) 이트라코나졸(Itraconazole)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 횡문근융해증'},
 {id:'lab',title:'로바콜정 — 사용상의 주의사항',sourceShort:'의약품 제품 허가정보',excerpt:'[로바콜정 | 주성분: 로바스타틴 20 밀리그램]\n사용상의 주의사항\n1. 경고\n이 약은 드물게 횡문근융해증을 일으킬 수\n있다. 고령자에서는 주의한다.'}];
const graph={nodes,evidenceDocuments:docs,hyperedges:[
 {id:'e-lab',label:'부작용 · 고령자',members:['lova','rhab','old'],sourceIds:['lab']},
 {id:'e-dur',label:'병용금기',members:['lova','itra','rhab'],sourceIds:['dur']}]};
const drugs=[{name:'로바스타틴',aliases:['로바스타틴','Lovastatin'],ids:new Set(['lova','LOVA'])},{name:'이트라코나졸',aliases:['이트라코나졸'],ids:new Set(['itra'])}];
// The rule lookup's DUR records for 로바스타틴 (clinical.py flags).
const clinical={drugs:[{name:'로바스타틴',aliases:['lovastatin','로바스타틴'],flags:[
 {category:'임부금기',grade:'1등급',detail:'태아 발육에 필수적인 콜레스테롤의 생합성 감소 가능성.',form:'단일제',chunk_id:'f-preg'},
 {category:'효능군중복',group:'지질저하제',family:'HMG-CoA 환원효소 저해제',form:'단일제',chunk_id:'f-class'},
 {category:'용량주의',max_dose:'로바스타틴 80밀리그램',form:'단일제',chunk_id:'f-dose'},
 {category:'특정연령대금기',age:'20세 미만',detail:'안전성 및 유효성 미확립',form:'단일제',chunk_id:'f-age'}]},{name:'이트라코나졸',aliases:['이트라코나졸'],flags:[]}],pairs:[]};
// /api/entity for 로바스타틴: the description sentence by sentence, each with the records it most likely came from.
const entry={names:['lova','LOVA'],paragraphs:[
 {entity:'LOVA',lang:'en',sentences:[{text:'A cholesterol-lowering agent of the statin class.',sources:[]}]},
 {entity:'lova',lang:'ko',sentences:[
  {text:'로바스타틴은 고지혈증 치료제로 사용되는 약물로, HMG-CoA 환원효소 억제제에 해당한다.',sources:[{id:'p-eff',marks:['[로바콜정 | 주성분: 로바스타틴 20 밀리그램 | 동맥경화용제]']}],
   terms:[{name:'고지혈증',type:'DISEASE_OR_CONDITION'},{name:'HMG-CoA 환원효소 억제제',type:'DRUG_CLASS'}]},
  {text:'이 약물은 콜레스테롤 생성을 억제한다.',sources:[{id:'p-eff',marks:['…']},{id:'f-preg',marks:['금기·주의 내용: 태아 발육에 필수적인 콜레스테롤의 생합성 감소 가능성.']}],terms:[]}]},
 {entity:'lova',lang:'ko',sentences:[{text:'이트라코나졸과의 병용 시 횡문근융해증에 주의가 필요하다.',sources:[],
  terms:[{name:'이트라코나졸',type:'ACTIVE_INGREDIENT'},{name:'횡문근융해증',type:'ADVERSE_EVENT'}]},{text:'따라서 신중하게 사용해야 한다.',sources:[],terms:[]}]}],
 documents:[{id:'p-eff',title:'로바콜정 — 효능·효과',source_label:'식품의약품안전처_의약품 제품 허가정보',source_short:'의약품 제품 허가정보',category:'효능·효과'},
  {id:'f-preg',title:'로바스타틴 — 임부금기',source_label:'식품의약품안전처_DUR 성분정보',source_short:'DUR 성분정보',category:'임부금기'}]};
const plain=h=>h.replace(/<details class="xp-info">[\s\S]*?<\/details>/,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

test('A tip ends at the last sentence that fits, not in the middle of a word',()=>{
 const t='이트라코나졸은 강력한 항진균제이다. 아토르바스타틴과 함께 쓰면 AUC가 증가했다. 이트라코나졸은 200 mg을 1일 1회 투여한다.';
 assert.equal(clipSentence(t,70),'이트라코나졸은 강력한 항진균제이다. 아토르바스타틴과 함께 쓰면 AUC가 증가했다.');
 assert.equal(clipSentence(t,500),t);
 assert.equal(clipSentence('끝나지 않는 아주 긴 첫 문장이 이어진다',10),'끝나지 않는 아주…');
 assert.equal(clipSentence('용량은 1.5 mg이다. 다음 문장.',15),'용량은 1.5 mg이다.'); // a decimal point is not a sentence end
});
test('이/가 follows the headword',()=>{
 assert.equal(iga('이트라코나졸'),'이');assert.equal(iga('고령자'),'가');assert.equal(iga('LOVASTATIN'),'이(가)');
});
test('Without the record lookup the description shows in full, its Korean paragraphs, the one about the entry first',()=>{
 assert.deepEqual(descParagraphs([nodes[0],nodes[1]],'로바스타틴').map(p=>p.sentences.map(s=>s.text)),[
  ['로바스타틴은 고지혈증 치료제로 사용되는 약물로, HMG-CoA 환원효소 억제제에 해당한다.','이 약물은 콜레스테롤 생성을 억제한다.'],
  ['로바스타틴은 콜레스테롤 저하제로 사용되는 단일제 약물이다.'],['여러 약물과의 병용 시 주의가 필요하다.']]);
 assert.deepEqual(descParagraphs([{id:'x'}],'x'),[]);
});
test('An asked drug: the headword, a rule, the description with each sentence\'s record numbers, then its DUR records',()=>{
 const sel={kind:'node',name:'로바스타틴',ids:['lova','LOVA']},html=nodeHTML(graph,sel,{drugs,clinical,entry}),p=plain(html);
 assert.match(p,/사전 질문한 약 로바스타틴 다른 표기: LOVASTATIN, Lovastatin/);
 assert.match(html,/<\/h3>[\s\S]*<hr class="xn-rule"><div class="xn-glance-head">한눈에 보기<\/div><div class="xn-glance">/);
 // 한눈에 보기: the terms the summary names, by kind (the drug itself left out; the 이상반응 tile skips what the drug is
 // for: "곰팡이 감염 치료" names no adverse event).
 assert.match(p,/한눈에 보기 분류 HMG-CoA 환원효소 억제제 함께 쓸 때 주의할 약 1 이트라코나졸 관련 이상반응 횡문근융해증 어떤 약인가요/);
 // Korean paragraphs only, by topic; the records numbered top to bottom: the summary's first, then the DUR records.
 assert.match(p,/어떤 약인가요 로바스타틴은 고지혈증 치료제로 사용되는 약물로, HMG-CoA 환원효소 억제제에 해당한다\. 1 작용 방식 이 약물은 콜레스테롤 생성을 억제한다\. 1 2 함께 쓸 때 주의할 약 이트라코나졸과의 병용 시 횡문근융해증에 주의가 필요하다\. 그 밖의 설명 따라서 신중하게 사용해야 한다\. HyperRx가 데이터베이스의 내용을 바탕으로 요약한 정보입니다\./);
 assert.doesNotMatch(p,/statin class/);
 assert.match(html,/class="xn-cite" data-open-document="f-preg" data-match="1" data-marks="\[&quot;금기·주의 내용: 태아 발육에 필수적인 콜레스테롤의 생합성 감소 가능성\.&quot;\]" title="근거 2: 로바스타틴 — 임부금기">2<\/button>/);
 assert.doesNotMatch(p,/이 질문의 관계|공식 기록|함께 든 항목 로바스타틴|더 읽기/);
 // The DUR records under their own heading, the class first, numbered after the description's records.
 assert.match(p,/의약품안전사용서비스\(DUR\)에 따른 분류 효능군 지질저하제 · HMG-CoA 환원효소 저해제 근거 3 임부금기 1등급 · 태아 발육에 필수적인 콜레스테롤의 생합성 감소 가능성\. 근거 2 연령 금기 20세 미만 · 안전성 및 유효성 미확립 근거 4 최대 투여량 로바스타틴 80밀리그램 근거 5/);
 assert.match(p,/원자료 확인하기 .*로바스타틴이 포함되어 있는 관계 확인하기/);
 const tab=plain(nodeHTML(graph,sel,{drugs,clinical,entry,part:'sources'}));
 assert.match(tab,/근거 7건입니다.*설명 문장의 원자료 근거 1 로바콜정 — 효능·효과.*근거 2 로바스타틴 — 임부금기.*의약품안전사용서비스\(DUR\)에 따른 분류 근거 3.*로바스타틴이 포함되어 있는 관계의 원자료 근거 6/);
});
test('Before the lookup answers, and when it fails, the description shows without numbers and says so',()=>{
 const sel={kind:'node',name:'로바스타틴',ids:['lova','LOVA']};
 const wait=plain(nodeHTML(graph,sel,{drugs,clinical,entry:{pending:true}}));
 assert.match(wait,/어떤 약인가요 로바스타틴은 고지혈증 치료제로 사용되는 약물로, HMG-CoA 환원효소 억제제에 해당한다\. 로바스타틴은 콜레스테롤 저하제로 사용되는 단일제 약물이다\. 작용 방식 이 약물은 콜레스테롤 생성을 억제한다\. 함께 쓸 때 주의할 약 여러 약물과의 병용 시 주의가 필요하다\./);
 assert.doesNotMatch(wait,/한눈에 보기/); // no terms before the lookup answers
 assert.match(wait,/원자료 번호를 찾는 중입니다/);
 assert.match(plain(nodeHTML(graph,sel,{drugs,clinical,entry:{error:true}})),/원자료 번호를 불러오지 못했습니다/);
 assert.match(plain(nodeHTML(graph,sel,{drugs,clinical})),new RegExp(DESC_NOTE.replace(/\./g,'\\.')));
});
test('Another entity: its kind in words, no DUR part, its 원자료 word for word, its relations with their colour',()=>{
 const html=nodeHTML(graph,{kind:'node',id:'rhab',ids:['rhab']},{drugs,clinical,citations:[{id:'dur'}],palette:['#111111','#222222']}),p=plain(html);
 assert.match(p,/사전 이상반응 횡문근융해증 무엇인가요 횡문근융해증은 근육 세포가 &lt;b&gt;파괴&lt;\/b&gt;되는 심각한 근육병증이다\. 그 밖의 설명 신장 기능이 나빠질 수 있다\./);
 assert.doesNotMatch(html,/<b>파괴/);assert.doesNotMatch(p,/ADVERSE_EVENT|DUR\)에 따른 분류|Rhabdomyolysis/);assert.equal(NODE_KIND.PATIENT_GROUP,'환자군');
 const said=[...p.matchAll(/“([^”]+)”/g)].map(m=>m[1]);
 assert.deepEqual(said,['금기·주의 내용: 횡문근융해증','이 약은 드물게 횡문근융해증을 일으킬 수 있다.']);
 assert.match(p,/원자료 확인하기/);assert.match(p,/횡문근융해증이 포함되어 있는 관계 확인하기 병용금기/);
 assert.deepEqual([...html.matchAll(/data-explore-edge="([^"]+)"/g)].map(m=>m[1]),['e-dur','e-lab']);
 assert.match(html,/class="xn-dot" style="background:#222222"/);
 assert.doesNotMatch(html,/data-explore-node|xn-chip/);
 assert.equal(nodeHTML(graph,{kind:'edge',id:'e-dur'},{drugs}),'');assert.equal(nodeHTML(graph,{kind:'node',id:'none',ids:['none']},{drugs}),'');
});
test('A topic shows four sentences and folds the rest',()=>{
 const long={...nodes[3],id:'long',description:Array.from({length:13},(_,i)=>`문장 ${i+1}번은 횡문근융해증에 관한 내용이다.`).join(' ')};
 const html=nodeHTML({...graph,nodes:[...nodes,long]},{kind:'node',id:'long',ids:['long'],name:'긴 항목'},{drugs});
 assert.match(html,/문장 4번은[^<]*<\/li><\/ul><details class="xn-more"><summary>9문장 더 보기<\/summary><ul><li>문장 5번은/);
});
test('Each summary sentence goes under one topic by its own words',()=>{
 const drug=n=>({name:n,type:'ACTIVE_INGREDIENT'}),name='이트라코나졸';
 const cases=[
  ['이트라코나졸은 강력한 항진균제로, 주로 곰팡이 감염 치료, 특히 무좀 치료에 효과적이다.',[{name:'항진균제',type:'DRUG_CLASS'}],'what'],
  ['이 약물은 CYP3A4의 강력한 억제제로 작용하며, 아토르바스타틴 등과 병용할 경우 근육병증의 위험성을 증가시킬 수 있다.',[drug('아토르바스타틴')],'drugs'],
  ['이트라코나졸은 200 mg을 1일 1회 투여하는 것이 일반적이며, 단회 투여도 허용된다.',[],'dose'],
  ['이트라코나졸과 플루바스타틴나트륨 간의 쌍방향 약물 상호작용은 관찰되지 않았으나, 임신 중의 안전성은 확립되지 않았다.',[drug('플루바스타틴나트륨')],'patient'],
  ['따라서, 이트라코나졸은 다양한 약물 상호작용을 고려하여 매우 신중하게 사용해야 한다.',[],'other'],
  ['이 약물은 P-gp의 강력한 저해제이다.',[],'action']];
 for(const [t,terms,want] of cases)assert.equal(topicOf(t,name,terms),want,t);
 // An entry that is not a drug: the drugs named with 병용 are its related drugs ("고용량 사용" is not a dose), and the first
 // sentence says what it is even when it ends on "발생할 수 있다".
 const rh='횡문근융해증';
 assert.equal(topicOf('주요 원인으로는 로수바스타틴과 같은 스타틴 계열 약물의 고용량 사용이 지목되며, 이들 약물의 병용 사용은 근육 세포의 파괴를 초래한다.',rh,[drug('로수바스타틴')]),'drugs');
 assert.equal(topicOf('횡문근융해증은 심각한 근육병증으로, 치료 기간 중 언제든지 발생할 수 있다.',rh,[],true),'what');
 assert.equal(topicOf('횡문근융해증은 다양한 증상을 동반한다.',rh,[]),'effect');
 // The 이상반응 tile leaves out the sentence on what the drug is for ("곰팡이 감염 치료" is not an adverse event).
 const one={nodes:[{id:'i',label:'이트라코나졸',type:'ACTIVE_INGREDIENT'}],hyperedges:[],evidenceDocuments:[]};
 const tiles=plain(nodeHTML(one,{kind:'node',id:'i',ids:['i']},{entry:{documents:[],paragraphs:[{lang:'ko',sentences:[
  {text:'이트라코나졸은 항진균제로, 곰팡이 감염 치료에 쓰인다.',sources:[],terms:[{name:'곰팡이',type:'ADVERSE_EVENT'},{name:'항진균제',type:'DRUG_CLASS'}]},
  {text:'심바스타틴과 병용하면 근육병증이 생길 수 있다.',sources:[],terms:[drug('심바스타틴'),{name:'근육병증',type:'ADVERSE_EVENT'}]}]}]}}));
 assert.match(tiles,/사전 성분 이트라코나졸 한눈에 보기 분류 항진균제 함께 쓸 때 주의할 약 1 심바스타틴 관련 이상반응 근육병증 어떤 약인가요/);
 // Without the lookup's terms, words alone decide: "병용" puts it with the drugs.
 assert.equal(topicOf('따라서 다양한 약물과의 병용에 주의한다.',name,null),'drugs');
 assert.deepEqual(actionTags([{text:cases[1][0]},{text:'이 약물은 P-gp의 강력한 저해제로, 다비가트란과의 병용은 금기이다.'}]),['CYP3A4의 강력한 억제제','P-gp의 강력한 저해제']);
});
// /api/label for 이트라코나졸: one product's 의약품안전나라 허가정보.
const LABEL={source:{name:'의약품안전나라'},query:'이트라코나졸',count:75,defaultSeq:'202105228',fetchedAt:'2026-11-10T01:00:00Z',search:'https://nedrug.mfds.go.kr/searchDrug?searchYn=true&itemName=x',
 products:[{itemSeq:'202105228',name:'스포라녹스캡슐(이트라코나졸)',company:'(주)한국얀센',status:'정상',group:'inUse'},{itemSeq:'200003111',name:'이트라정100밀리그램(이트라코나졸)',company:'한미약품(주)',status:'정상',group:'inUse'},
  {itemSeq:'199806500',name:'스포라녹스액(이트라코나졸)',company:'(주)한국얀센',status:'취하',endDate:'2025-08-18',group:'ended'}],
 product:{itemSeq:'202105228',name:'스포라녹스캡슐(이트라코나졸)',company:'(주)한국얀센',kind:'전문의약품',status:'정상',permitDate:'2021-07-09',changeDate:'2026-04-16',chart:'파란색/분홍색 캡슐',
  material:[{total:'1캡슐(556 밀리그램) 중',name:'이트라코나졸',amount:'100',unit:'밀리그램'}],atc:'J02AC02',storage:'실온보관',validTerm:'36 개월',pack:'56 캡슐/상자',
  url:'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=202105228',
  docs:{ee:parseDoc('<DOC><SECTION title=""><ARTICLE title=""><PARAGRAPH tagName="p"><![CDATA[1. 칸디다성 질염]]></PARAGRAPH><PARAGRAPH tagName="p"><![CDATA[2. 어루러기]]></PARAGRAPH></ARTICLE></SECTION></DOC>'),
   ud:parseDoc('<DOC><SECTION title=""><ARTICLE title="캡슐은 반드시 그대로 삼켜야 한다." /><ARTICLE title="1. 단기투여"><PARAGRAPH tagName="p"><![CDATA[1) 칸디다성 질염 : 1회 200 mg을 1일 2회 1일간 투여한다.]]></PARAGRAPH></ARTICLE></SECTION></DOC>'),
   nb:parseDoc('<DOC><SECTION title=""><ARTICLE title="1. 경고"><PARAGRAPH tagName="p"><![CDATA[울혈성심부전 환자에게 투여하지 않는다.]]></PARAGRAPH></ARTICLE><ARTICLE title="4. 이상반응"><PARAGRAPH tagName="table"><![CDATA[<table><tr><td>두통</td><td>1.6</td></tr></table>]]></PARAGRAPH></ARTICLE></SECTION></DOC>')}}};
test('A drug shows its 의약품안전나라 허가정보, said to be from there, and no HyperRx summary',()=>{
 const sel={kind:'node',name:'이트라코나졸',ids:['itra']},summary={documents:[],paragraphs:[{lang:'ko',sentences:[{text:'이트라코나졸은 강력한 항진균제이다.',sources:[],terms:[]}]}]};
 const html=nodeHTML(graph,sel,{drugs,label:LABEL,labelKey:'itra',entry:summary}),p=plain(html);
 assert.match(p,/사전 질문한 약 이트라코나졸 의약품안전나라 식품의약품안전처 허가정보 · 2026-11-10 조회 제품 선택 /);
 // 제품 선택: every product of the ingredient, in groups, the one shown selected; under it the product's code and link.
 assert.match(html,/<label class="xn-pselect"><span>제품 선택<\/span><select data-label-product data-label-key="itra" data-label-default="202105228"><optgroup label="사용 중 2개"><option value="202105228" selected>스포라녹스캡슐\(이트라코나졸\) · \(주\)한국얀센<\/option><option value="200003111">이트라정100밀리그램\(이트라코나졸\) · 한미약품\(주\)<\/option><\/optgroup><optgroup label="취하·유효기간만료 1개"><option value="199806500">스포라녹스액\(이트라코나졸\) · \(주\)한국얀센 · 취하<\/option><\/optgroup><\/select><\/label>/);
 assert.match(p,/스포라녹스액\(이트라코나졸\) · \(주\)한국얀센 · 취하 품목기준코드 202105228 의약품안전나라에서 보기 성분·함량/);
 assert.match(html,/<div class="xn-pmeta"><small><span class="xn-nw">품목기준코드 202105228<\/span><\/small><a class="xai-go"/); // the company is in the select already
 assert.match(html,/<a class="xai-go" href="https:\/\/nedrug\.mfds\.go\.kr\/pbp\/CCBBB01\/getItemDetail\?itemSeq=202105228" target="_blank" rel="noopener noreferrer">/);
 // The product's facts as one table under its name, then which product it is and the others.
 assert.match(p,/의약품안전나라에서 보기 성분·함량 이트라코나졸 100 밀리그램 · 1캡슐\(556 밀리그램\) 중 효능효과 칸디다성 질염 · 어루러기 구분 전문의약품 · ATC J02AC02 허가 2021-07-09 · 최종 변경 2026-04-16 사용 중인 제품 75개 중 허가사항이 가장 최근에 바뀐 제품을 먼저 보여 줍니다\./);
 assert.match(html,/<div class="xn-pcard">[\s\S]*<dl class="xn-facts"><dt>성분·함량<\/dt><dd>/);assert.doesNotMatch(html,/xn-tile/);
 assert.match(p,/효능효과 1\. 칸디다성 질염 2\. 어루러기 용법용량 캡슐은 반드시 그대로 삼켜야 한다\. 1\. 단기투여 1\) 칸디다성 질염 : 1회 200 mg을 1일 2회 1일간 투여한다\. 사용상의 주의사항 1\. 경고 울혈성심부전 환자에게 투여하지 않는다\. 4\. 이상반응 두통 1\.6 성상·보관 성상 파란색\/분홍색 캡슐/);
 assert.match(html,/<details class="xn-art" open><summary>1\. 경고<\/summary>/);assert.match(html,/<details class="xn-art"><summary>4\. 이상반응<\/summary>/);
 assert.match(p,/의약품안전나라\(식품의약품안전처\)에 실린 허가정보를 그대로 옮겼습니다/);
 // The HyperRx summary is not shown under the label (2026-11-10), nor numbered in the sources tab.
 assert.doesNotMatch(p,/HyperRx가 데이터베이스|이트라코나졸은 강력한 항진균제이다|한눈에 보기/);
 assert.deepEqual(labelItems(LABEL.product.docs.ee),['칸디다성 질염','어루러기']);
 assert.match(plain(nodeHTML(graph,sel,{drugs,label:{...LABEL,count:1}})),/사용 중인 제품은 이 제품 하나입니다\./);
 // A withdrawn product the reader picked says so next to its code.
 const gone=nodeHTML(graph,sel,{drugs,label:{...LABEL,chosen:true,product:{...LABEL.product,itemSeq:'199806500',name:'스포라녹스액(이트라코나졸)',status:'취하',endDate:'2025-08-18'}}});
 assert.match(gone,/품목기준코드 199806500<\/span> · <b class="xn-pstat">취하 2025-08-18<\/b>/);assert.match(gone,/<option value="199806500" selected>/);assert.match(plain(gone),/직접 고른 제품입니다\./);
 const tab=plain(nodeHTML(graph,sel,{drugs,label:LABEL,part:'sources'}));
 assert.match(tab,/의약품안전나라 허가정보 허가정보 스포라녹스캡슐\(이트라코나졸\) 의약품안전나라 · 식품의약품안전처 · \(주\)한국얀센 · 품목기준코드 202105228 의약품안전나라에서 보기/);
});
test('Without the label (loading, no key, not found) the HyperRx summary shows, with why and a search link',()=>{
 const sel={kind:'node',name:'로바스타틴',ids:['lova','LOVA']};
 assert.match(plain(nodeHTML(graph,sel,{drugs,label:{pending:true}})),/의약품안전나라 허가정보를 불러오는 중입니다… 어떤 약인가요/);
 const html=nodeHTML(graph,sel,{drugs,label:{error:true,message:'의약품안전나라 허가정보를 불러올 인증키(MFDS_API_KEY)가 설정되지 않았습니다.'}});
 assert.match(plain(html),/인증키\(MFDS_API_KEY\)가 설정되지 않았습니다\. 아래는 HyperRx 요약입니다\. 의약품안전나라에서 찾아보기 어떤 약인가요/);
 assert.match(html,/href="https:\/\/nedrug\.mfds\.go\.kr\/searchDrug\?searchYn=true&amp;itemName=%EB%A1%9C%EB%B0%94%EC%8A%A4%ED%83%80%ED%8B%B4"/);
 assert.doesNotMatch(nodeHTML(graph,{kind:'node',id:'rhab',ids:['rhab']},{drugs}),/의약품안전나라 허가정보/);
 // A link that is not to 의약품안전나라 is not drawn.
 const odd={...LABEL,product:{...LABEL.product,url:'javascript:alert(1)'}};assert.doesNotMatch(nodeHTML(graph,{kind:'node',name:'이트라코나졸',ids:['itra']},{drugs,label:odd}),/javascript:/);
});
