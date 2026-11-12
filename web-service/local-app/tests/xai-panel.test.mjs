import test from 'node:test';
import assert from 'node:assert/strict';
import {xaiTarget,xaiNeeds,xaiHTML,durTitle,relationSourcesHTML,changesIn} from '../src/xai-panel.js';

// A relation between 심바스타틴 and 클래리트로마이신 (asked with 암로디핀), its DUR records, and the rule lookup's sentences
// from a single-ingredient simvastatin label and from a combination product.
const nodes=[{id:'simva',label:'심바스타틴'},{id:'clari',label:'클래리트로마이신'},{id:'amlo',label:'암로디핀'},{id:'myo',label:'근육병증'}];
const drugs=[{name:'심바스타틴',ids:new Set(['simva'])},{name:'암로디핀',ids:new Set(['amlo'])},{name:'클래리트로마이신',ids:new Set(['clari'])}];
const dur=(id,excerpt,date)=>({id,title:'클래리트로마이신 — 병용금기',sourceShort:'DUR 성분정보',category:'병용금기',excerpt,origin:{rows:[['고시일자',date,'']]}});
const docs=[
 dur('d-combo','[병용금기] 심바스타틴(Simvastatin)(복합제; 복합 구성 성분: [D000152]Amlodipine (암로디핀))과(와) 클래리트로마이신(Clarithromycin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 횡문근융해증 보고','2023-12-20'),
 dur('d-direct','[병용금기] 심바스타틴(Simvastatin)(단일제)과(와) 클래리트로마이신(Clarithromycin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 근병증, 횡문근융해의 위험증가','2009-03-03'),
];
const edge={id:'e1',label:'병용 금기 · 근육병증 위험',members:['simva','clari','myo'],sourceIds:['d-combo','d-direct'],description:'근육병증'};
const graph={nodes,hyperedges:[edge],evidenceDocuments:docs};
const L1='2. 다음 환자에는 투여하지 말 것\n4) 강력한 CYP3A4 억제제를 투여중인 환자(예. 이트라코나졸, 클라리트로마이신)\n3. 다음 환자에는 신중히 투여할 것\n1) 알코올 중독자, 간장애 또는 그 병력이 있는 환자\n2) 신장애 또는 그 병력이 있는 환자(횡문근융해의 보고 사례 대부분이 신기능 장애를 갖는 환자이며, 급격한 신기능 악화가 인정되었다.)\n4. 이상반응\n당뇨병 : 위험요인의 존재여부에 따라 빈도가 달라질 것이다.';
const L2='5. 일반적 주의\n강력한 CYP3A4 억제제 : 클라리트로마이신과 병용투여하지 않는다. 만일 강력한 CYP3A4 억제제의 단기 투여가 불가피하다면 그 투여기간 동안 일시적으로 이 약의 투여를 중지한다. 근육병증을 유발하는 요소로는 65세 이상의 고령자, 여성, 신기능 손상 등이 있다. 근육병증 발병률은 1일 80 mg 환자군에서 약 0.9 %였다. 이런 증상이 나타나고 크레아틴키나아제가 정상상한치의 10배 이상이면 근육병증을 의미한다. 근육병증의 위험성을 알려야 하며, 설명되지 않는 근육통, 압통이 생기면 즉시 의사에게 알리도록 해야 한다. 이 약의 용량은 암로디핀을 병용투여하고 있는 환자에서 1일 20 mg을 초과해서는 안 된다.';
const L3='6. 상호작용\n이 약의 주성분인 심바스타틴은 CYP3A4에 의해 대사된다. 아래의 강력한 CYP3A4 억제제는 이 약의 배설을 감소시킴으로써 근육병증의 위험성을 증가시킨다.';
const at=(text,s)=>({start:text.indexOf(s),end:text.indexOf(s)+s.length});
const mention=(chunk_id,text,s,{section,about='심바스타틴',names='클래리트로마이신',action=false,single=true,enzymes=[],item='심바로드정20밀리그램(심바스타틴)'})=>({chunk_id,item,section,about,names,text:s,...at(text,s),action,single,enzymes});
const m1=mention('L1',L1,'4) 강력한 CYP3A4 억제제를 투여중인 환자(예. 이트라코나졸, 클라리트로마이신)',{section:'2. 다음 환자에는 투여하지 말 것',enzymes:['CYP3A4']});
const m2=mention('L2',L2,'강력한 CYP3A4 억제제 : 클라리트로마이신과 병용투여하지 않는다.',{section:'5. 일반적 주의',action:true});
const m3=mention('L3',L3,'아래의 강력한 CYP3A4 억제제는 이 약의 배설을 감소시킴으로써 근육병증의 위험성을 증가시킨다.',{section:'6. 상호작용'});
const combo=mention('C1','만일 클라리스로마이신 투여가 불가피하다면 이 약의 투여를 중지해야 한다.','만일 클라리스로마이신 투여가 불가피하다면 이 약의 투여를 중지해야 한다.',{section:'1. 경고',about:'암로디핀',action:true,single:false,item:'코아틴정20/5'});
const dose=mention('L2',L2,'이 약의 용량은 암로디핀을 병용투여하고 있는 환자에서 1일 20 mg을 초과해서는 안 된다.',{section:'5. 일반적 주의',names:'암로디핀',action:true});
const clinical={drugs:[{name:'심바스타틴'},{name:'암로디핀'},{name:'클래리트로마이신'}],pairs:[
 {a:0,b:2,dur:{listed:true,reasons:['근병증, 횡문근융해의 위험증가']},label:{mentions:[m1,m2,m3]}},
 {a:1,b:2,dur:{listed:false},label:{mentions:[combo]}},
 {a:0,b:1,dur:{listed:false},label:{mentions:[dose]}},
]};
const texts=new Map([['L1',{content:L1,title:'심바로드정20밀리그램(심바스타틴) — 사용상의 주의사항',origin:{rows:[['최근 변경','2024-04-16','']]}}],['L2',{content:L2}],['L3',{content:L3}]]);
const plain=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

test('New layout applies to every relation with an asked drug, says whether official records speak, and names its scope',()=>{
 const t=xaiTarget(edge,graph,drugs,clinical);
 assert.deepEqual(t.hits,['심바스타틴','클래리트로마이신']);assert.equal(t.primary,'심바로드정20밀리그램(심바스타틴)');
 assert.deepEqual(xaiNeeds(t),['L1','L2','L3']);
 assert.equal(t.official,true);
 // 2026-11-09: one asked drug, or no official record, still gets the layout (it used to fall back to the previous one).
 assert.deepEqual(xaiTarget({...edge,members:['simva','myo']},graph,drugs,clinical).hits,['심바스타틴']);
 assert.equal(xaiTarget({...edge,sourceIds:[]},graph,drugs,{...clinical,pairs:[{a:0,b:2,dur:{listed:false},label:{mentions:[{...m1,single:false}]}}]}).official,false); // no DUR row, combination labels only
 assert.equal(xaiTarget({...edge,members:['myo']},graph,drugs,clinical),null); // no asked drug
 const html=xaiHTML(edge,graph,{drugs,clinical,texts,question:'심바스타틴과 암로디핀을 복용 중인 환자에게 클래리트로마이신을 추가해도 되나요?'});
 assert.match(html,/질문한 3개 약 중 2개/);assert.match(html,/<h3>심바스타틴 \+ 클래리트로마이신<\/h3>/);
 assert.match(plain(html),/금기·주의 내용: 근병증, 횡문근융해의 위험증가/); // the record with two single-ingredient sides, not the combination one
});
test('What the records say: DUR first, then the label contraindication, then its instruction with the follow-up sentence',()=>{
 const html=xaiHTML(edge,graph,{drugs,clinical,texts}),p=plain(html),i=s=>p.indexOf(s);
 assert.ok(i('함께 쓰지 않습니다')<i('4) 강력한 CYP3A4 억제제를 투여중인 환자')&&i('4) 강력한 CYP3A4 억제제를 투여중인 환자')<i('병용투여하지 않는다')&&i('병용투여하지 않는다')<i('불가피하다면'));
 assert.match(p,/같은 분류 기록 1건 더 \(근거 1\)/); // the combination record keeps its own number
 assert.doesNotMatch(p,/코아틴정|클라리스로마이신 투여가 불가피/); // a combination product's sentence is never used
 // A chip carries the literal sentence it backs, so the record opens with it marked.
 assert.match(html,/data-open-document="L2" data-marks="\[&quot;만일 강력한 CYP3A4 억제제의 단기 투여가 불가피하다면 그 투여기간 동안 일시적으로 이 약의 투여를 중지한다.&quot;\]"/);
});
test('Mechanism steps come from one label document; without its effect sentence the part says it found none',()=>{
 const p=plain(xaiHTML(edge,graph,{drugs,clinical,texts}));
 for(const s of ['클래리트로마이신 강력한 CYP3A4 억제제','심바스타틴은 CYP3A4에 의해 대사','배설 감소','근육병증 위험 증가'])assert.ok(p.includes(s),s);
 assert.doesNotMatch(p,/모든 단계가 같은/); // removed from the key point (2026-11-09)
 const noEffect=new Map([...texts].map(([k,v])=>[k,k==='L3'?{content:'6. 상호작용\n이 약은 CYP3A4에 의해 대사된다.'}:v]));
 // The heading stays, with a line that nothing was found and no step cards (2026-11-10: the part was left out).
 const none=xaiHTML(edge,graph,{drugs,clinical,texts:noEffect});
 assert.match(none,/상호작용 기전<\/h4><p class="hint xai-none">이 관계의 원문에서 상호작용 기전을 설명하는 문장을 찾지 못했습니다\. 찾지 못했다고 안전하다는 뜻은 아닙니다\.<\/p>/);
 assert.doesNotMatch(none,/class="xai-step/);
 assert.match(xaiHTML(edge,graph,{drugs,clinical,texts:new Map(),loading:true}),/의약품 제품 허가정보 원문을 읽는 중입니다/);
});
test('Layout: a tinted card, a one-line summary from the record class over numbered quotes, step cards that open their record',()=>{
 const html=xaiHTML(edge,graph,{drugs,clinical,texts}),p=plain(html);
 assert.match(html,/<header class="xai-card">/);
 // The summary line repeats the DUR class's own words and says where it comes from; the quotes follow in an ordered list.
 assert.match(p,/HyperRx의 판단 두 약을 함께 쓰지 않습니다\. 의약품안전사용서비스\(DUR\) 병용금기 기록의 문장/);assert.doesNotMatch(p,/원문이 말하는 판단/);assert.equal((html.match(/<li><div class="xai-said">/g)||[]).length,4);
 assert.match(html,/<h4><svg[^>]*>.*?<\/svg>상호작용 기전<\/h4>/);assert.doesNotMatch(html,/원문에 적힌 상호작용 기전/);
 // Steps carry no 근거 button: the card itself opens its record with the step's sentence marked.
 const flow=html.match(/<div class="xai-flow">(.*?)<\/div><aside/)[1];
 assert.doesNotMatch(flow,/class="xp-cite"|class="xai-go"/);
 assert.equal((flow.match(/<button type="button" class="xai-step s\d[^"]*" data-open-document="L[13]" data-marks=/g)||[]).length,4);
 // The key point is the label's own sentence.
 assert.match(p,/핵심 포인트 “아래의 강력한 CYP3A4 억제제는 이 약의 배설을 감소시킴으로써 근육병증의 위험성을 증가시킨다.”/);
 // Icons are the downloaded Tabler line icons; no emoji anywhere.
 assert.match(html,/M10\.363 3\.591l-8\.106 13\.534/);assert.doesNotMatch(html,/\p{Extended_Pictographic}/u);
 // A label-only pair gets the label's wording instead of the DUR line.
 const label=xaiHTML({...edge,sourceIds:[]},graph,{drugs,clinical:{...clinical,pairs:[{...clinical.pairs[0],dur:{listed:false}},...clinical.pairs.slice(1)]},texts});
 assert.match(plain(label),/의약품 제품 허가정보가 함께 투여하지 말 것으로 적고 있습니다/);
});
test('Patient checks: label lines on the harm, with whether the question gives them; no statistics, no other topics',()=>{
 const p=plain(xaiHTML(edge,graph,{drugs,clinical,texts,question:'심바스타틴과 암로디핀을 복용 중인 78세 환자에게 클래리트로마이신을 추가해도 되나요?'}));
 assert.match(p,/심바스타틴 용량 질문: 암로디핀 복용 중 용량은 질문에 없음 “이 약의 용량은 암로디핀을 병용투여하고 있는 환자에서 1일 20 mg을 초과해서는 안 된다.” 근거 \d+/);
 assert.match(p,/위험 요인 질문: 78세 “근육병증을 유발하는 요소로는 65세 이상의 고령자, 여성, 신기능 손상 등이 있다.” 근거 \d+/);
 // The question's facts sit under their item only when the question gives them; the last column is the source button.
 assert.match(p,/확인할 것 원문 근거/);assert.doesNotMatch(p,/이 질문에서/);assert.equal((p.match(/질문: /g)||[]).length,2); // 암로디핀 복용 중, 78세
 assert.match(p,/신중 투여 대상 “2\) 신장애 또는 그 병력이 있는 환자” 근거/); // only the item naming the harm, its bracket left out
 assert.match(p,/검사 수치 “이런 증상이 나타나고 크레아틴키나아제가 정상상한치의 10배 이상이면 근육병증을 의미한다.”/);
 assert.match(p,/알려야 할 증상 “근육병증의 위험성을 알려야 하며, 설명되지 않는 근육통, 압통이 생기면 즉시 의사에게 알리도록 해야 한다.”/);
 assert.doesNotMatch(p,/0\.9 %|당뇨병 : 위험요인/);
});
test('Sources list the relation records, then the label records with the sections quoted and their dates',()=>{
 const html=xaiHTML(edge,graph,{drugs,clinical,texts}),p=plain(html);
 assert.match(p,/근거 및 출처 5건/);assert.ok(p.indexOf('이 관계의 기록')<p.indexOf('같은 약 쌍의 의약품 제품 허가정보'));
 assert.match(p,/근거 2 심바스타틴 단일제 \+ 클래리트로마이신 의약품안전사용서비스\(DUR\) 병용금기 · 2009-03-03 고시/);
 assert.match(p,/심바로드정20밀리그램\(심바스타틴\) — 사용상의 주의사항 2\. 다음 환자에는 투여하지 말 것 · 3\. 다음 환자에는 신중히 투여할 것 · 허가정보 최근 변경 2024-04-16/);
 assert.match(p,/기록이 없다는 것은 안전하다는 뜻이 아닙니다/);assert.doesNotMatch(p,/원문을 옮겨 정리한 화면입니다/); // the ⓘ guide keeps it; the footer line is gone
 assert.equal(durTitle(docs[0].excerpt),'심바스타틴 복합제(암로디핀) + 클래리트로마이신');
});
test('The judgment line takes the warning level of its class, and the sources move to their own tab',()=>{
 assert.match(xaiHTML(edge,graph,{drugs,clinical,texts}),/<p class="xai-summary contra">/); // DUR 병용금기
 const cautionOnly={...clinical,pairs:[{a:0,b:2,dur:{listed:false},label:{mentions:[m2]}},...clinical.pairs.slice(1)]};
 const caution=xaiHTML({...edge,sourceIds:[]},graph,{drugs,clinical:cautionOnly,texts});
 assert.match(caution,/<p class="xai-summary caution">/);assert.match(plain(caution),/의약품 제품 허가정보에 함께 쓸 때의 주의가 적혀 있습니다/);
 // 'main' leaves the record list out; 'sources' is the list alone, numbered as the explanation's chips.
 const main=xaiHTML(edge,graph,{drugs,clinical,texts,part:'main'}),list=xaiHTML(edge,graph,{drugs,clinical,texts,part:'sources'});
 assert.doesNotMatch(main,/class="xs-row"|근거 및 출처/);assert.match(main,/HyperRx의 판단/);
 assert.equal((list.match(/class="xs-row"/g)||[]).length,5);assert.doesNotMatch(list,/HyperRx의 판단/);
 assert.match(plain(list),/심바스타틴 \+ 클래리트로마이신 관계의 근거 5건입니다/);
 // A relation in the previous layout lists its own records.
 const old=relationSourcesHTML(edge,graph);
 assert.equal((old.match(/class="xs-row"/g)||[]).length,2);assert.match(plain(old),/근거 1 심바스타틴 복합제\(암로디핀\) \+ 클래리트로마이신/);
});
test('With nothing to quote the layout says no official record speaks, never that the drugs go together; untrusted text is escaped',()=>{
 const bare={...edge,sourceIds:[]},onlyCombo={...clinical,pairs:[{a:0,b:2,dur:{listed:false},label:{mentions:[{...m3,action:false,enzymes:[]}]}}]};
 // A single-ingredient label sentence that is no instruction is quoted, and the line on top says it is not one.
 const info=plain(xaiHTML(bare,graph,{drugs,clinical:onlyCombo,texts:new Map()}));
 assert.match(info,/의약품 제품 허가정보에 함께 쓸 때의 내용이 적혀 있습니다\. 지시하는 문장은 아닙니다/);assert.match(info,/“아래의 강력한 CYP3A4 억제제는/);
 // Nothing at all to quote: no official record speaks, which is not called safe.
 const none=plain(xaiHTML(bare,graph,{drugs,clinical:{...clinical,pairs:[{a:0,b:2,dur:{listed:false},label:{mentions:[]}}]},texts:new Map()}));
 assert.match(none,/HyperRx의 판단 공식 기록에는 이 약들을 함께 쓸 때의 지시가 없습니다\. 기록이 없다는 것은 안전하다는 뜻이 아닙니다\./);
 for(const p of [info,none])assert.doesNotMatch(p,/두 약을 함께 쓰지 않습니다|주의가 적혀 있습니다/);
 const evil={...graph,evidenceDocuments:[dur('d-direct','[병용금기] <img src=x>심바스타틴(S)(단일제)과(와) 클래리트로마이신(C)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: <b>x</b>','2009')]};
 const html=xaiHTML({...edge,sourceIds:['d-direct']},evil,{drugs,clinical,texts});
 assert.doesNotMatch(html,/<img|<b>x/);assert.match(html,/&lt;b&gt;x/);
});
// 2026-11-09, a new question (클로피도그렐 + 오메프라졸): the rule lookup gave a measurement before the instruction of the
// same section, and the mechanism rules knew only rising levels, so the panel quoted the measurement and left the
// mechanism and patient parts empty. The label text is cut down from 피도글정75밀리그램's record.
test('Changes read in the direction each sentence gives, in the order excretion, concentration, exposure',()=>{
 assert.deepEqual(changesIn('아래의 강력한 CYP3A4 억제제는 이 약의 배설을 감소시킴으로써 근육병증의 위험성을 증가시킨다.'),['배설 감소']);
 assert.deepEqual(changesIn('CYP2C19의 활성을 저해하는 약물과 병용 투여할 경우 이 약의 활성 대사체의 약물 농도가 낮아질 수 있다.'),['활성 대사체 농도 감소']);
 assert.deepEqual(changesIn('강력한 억제제는 혈장 농도를 증가시키고 배설을 감소시킨다.'),['배설 감소','혈장 농도 증가']);
 assert.deepEqual(changesIn('병용 시 이 약의 AUC가 증가하였다.'),['노출 증가']);
});
test('A drug made active by the enzyme: the instruction is quoted, the mechanism runs downward, the genetic factor is listed',()=>{
 const P='5. 일반적 주의\n클로피도그렐 혈소판 응집 억제는 클로피도그렐의 활성대사체로 인한 것이므로 CYP2C19에서 유전적 변이 또는 CYP2C19를 간섭하는 약물과의 병용에 의해 클로피도그렐의 활성 대사체로의 대사가 장애될 수 있다.\n6. 상호작용\n(1) 이 약은 부분적으로 CYP2C19를 통해 활성 대사체로 대사되므로, CYP2C19의 활성을 저해하는 약물과 병용 투여할 경우 이 약의 활성 대사체의 약물 농도가 낮아질 수 있다. 이 약을 CYP2C19 저해제와 병용하는 것은 권장되지 않는다(CYP2C19 저해제 예, 오메프라졸, 에스오메프라졸). (2) 오메프라졸 1일 1회 80 mg을 동시 또는 12시간 간격으로 이 약과 투여하였을 때 활성 대사체 45 %(부하용량) 그리고 40 %(유지용량)의 노출이 감소되었다. 이러한 감소는 혈소판 응집 억제의 39 %(부하용량) 및 21 %(유지용량) 감소와 연관되었다.';
 const opt={section:'6. 상호작용',about:'클로피도그렐',names:'오메프라졸',action:true,item:'피도글정75밀리그램(클로피도그렐)'};
 const measured=mention('P',P,'(2) 오메프라졸 1일 1회 80 mg을 동시 또는 12시간 간격으로 이 약과 투여하였을 때 활성 대사체 45 %(부하용량) 그리고 40 %(유지용량)의 노출이 감소되었다.',opt);
 const told=mention('P',P,'이 약을 CYP2C19 저해제와 병용하는 것은 권장되지 않는다(CYP2C19 저해제 예, 오메프라졸, 에스오메프라졸).',{...opt,enzymes:['CYP2C19']});
 const g={nodes:[{id:'clopi',label:'클로피도그렐'},{id:'ome',label:'오메프라졸'}],hyperedges:[{id:'r',label:'약물 상호작용',members:['clopi','ome'],sourceIds:['doc']}],evidenceDocuments:[{id:'doc',title:'피도글정 — 사용상의 주의사항',sourceShort:'의약품 제품 허가정보',excerpt:'오메프라졸'}]};
 const ds=[{name:'클로피도그렐',ids:new Set(['clopi'])},{name:'오메프라졸',ids:new Set(['ome'])}];
 const c={drugs:[{name:'클로피도그렐'},{name:'오메프라졸'}],pairs:[{a:0,b:1,dur:{listed:false},label:{mentions:[measured,told]}}]};
 const p=plain(xaiHTML(g.hyperedges[0],g,{drugs:ds,clinical:c,texts:new Map([['P',{content:P}]]),question:'클로피도그렐과 오메프라졸을 함께 복용해도 되나요?'}));
 // The instruction, not the measurement listed before it in the same section.
 assert.match(p,/“이 약을 CYP2C19 저해제와 병용하는 것은 권장되지 않는다/);assert.doesNotMatch(p,/“\(2\) 오메프라졸 1일 1회 80 mg/);
 // The steps, each from the same label, with the fall and what weakens; never a rise the sentence does not state.
 for(const s of ['오메프라졸 CYP2C19 저해제','클로피도그렐은 CYP2C19에 의해 활성 대사체로 대사','활성 대사체 농도 감소','혈소판 응집 억제 감소'])assert.ok(p.includes(s),s);
 assert.doesNotMatch(p,/노출 증가|농도 증가/);
 assert.match(p,/핵심 포인트 “\(1\) 이 약은 부분적으로 CYP2C19를 통해 활성 대사체로 대사되므로/);
 assert.match(p,/유전적 요인 .*CYP2C19에서 유전적 변이/);
});
// 2026-11-09, the saved 텔미사르탄 + 히드로클로로티아지드 + 이부프로펜 answer: the relations it cited have no DUR record and
// only combination-product labels, so the panel fell back to the previous layout although the label says to be careful.
test('Without an official record the relation’s own label speaks: its instruction above, its effects as the mechanism, its patients and checks below',()=>{
 const X='[트윈스타정40/5밀리그램 | 주성분: 텔미사르탄 40.000 밀리그램; 암로디핀베실산염 6.935 밀리그램 | 전문의약품]\n사용상의 주의사항\n④ 와파린: 이 약은 와파린의 최저 혈장농도를 감소시켰다.\n⑤ 비스테로이드성 소염진통제 (예, 항염증요법으로서 아스피린, COX-2 저해제 및 비스테로이드성 소염진통제)는 안지오텐신 II 수용체 길항제의 혈압강하효과를 감소시킬 수 있다. 신기능이 손상된 일부 환자(예 : 탈수환자, 신기능이 손상된 노인 환자)에서 신기능 손상 악화가 보고되었다. 따라서 주의하여 병용투여하며, 특히 노인 환자의 경우 더 많은 주의를 기울여야 한다. 비스테로이드성 소염진통제와 이 약을 병용 투여받는 환자들에게는 충분한 수분을 공급해 주어야하며 병용치료 시작 후 주기적으로 신기능을\n모니터링 해야 한다.\n⑥ 기타 약물: 텔미사르탄을 아세트아미노펜, 암로디핀, 히드로클로로티아지드 및 이부프로펜과 병용투여하였을 때 임상적으로 유의한 상호 작용은 없었다.';
 const g={nodes:[{id:'tel',label:'텔미사르탄'},{id:'ibu',label:'이부프로펜'},{id:'old',label:'고령자'}],hyperedges:[{id:'r',label:'drug interaction · special populations',members:['tel','ibu','old'],sourceIds:['tw']}],
  evidenceDocuments:[{id:'tw',title:'트윈스타정40/5밀리그램 — 사용상의 주의사항',sourceShort:'의약품 제품 허가정보',excerpt:X}]};
 const ds=[{name:'텔미사르탄',ids:new Set(['tel'])},{name:'히드로클로로티아지드',ids:new Set(['hct'])},{name:'이부프로펜',ids:new Set(['ibu'])}];
 const cited=[{id:'tw',sentences:{'5':'⑤ 비스테로이드성 소염진통제 (예, 항염증요법으로서 아스피린, COX-2 저해제 및 비스테로이드성 소염진통제)는 안지오텐신 II 수용체 길항제의 혈압강하효과를 감소시킬 수 있다.'}}];
 const c={drugs:[{name:'텔미사르탄'},{name:'히드로클로로티아지드'},{name:'이부프로펜'}],pairs:[{a:0,b:2,dur:{listed:false},label:{mentions:[]}}]};
 const html=xaiHTML(g.hyperedges[0],g,{drugs:ds,clinical:c,texts:new Map(),citations:cited,question:'텔미사르탄과 히드로클로로티아지드를 복용 중인 환자에게 이부프로펜을 추가해도 되나요?'}),p=plain(html);
 assert.match(p,/질문한 3개 약 중 2개/);assert.match(p,/의약품 제품 허가정보\(복합제\) 텔미사르탄 \+ 이부프로펜 함께 든 항목: 고령자/);
 assert.match(p,/의약품 제품 허가정보에 함께 쓸 때의 주의가 적혀 있습니다\. 의약품 제품 허가정보\(복합제\) · 트윈스타정40\/5밀리그램 · 사용상의 주의사항의 문장 · 의약품안전사용서비스\(DUR\) 병용금기에는 없습니다/);
 // The judgment keeps the instruction and the two-drug sentence; the effect and check sentences moved to their parts.
 const judged=plain(html.slice(html.indexOf('HyperRx의 판단'),html.indexOf('상호작용 기전</h4>'))),said=[...judged.matchAll(/“([^”]+)”/g)].map(m=>m[1]);
 assert.equal(said.length,2);assert.ok(said[0].startsWith('따라서 주의하여 병용투여하며'));assert.ok(said[1].startsWith('⑥ 기타 약물: 텔미사르탄을'));
 // The mechanism: the drug the label names by its class, then the label's effect sentences, the harm last; one record only.
 const mech=plain(html.slice(html.indexOf('상호작용 기전</h4>'),html.indexOf('환자별 확인 사항</h4>')));
 assert.match(mech,/이부프로펜 원문 표현: 비스테로이드성 소염진통제/);assert.match(mech,/안지오텐신 II 수용체 길항제의 혈압강하효과를 감소시킬 수 있다/);assert.match(mech,/신기능 손상 악화가 보고되었다/);
 assert.match(html,/class="xai-step s3 end"/);assert.match(mech,/핵심 포인트 “⑤ 비스테로이드성 소염진통제/);assert.match(mech,/의약품 제품 허가정보\(복합제\) · 트윈스타정40\/5밀리그램 · 근거 1/);
 // The patients: at risk and what to check (the question gives neither, so no tag), the sentence joined across its line break.
 const pat=plain(html.slice(html.indexOf('환자별 확인 사항</h4>')));
 assert.match(pat,/위험 요인 “신기능이 손상된 일부 환자\(예 : 탈수환자, 신기능이 손상된 노인 환자\)에서 신기능 손상 악화가 보고되었다\.”/);
 assert.match(pat,/확인·검사 “비스테로이드성 소염진통제와 이 약을 병용 투여받는 환자들에게는 충분한 수분을 공급해 주어야하며 병용치료 시작 후 주기적으로 신기능을 모니터링 해야 한다\.”/);
 assert.doesNotMatch(pat,/xai-given|질문:/);
 assert.doesNotMatch(p,/와파린의 최저|두 약을 함께 쓰지 않습니다/); // another item; no 금기 line
});
test('A DUR record of another kind on a two-drug relation is named as what it is, not as a 병용금기',()=>{
 const g={...graph,hyperedges:[{...edge,sourceIds:['preg']}],evidenceDocuments:[{id:'preg',title:'심바스타틴 — 임부금기',sourceShort:'DUR 성분정보',category:'임부금기',excerpt:'[임부금기] 대상 성분은 심바스타틴(Simvastatin)입니다. 금기·주의 내용: 임부에 대한 안전성 미확립.'}]};
 const p=plain(xaiHTML(g.hyperedges[0],g,{drugs,clinical:{...clinical,pairs:[{a:0,b:2,dur:{listed:false},label:{mentions:[]}}]},texts:new Map()}));
 assert.match(p,/의약품안전사용서비스\(DUR\) 임부금기 기록이 있습니다\. 질문한 약을 함께 쓸 때의 병용금기 기록은 아닙니다/);
 assert.doesNotMatch(p,/두 약을 함께 쓰지 않습니다/);
 assert.match(p,/“\[임부금기\] 대상 성분은 심바스타틴\(Simvastatin\)입니다\.”/);assert.match(p,/“금기·주의 내용: 임부에 대한 안전성 미확립\.”/);
});
// 2026-11-09, the saved 심바스타틴 3제 answer: a cited 암로디핀 + 클래리트로마이신 relation rests on the opening of a label
// that never names 클래리트로마이신, and the rule lookup found the pair only in combination products' labels.
test('With nothing in its own excerpt, a relation quotes combination labels that name both drugs, never one that says only "이 약"',()=>{
 const g={nodes:[{id:'amlo',label:'암로디핀'},{id:'clari',label:'클래리트로마이신'}],hyperedges:[{id:'r',label:'약물 상호작용 · 주의',members:['amlo','clari'],sourceIds:['od']}],
  evidenceDocuments:[{id:'od',title:'오로디핀정(암로디핀오로트산염) — 사용상의 주의사항',sourceShort:'의약품 제품 허가정보',excerpt:'[오로디핀정 | 주성분: 암로디핀오로트산염 6.91 밀리그램]\n사용상의 주의사항\n1. 다음 환자에게는 투여하지 말 것\n1) 이 약에 과민증의 병력이 있는 환자\n2) 수유부'}]};
 const ds=[{name:'심바스타틴',ids:new Set(['simva'])},{name:'암로디핀',ids:new Set(['amlo'])},{name:'클래리트로마이신',ids:new Set(['clari'])}];
 const combo=(chunk_id,item,text,action)=>({chunk_id,item,section:'6. 상호작용',text,action,single:false,enzymes:[]});
 const c={drugs:[{name:'심바스타틴'},{name:'암로디핀'},{name:'클래리트로마이신'}],pairs:[{a:1,b:2,dur:{listed:false},label:{mentions:[
  combo('ol','올핀정5mg/20mg','이 약과 클래리트로마이신을 병용투여시 환자를 주의깊게 관찰하는 것이 권장된다.',true),
  combo('bd','발디핀플러스정5/80/12.5밀리그램','클래리트로마이신을 암로디핀과 병용투여시 저혈압의 위험이 증가하였다.',false),
  combo('bd','발디핀플러스정5/80/12.5밀리그램','암로디핀과 클래리트로마이신을 병용투여시 환자를 주의깊게 관찰하는 것이 권장된다.',true)]}}]};
 const p=plain(xaiHTML(g.hyperedges[0],g,{drugs:ds,clinical:c,texts:new Map()}));
 assert.match(p,/의약품 제품 허가정보에 함께 쓸 때의 주의가 적혀 있습니다\. 의약품 제품 허가정보\(복합제\) · 발디핀플러스정5\/80\/12\.5밀리그램 · 6\. 상호작용의 문장/);
 const said=[...p.matchAll(/“([^”]+)”/g)].map(m=>m[1]);
 assert.deepEqual(said,['암로디핀과 클래리트로마이신을 병용투여시 환자를 주의깊게 관찰하는 것이 권장된다.','클래리트로마이신을 암로디핀과 병용투여시 저혈압의 위험이 증가하였다.']);
 assert.doesNotMatch(p,/이 약과 클래리트로마이신/);
});
// 2026-11-10, the saved 텔미사르탄 + 히드로클로로티아지드 + 이부프로펜 answer: a relation whose own record is a 텔미사르탄 label
// with three interaction items (칼륨보전이뇨제, 부신피질호르몬, 이뇨제) stopped at its judgment, as no sentence named both asked
// drugs and the part with nothing found was left out.
test('An asked drug’s own label counts as naming it: the mechanism from the one item on both drugs, a check from the record, items named',()=>{
 const X='[프리텐션정40밀리그램(텔미사르탄) | 주성분: 텔미사르탄파우더(23.9%) 40.00 밀리그램 | 전문의약품]\n사용상의 주의사항\n10) 칼륨보전이뇨제 또는 칼륨보충제 : 텔미사르탄과 같은 안지오텐신Ⅱ수용체 길항제는 칼륨 소실로 인한 이뇨 효과를 약화시킨다. 칼륨보전이뇨제(스피로노락톤, 에플레레논, 트리암테렌 또는 아밀로리드), 칼륨보급제 또는 칼륨이 함유된 염 대용제는 혈청 칼륨 농도를 증가시킬 수 있다. 저칼륨혈증으로 인하여 이 약을 병용투여하는 경우 혈청 칼륨 농도에 대해 빈번한 모니터링하면서 주의하여 투여한다. 일반적으로 병용투여는 권장되지 않는다.\n11) 부신피질호르몬(코르티코스테로이드, 전신 투여) : 이 약과 병용투여시 혈압강하효과가 감소될 수 있다.\n12) 이뇨제(티아지드 또는 루프이뇨제) : 이 약으로 치료 시작 전에, 루프이뇨제(푸로세미드) 그리고 티아지드이뇨제(히드로클로로티아지드)와 같은 이뇨제의 고용량 사용은 체액고갈, 저혈압의 위험성을 증가시킬 수 있다.';
 const ids=['tel','hct','sp','ep','cs','fu'],label={tel:'텔미사르탄',hct:'히드로클로로티아지드',sp:'스피로노락톤',ep:'에플레레논',cs:'코르티코스테로이드',fu:'푸로세미드'};
 const g={nodes:ids.map(id=>({id,label:label[id]})),hyperedges:[{id:'k',label:'다약물 상호작용 · 칼륨 조절 · 환자군 주의',members:ids,sourceIds:['pt']}],
  evidenceDocuments:[{id:'pt',title:'프리텐션정40밀리그램(텔미사르탄) — 사용상의 주의사항',sourceShort:'의약품 제품 허가정보',excerpt:X}]};
 const ds=[{name:'텔미사르탄',ids:new Set(['tel'])},{name:'히드로클로로티아지드',ids:new Set(['hct'])},{name:'이부프로펜',ids:new Set(['ibu'])}];
 const mono='이 약은 히드로클로로티아지드 등의 티아지드계 이뇨제와 병용투여시 추가적인 혈압강하 효과를 나타낸다.';
 const c={drugs:[{name:'텔미사르탄'},{name:'히드로클로로티아지드'},{name:'이부프로펜'}],pairs:[{a:0,b:1,dur:{listed:false},label:{mentions:[{chunk_id:'mc',item:'미카르디스정40밀리그램(텔미사르탄)',section:'',about:'텔미사르탄',names:'히드로클로로티아지드',text:mono,start:0,end:mono.length,action:false,single:true,enzymes:[]}]}}]};
 const html=xaiHTML(g.hyperedges[0],g,{drugs:ds,clinical:c,texts:new Map([['mc',{content:mono}]]),question:'텔미사르탄과 히드로클로로티아지드를 복용 중인 환자에게 이부프로펜을 추가해도 되나요?'}),p=plain(html);
 const part=(a,b)=>plain(html.slice(html.indexOf(a+'</h4>'),b?html.indexOf(b+'</h4>'):undefined));
 // The mechanism: item 12 only, the one on both asked drugs, its harm last; nothing chained from items 10 or 11.
 const mech=part('상호작용 기전','환자별 확인 사항');
 assert.match(mech,/히드로클로로티아지드 원문 표현: 이뇨제/);assert.match(mech,/체액고갈, 저혈압의 위험성을 증가시킬 수 있다/);assert.match(html,/class="xai-step s2 end"/);
 assert.doesNotMatch(mech,/칼륨|부신피질호르몬/);
 // The patients: what to check, from the same record.
 assert.match(part('환자별 확인 사항'),/확인·검사 “저칼륨혈증으로 인하여 이 약을 병용투여하는 경우 혈청 칼륨 농도에 대해 빈번한 모니터링하면서 주의하여 투여한다\.”/);
 // The judgment: a later sentence of an item carries the item's name; an item's own first sentence shows whole, not "…11) …".
 const judged=part('HyperRx의 판단','상호작용 기전');
 assert.match(judged,/사용상의 주의사항 · 10\) 칼륨보전이뇨제 또는 칼륨보충제 “칼륨보전이뇨제\(스피로노락톤/);
 assert.match(judged,/“11\) 부신피질호르몬\(코르티코스테로이드, 전신 투여\) : 이 약과 병용투여시 혈압강하효과가 감소될 수 있다\.”/);assert.doesNotMatch(p,/…부신피질호르몬|…이뇨제/);
 assert.doesNotMatch(judged,/체액고갈/); // moved to the mechanism, not quoted twice
});
