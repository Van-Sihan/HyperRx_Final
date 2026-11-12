import test from 'node:test';
import assert from 'node:assert/strict';
import {largeDemoGraph,runQuery,normalizeGraph,modelContext,normalizeAssessment,applyCitations,citationStats,citationSources,answerFromRetrieval,sourceSentences,DEFAULT_MODEL} from '../service.mjs';
test('Demo never represents a medical determination and has a graph for RAG and HyperRAG, none for the LLM alone',async()=>{
 for(const mode of ['llm','rag','hyperrag']){const r=await runQuery({question:'실제 약 질문',mode,demo:true});assert.equal(r.demo,true);assert.match(r.headline,/판정하지/);assert.equal(!!r.graph.nodes.length,mode!=='llm');assert.equal(!!r.documents.length,mode!=='llm');}
});
test('A RAG answer keeps the relations the DB added for the asked drugs, so the map and its views work (2026-11-10)',async()=>{
 const realFetch=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({headline:'함께 쓰지 않습니다 [S1].',assessment:'금기',details:'근병증 위험이 커집니다. [S2.1]'})}}]})});
 try{
  const raw={retrieval_only:true,response:'',text_units:[{id:'c1',title:'문서',content:'심바스타틴 병용 주의.'}],entities:[{entity_name:'심바스타틴'},{entity_name:'클래리트로마이신'}],
   hyperedges:[{entity_set:['심바스타틴','클래리트로마이신'],description:'병용 시 혈중 농도가 오릅니다.',added_by:'question-drug'}]};
  for(const mode of ['rag','hyperrag']){const r=await answerFromRetrieval('심바스타틴과 클래리트로마이신?',raw,mode,undefined,'sk-test');assert.equal(r.graph.hyperedges.length,1,mode);assert.equal(r.graph.nodes.length,2,mode);}
  assert.equal((await answerFromRetrieval('질문',null,'llm',undefined,'sk-test')).graph.hyperedges.length,0);
 }finally{globalThis.fetch=realFetch;}
});
test('Independent relations with the same members are preserved',()=>{
 const g=normalizeGraph({entities:[{name:'A'}],hyperedges:[{entity_set:['A','B'],description:'조건 1'},{id_set:'A|#|B',description:'조건 2'}]});assert.equal(g.nodes.length,2);assert.equal(g.hyperedges.length,2);assert.notEqual(g.hyperedges[0].id,g.hyperedges[1].id);
});
test('Unconfigured live requests fail instead of inventing answers',async()=>{
 const key=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{await assert.rejects(runQuery({question:'금기인가요?',mode:'llm',demo:false}),/키가 없습니다/);}finally{if(key)process.env.OPENAI_API_KEY=key;}
});
test('Graph preserves exact source references, original explanations and split extraction tags',()=>{
 const g=normalizeGraph({entities:[{entity_name:'A',entity_type:'CONCEPT',description:'원본 개체 설명'}],hyperedges:[{entity_set:['A','B'],description:'원본 추출 설명',keywords:'태그 하나<SEP>태그 둘, 태그 셋',source_document_ids:['chunk-original'],source_spans:[{id:'chunk-original',excerpt:'원문 문장'}],provenance:{status:'linked',resolved_count:1,source_count:1}}],evidence_documents:[{id:'chunk-original',title:'자료 제목',source_label:'DUR 안전사용 정보',record_id:'DUR-record',excerpt:'원문 문장',source_url:'javascript:bad()'}]});
 assert.equal(g.hyperedges[0].description,'원본 추출 설명');assert.deepEqual(g.hyperedges[0].sourceIds,['chunk-original']);assert.deepEqual(g.hyperedges[0].tags,['태그 하나','태그 둘','태그 셋']);assert.ok(!g.hyperedges[0].label.includes('<SEP>'));assert.equal(g.nodes[0].type,'CONCEPT');assert.equal(g.evidenceDocuments[0].url,null);assert.equal(g.evidenceDocuments[0].recordId,'DUR-record');
});

test('UI source previews are excluded from generation input while original evidence is kept',()=>{
 const input=modelContext({context:'검색 문맥',hyperedges:[{entity_set:['A','B'],description:'추출 설명',keywords:'태그',source_spans:[{excerpt:'UI 전용 발췌'}],provenance:{status:'linked'}}],text_units:[{id:'doc',title:'원문 제목',content:'생성에 쓸 원문',source:{record_ids:'record'}}],evidence_documents:[{excerpt:'UI 전용 발췌'}]});
 assert.equal(input.text_units[0].content,'⟦1⟧ 생성에 쓸 원문');assert.equal(input.hyperedges[0].description,'추출 설명');assert.ok(!JSON.stringify(input).includes('UI 전용 발췌'));
 // The engine's context text repeats the lists above without source numbers, so it is not sent (2026-11-09).
 assert.equal('context' in input,false);assert.ok(!JSON.stringify(input).includes('검색 문맥'));
});

test('Generation receives only original source excerpts referenced by returned relations',()=>{
 const input=modelContext({hyperedges:[{entity_set:['A','B'],description:'추출문',source_document_ids:['actual'],provenance:{status:'partial'}}],evidence_documents:[{id:'actual',title:'원문',excerpt:'실제 발췌',excerpt_start:10,excerpt_end:15},{id:'unrelated',excerpt:'다른 관계 원문'}]});
 assert.deepEqual(input.hyperedges[0].source_ids,['actual']);assert.equal(input.hyperedges[0].source_status,'partial');assert.equal(input.relation_sources.length,1);assert.equal(input.relation_sources[0].excerpt,'⟦1⟧ 실제 발췌');
});

test('Default model is gpt-4o-mini, matching .env.example and the evaluation runs',()=>{assert.equal(DEFAULT_MODEL,'gpt-4o-mini');});
test('Only the five verdicts are trusted; anything else becomes 분류 미확인',()=>{
 assert.equal(normalizeAssessment('금기'),'금기');assert.equal(normalizeAssessment('근거부족'),'근거 부족');assert.equal(normalizeAssessment(' 주의 '),'주의');
 for(const v of ['아마 주의','안전',undefined,null,'']) assert.equal(normalizeAssessment(v),'분류 미확인');
});
test('Citation numbers that were not provided are removed instead of linking anywhere',()=>{
 const r=applyCitations('첫 문장 [S1]. 둘째 [S9]. 셋째 [S1, S2][s3].',new Set(['S1','S2']));
 assert.equal(r.text,'첫 문장 [S1]. 둘째 [인용 확인 불가]. 셋째 [S1][S2][인용 확인 불가].');assert.equal(r.invalid,2);
});
test('Sentence counting keeps trailing markers with their own sentence',()=>{
 assert.deepEqual(citationStats('가는 금기입니다. [S1] 나는 일반 지식입니다. [근거 없음]\n다는 표시가 없습니다.\n- 라는 근거입니다 [S2].'),{sentences:4,cited:2,uncited:1,unmarked:1});
});
test('Documents and relation-only sources share one numbering without duplicates',()=>{
 const s=citationSources({text_units:[{id:'chunk-a',title:'A'},{id:'chunk-b',title:'B'}],hyperedges:[{source_document_ids:['chunk-b','chunk-c']}],evidence_documents:[{id:'chunk-b',title:'B'},{id:'chunk-c',title:'C'},{id:'chunk-x',title:'unused'}]});
 assert.deepEqual(s.map(x=>[x.ref,x.id,x.kind]),[['S1','chunk-a','document'],['S2','chunk-b','document'],['S3','chunk-c','relation']]);
 const input=modelContext({text_units:[{id:'chunk-a',content:'a'},{id:'chunk-b',content:'b'}],hyperedges:[{entity_set:['A'],source_document_ids:['chunk-b','chunk-c']}],evidence_documents:[{id:'chunk-c',excerpt:'c'}]},s);
 assert.deepEqual(input.text_units.map(d=>d.ref),['S1','S2']);assert.deepEqual(input.hyperedges[0].source_refs,['S2','S3']);assert.equal(input.relation_sources[0].ref,'S3');
});
test("Each asked drug's basic records get numbers after the documents, keep a document's number when they are one, and reach the model",()=>{
 const raw={text_units:[{id:'doc',title:'병용금기',content:'함께 쓰지 않습니다.'},{id:'eff-in-docs',title:'이미 검색됨',content:'효능 문장.'}],
  drug_basics:[{id:'grp',drug:'심바스타틴',basic_kind:'효능군',title:'심바스타틴 — 효능군중복',source_label:'DUR',content:'[효능군중복] 대상 성분은 심바스타틴(Simvastatin)(단일제)입니다. 효능군: 지질저하제. 계열명: HMG-CoA 환원효소 저해제.'},{id:'eff-in-docs',drug:'심바스타틴',basic_kind:'효능·효과',content:'효능 문장.'}],
  hyperedges:[{source_document_ids:['grp','rel']}],evidence_documents:[{id:'grp',excerpt:'효능군: 지질저하제.'},{id:'rel',excerpt:'관계 원문.'}]};
 const s=citationSources(raw);
 assert.deepEqual(s.map(x=>[x.ref,x.id,x.kind]),[['S1','doc','document'],['S2','eff-in-docs','document'],['S3','grp','basic'],['S4','rel','relation']]);
 const input=modelContext(raw,s);
 assert.deepEqual(input.drug_basics.map(d=>[d.ref,d.drug,d.kind]),[['S3','심바스타틴','효능군']]);
 assert.match(input.drug_basics[0].content,/⟦2⟧ 효능군: 지질저하제\./);
 assert.equal(input.relation_sources[0].excerpt,'효능군: 지질저하제.'); // numbered as a basic record already
 assert.deepEqual(sourceSentences(raw,s).get('S3'),['[효능군중복] 대상 성분은 심바스타틴(Simvastatin)(단일제)입니다.','효능군: 지질저하제.','계열명: HMG-CoA 환원효소 저해제.']);
});
test('Sentence numbers point at real sentences; a number that does not exist falls back to the source',()=>{
 const sentences=new Map([['S1',['첫 문장.','둘째 문장.']]]);
 const r=applyCitations('가 [S1.2]. 나 [s1.9]. 다 [S1.1, S1.2]. 라 [S7.1]. 마 ⟦3⟧ 끝 [S1].',new Set(['S1']),sentences);
 assert.equal(r.text,'가 [S1.2]. 나 [S1]. 다 [S1.1][S1.2]. 라 [인용 확인 불가]. 마 끝 [S1].');assert.equal(r.invalid,1);
 const raw={text_units:[{id:'a',content:'[품목 | 주성분: 약 1 밀리그램] 문서의 첫 문장. 둘째 문장.'}],evidence_documents:[{id:'b',excerpt:'발췌 문장.'},{id:'a',excerpt:'무시'}]};
 const map=sourceSentences(raw,[{ref:'S1',id:'a'},{ref:'S2',id:'b'},{ref:'S3',id:'c'}]);
 assert.deepEqual(map.get('S1'),['문서의 첫 문장.','둘째 문장.']);assert.deepEqual(map.get('S2'),['발췌 문장.']);assert.deepEqual(map.get('S3'),[]);
 const input=modelContext({text_units:[{id:'a',title:'t',content:'[품목 | 주성분: 약 1 밀리그램] 문서의 첫 문장. 둘째 문장.'}],hyperedges:[{source_document_ids:['a','b']}],evidence_documents:[{id:'a',excerpt:'문서의 첫 문장.'},{id:'b',excerpt:'발췌 문장.'}]});
 assert.equal(input.text_units[0].content,'[품목 | 주성분: 약 1 밀리그램] ⟦1⟧ 문서의 첫 문장. ⟦2⟧ 둘째 문장.');
 assert.equal(input.relation_sources[0].excerpt,'문서의 첫 문장.'); // already numbered in text_units: one number must not mean two sentences
 assert.equal(input.relation_sources[1].excerpt,'⟦1⟧ 발췌 문장.');
});
test('Live answers keep only valid citations and an allowed verdict (OpenAI stubbed)',async()=>{
 const realFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';let sent=null;
 const reply=content=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:1}})});
 try{
  globalThis.fetch=async(url,init)=>{sent=JSON.parse(init.body);return reply({headline:'함께 쓰지 않습니다 [S1].',assessment:'금기',details:'병용금기로 분류됩니다. [S1.1]\n없는 자료입니다. [S7]\n일반적인 설명입니다. [근거 없음]'});};
  const raw={retrieval_only:true,response:'',text_units:[{id:'chunk-a',title:'A — 병용금기',content:'원문 A'}],hyperedges:[],entities:[]};
  const r=await answerFromRetrieval('A와 B?',raw,'rag');
  assert.match(sent.messages[0].content,/\[S5\]/);assert.equal(JSON.parse(sent.messages[1].content).retrieved.text_units[0].ref,'S1');
  assert.equal(r.assessment,'금기');assert.equal(r.headline,'함께 쓰지 않습니다 [S1].');assert.ok(r.details.includes('[인용 확인 불가]'));
  assert.deepEqual(r.citations.map(c=>[c.ref,c.id]),[['S1','chunk-a']]);assert.deepEqual(r.citations[0].sentences,{1:'원문 A'});assert.deepEqual(r.sentenceStats,{markers:2,withSentence:1});assert.match(sent.messages[0].content,/바로 뒤/);assert.match(sent.messages[0].content,/모아 붙이지 마세요/);assert.match(sent.messages[0].content,/\[S5\.1\]/);assert.deepEqual(r.citationStats,{sentences:3,cited:1,uncited:1,unmarked:1,invalidRefs:1});
  globalThis.fetch=async()=>reply({headline:'주의 [S1]',assessment:'위험함',details:'설명 [S2] [근거 없음]'});
  const llm=await answerFromRetrieval('A와 B?',null,'llm');
  assert.equal(llm.assessment,'분류 미확인');assert.ok(!/\[S\d|근거 없음/.test(llm.headline+llm.details));assert.deepEqual(llm.citations,[]);
  globalThis.fetch=async()=>reply({headline:'주의 [S1.1]',assessment:'주의',sections:[{title:'질문의 검토 범위',body:'제공된 원문입니다 [S1.1].'},{title:'모니터링과 다음 단계',body:'검토 내용입니다 [S1.1].'}]});
  const structured=await answerFromRetrieval('A와 B?',raw,'rag');assert.match(structured.details,/## 질문의 검토 범위/);assert.match(structured.details,/## 모니터링과 다음 단계/);assert.equal(structured.citationStats.sentences,2);assert.equal(structured.citationStats.unmarked,0);assert.equal(structured.citations[0].sentences[1],'원문 A');
 }finally{globalThis.fetch=realFetch;if(key)process.env.OPENAI_API_KEY=key;else delete process.env.OPENAI_API_KEY;}
});
test('Demo answers show a citation that resolves to a listed document',async()=>{
 for(const mode of ['rag','hyperrag']){const r=await runQuery({question:'예시',mode,demo:true});assert.equal(r.citations[0].ref,'S1');assert.ok(r.documents.some(d=>d.id===r.citations[0].id));assert.ok(r.details.includes('[S1.2]'));assert.ok(r.documents[0].content.includes(r.citations[0].sentences[2]));}
 const llm=await runQuery({question:'예시',mode:'llm',demo:true});assert.deepEqual(llm.citations,[]);
});
test('Large demo has 50+ fictional relations whose members all exist, and is identical every time',async()=>{
 const g=largeDemoGraph(),ids=new Set(g.nodes.map(n=>n.id));
 assert.ok(g.hyperedges.length>=50);assert.ok(g.hyperedges.every(e=>e.members.length>=2&&e.members.every(id=>ids.has(id))&&/가상/.test(e.description)));
 assert.deepEqual(largeDemoGraph(),g);
 const r=await runQuery({question:'예시',mode:'hyperrag',demo:true,demoScale:'large'});assert.equal(r.graph.hyperedges.length,g.hyperedges.length);
 const basic=await runQuery({question:'예시',mode:'hyperrag',demo:true});assert.equal(basic.graph.hyperedges.length,7);
});
