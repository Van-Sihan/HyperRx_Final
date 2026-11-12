import unittest
from evidence import MedicationIndex,describe_source,attach_provenance,source_document
FLU='[임부금기] 대상 성분은 플루다라빈(Fludarabine)(단일제)입니다. 임부 금기 등급: 2등급.'
OTHER='[노인주의] 대상 성분은 플루라제팜(Flurazepam)(단일제)입니다.'
PAIR='[병용금기] 릴피비린(Rilpivirine)(단일제)과(와) 리파부틴(Rifabutin)(단일제)은 함께 쓰지 않습니다.'
class EvidenceTests(unittest.TestCase):
 def setUp(self):
  self.chunks={'a':{'content':FLU},'b':{'content':OTHER},'c':{'content':PAIR}}
  self.sources={cid:{'source':'dur','record_ids':'DUR-opaque-id'} for cid in self.chunks}
  self.index=MedicationIndex(self.chunks,self.sources)
 def test_readable_title_preserves_internal_id(self):
  d=describe_source(self.sources['a'],FLU)
  self.assertEqual(d['title'],'플루다라빈 — 임부금기');self.assertEqual(d['record_id'],'DUR-opaque-id')
  self.assertEqual(describe_source(self.sources['c'],PAIR)['title'],'릴피비린 · 리파부틴 — 병용금기')
 def test_retrieval_adds_missing_exact_drug_and_removes_other_context(self):
  original={'text_units':[{'content':OTHER}],'context':OTHER,'hyperedges':[{'entity_set':['플루라제팜','노인'],'description':OTHER}],'entities':[{'entity_name':'플루라제팜'}]}
  for question in ['플루다라빈은 무슨 약물인가요','What is fludarabine?']:
   result=self.index.refine(question,original)
   self.assertEqual([d['id'] for d in result['text_units']],['a']);self.assertNotIn('플루라제팜',result['context']);self.assertEqual(result['hyperedges'],[]);self.assertEqual(result['retrieval']['excluded_candidate_documents'],1)
 def test_unknown_query_does_not_invent_matches(self):
  original={'context':'original','text_units':[]};self.assertIs(self.index.refine('일반적인 상호작용을 알려줘',original),original)
 def test_paper_uses_actual_title_and_product_retains_name(self):
  self.assertEqual(describe_source({'source':'paper','pmid':'1'},'Actual study title\nAbstract')['title'],'Actual study title')
  self.assertEqual(describe_source({'source':'permit','item_name':'제품명','feature':'PERMIT_EFFICACY'},'text')['title'],'제품명 — 효능·효과')

 def test_provenance_uses_stored_source_ids_not_query_documents(self):
  edge={'entity_set':['플루다라빈','임부'],'description':'자동추출 관계','keywords':'임부 금기<SEP>안전성, 임부 금기'}
  linked,docs=attach_provenance(edge,{'source_id':'a<SEP>missing<SEP>a'},self.chunks,self.sources,'test-db')
  self.assertEqual(linked['source_ids'],['a','missing']);self.assertEqual(linked['source_document_ids'],['a'])
  self.assertEqual(linked['provenance']['status'],'partial');self.assertEqual(linked['provenance']['missing_ids'],['missing'])
  self.assertEqual(linked['tags'],['임부 금기','안전성']);self.assertEqual(docs[0]['title'],'플루다라빈 — 임부금기')
  span=linked['source_spans'][0];self.assertEqual(self.chunks['a']['content'][span['excerpt_start']:span['excerpt_end']],span['excerpt'])
  self.assertIn('플루다라빈',span['matched_members']);self.assertNotIn('content',docs[0])
 def test_missing_edge_source_is_explicit_and_never_inferred(self):
  edge={'entity_set':['플루다라빈'],'keywords':'임부 금기'}
  linked,docs=attach_provenance(edge,None,self.chunks,self.sources,'test-db')
  self.assertEqual(docs,[]);self.assertEqual(linked['provenance']['status'],'unresolved');self.assertEqual(linked['source_ids'],[])
 def test_full_source_preserves_original_text_and_only_known_external_link(self):
  doc=source_document('a',self.chunks,self.sources)
  self.assertEqual(doc['content'],FLU);self.assertNotIn('source_url',doc);self.assertIsNone(source_document('unknown',self.chunks,self.sources))
  paper=source_document('a',self.chunks,{'a':{'source':'paper','pmid':'12345'}})
  self.assertEqual(paper['source_url'],'https://pubmed.ncbi.nlm.nih.gov/12345/')

class MemberProvenanceTests(unittest.TestCase):
 def test_member_quotes_keep_exact_offsets_and_do_not_infer_absent_nodes(self):
  text='앞 문장. Aspirin과 위장관 출혈에 관한 원문. 뒤 문장.'
  edge={'entity_set':['ASPIRIN','위장관출혈','천식']}
  linked,docs=attach_provenance(edge,{'source_id':'a'},{'a':{'content':text}},{},'test')
  spans=linked['source_spans'][0]['member_evidence']
  self.assertEqual([m['member'] for m in spans],['ASPIRIN','위장관출혈'])
  for m in spans:self.assertEqual(m['excerpt'],text[m['start']:m['end']])
  self.assertNotIn('천식',linked['source_spans'][0]['matched_members'])

if __name__=='__main__':unittest.main()

SIMCLA='[병용금기] 심바스타틴(Simvastatin)(단일제)과(와) 클래리트로마이신(Clarithromycin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 근병증'
class PairEdgeTests(unittest.TestCase):
 """Hyperedges joining two asked drugs are looked up in the DB even when the engine's ranking dropped them."""
 def setUp(self):
  chunks={'d':{'content':SIMCLA},'p':{'content':'[허가] 고령자 주의'}}
  sources={'d':{'source':'dur'},'p':{'source':'permit'}}
  e=lambda *m:tuple(sorted(m))
  self.e_data={e('심바스타틴','클래리트로마이신'):{'description':'병용금기','keywords':'병용금기','weight':1.0,'source_id':'d'},
   e('근병증','심바스타틴','클래리트로마이신'):{'description':'근병증 위험','keywords':'근병증','weight':1.0,'source_id':'d'},
   e('CLARITHROMYCIN','SIMVASTATIN'):{'description':'contraindicated','keywords':'ddi','weight':1.0,'source_id':'d'},
   e('고령자','심바스타틴'):{'description':'고령자','keywords':'주의','weight':1.0,'source_id':'p'},
   e('심바스타틴 장기복용 환자','클래리트로마이신'):{'description':'환자군','keywords':'x','weight':1.0,'source_id':'p'}}
  v_inci={}
  for k in self.e_data:
   for m in k:v_inci.setdefault(m,set()).add(k)
  v_data={v:{'entity_type':'ACTIVE_INGREDIENT','description':v+' 설명'} for v in v_inci}
  self.index=MedicationIndex(chunks,sources,{'v_data':v_data,'v_inci':v_inci,'e_data':self.e_data})
  self.engine={'text_units':[],'context':'','entities':[{'entity_name':'심바스타틴'}],'hyperedges':[{'entity_set':('고령자','심바스타틴'),'description':'고령자'}]}
 def test_pair_edges_are_added_ahead_of_engine_edges_with_their_entities(self):
  r=self.index.refine('심바스타틴과 클래리트로마이신을 함께 복용해도 되나요?',self.engine)
  sets=[tuple(sorted(e['entity_set'])) for e in r['hyperedges']]
  self.assertEqual(sets[:3],[('CLARITHROMYCIN','SIMVASTATIN'),('심바스타틴','클래리트로마이신'),('근병증','심바스타틴','클래리트로마이신')]) # more drugs, then fewer members, then name
  self.assertIn(('고령자','심바스타틴'),sets)
  self.assertNotIn(('심바스타틴 장기복용 환자','클래리트로마이신'),sets) # a patient group is not the drug
  self.assertEqual(r['retrieval']['added_pair_hyperedges'],3)
  self.assertTrue({'근병증','클래리트로마이신','CLARITHROMYCIN'}<={e['entity_name'] for e in r['entities']})
  self.assertTrue(all(e['added_by']=='question-drug-pair' for e in r['hyperedges'][:3]))
 def test_one_drug_or_no_graph_adds_nothing(self):
  r=self.index.refine('심바스타틴은 어떤 약인가요?',self.engine);self.assertEqual(r['retrieval']['added_pair_hyperedges'],0)
  plain=MedicationIndex({'d':{'content':SIMCLA}},{'d':{'source':'dur'}})
  self.assertEqual(plain.refine('심바스타틴과 클래리트로마이신',self.engine)['retrieval']['added_pair_hyperedges'],0)
 def test_each_drug_gets_its_own_class_and_earliest_single_ingredient_efficacy(self):
  chunks={'g':{'content':'[효능군중복] 대상 성분은 심바스타틴(Simvastatin)(단일제)입니다. 효능군: 지질저하제. 계열명: HMG-CoA 환원효소 저해제.'},
   'gx':{'content':'[효능군중복] 대상 성분은 심바스타틴(Simvastatin)(복합제; 복합 구성 성분: 에제티미브)입니다. 효능군: 지질저하제.'},
   'late':{'content':'[심바정(심바스타틴) | 주성분: 심바스타틴 40 밀리그램 | 주성분 영문명: Simvastatin] 효능·효과 늦게 허가된 제품'},
   'early':{'content':'[심바로드정(심바스타틴) | 주성분: 심바스타틴 20 밀리그램 | 주성분 영문명: Simvastatin] 효능·효과 '+'고콜레스테롤혈증 '*80},
   'combo':{'content':'[바이토린정 | 주성분: 심바스타틴 10 밀리그램; 에제티미브 10 밀리그램 | 주성분 영문명: Ezetimibe/Simvastatin] 효능·효과 복합제'},
   'salt':{'content':'[애니디핀정 | 주성분: 암로디핀말레산염 6.42 밀리그램 | 주성분 영문명: Amlodipine Maleate] 효능·효과 고혈압'},
   's-am':{'content':'[에스암로정 | 주성분: 에스암로디핀베실산염 3.47 밀리그램 | 주성분 영문명: S-Amlodipine Besylate] 효능·효과 다른 성분'},
   'd':{'content':SIMCLA},'a':{'content':'[임부금기] 대상 성분은 암로디핀(Amlodipine)(단일제)입니다.'}}
  sources={'g':{'source':'dur','feature':'DUR_효능군중복'},'gx':{'source':'dur','feature':'DUR_효능군중복'},'d':{'source':'dur','feature':'DUR_병용금기'},'a':{'source':'dur','feature':'DUR_임부금기'},
   'late':{'source':'permit','feature':'PERMIT_EFFICACY','item_seq':'201500002'},'early':{'source':'permit','feature':'PERMIT_EFFICACY','item_seq':'199900001'},
   'combo':{'source':'permit','feature':'PERMIT_EFFICACY','item_seq':'190000000'},'salt':{'source':'permit','feature':'PERMIT_EFFICACY','item_seq':'200000003'},
   's-am':{'source':'permit','feature':'PERMIT_EFFICACY','item_seq':'190000001'}}
  index=MedicationIndex(chunks,sources)
  r=index.refine('심바스타틴과 암로디핀과 클래리트로마이신을 함께 복용해도 되나요?',{'text_units':[],'hyperedges':[],'entities':[]})
  got=[(b['drug'],b['basic_kind'],b['id']) for b in r['drug_basics']]
  self.assertIn(('심바스타틴','효능군','g'),got);self.assertIn(('심바스타틴','효능·효과','early'),got) # single-ingredient records only, earliest approved
  self.assertIn(('암로디핀','효능·효과','salt'),got)  # a salt form counts; S-amlodipine is another ingredient
  self.assertNotIn('s-am',[i for _,_,i in got]);self.assertNotIn('combo',[i for _,_,i in got])
  self.assertFalse([g for g in got if g[0]=='클래리트로마이신'])  # no record of its own: nothing is invented
  early=next(b for b in r['drug_basics'] if b['id']=='early');self.assertLessEqual(len(early['content']),601);self.assertTrue(early['content'].endswith('…'))
  self.assertEqual(r['retrieval']['drug_basics'],len(r['drug_basics']))
 def test_engine_edge_already_present_is_not_duplicated(self):
  engine={**self.engine,'hyperedges':[{'entity_set':'심바스타틴|#|클래리트로마이신','description':'병용금기'}]}
  r=self.index.refine('심바스타틴과 클래리트로마이신',engine)
  self.assertEqual([tuple(sorted(e['entity_set'] if not isinstance(e['entity_set'],str) else e['entity_set'].split('|#|'))) for e in r['hyperedges']].count(('심바스타틴','클래리트로마이신')),1)
