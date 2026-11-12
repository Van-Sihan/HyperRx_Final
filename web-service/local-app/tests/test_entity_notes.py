import unittest
from evidence import MedicationIndex
from entity_notes import EntityNotes,names_in,sentences

DUR_BAN='[병용금기] 다비가트란에텍실레이트(Dabigatran etexilate)(단일제)과(와) 이트라코나졸(Itraconazole)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 출혈 위험 증가'
DUR_PREG='[임부금기] 대상 성분은 이트라코나졸(Itraconazole)(단일제)입니다. 제형은 정제입니다. 임부 금기 등급: 2등급.'
LABEL='[아토반듀오정 | 주성분: 아토르바스타틴]\n사용상의 주의사항\n(3) 이트라코나졸 : 아토르바스타틴 40 mg과 이트라코나졸 200 mg 병용 투여 시 아토르바스타틴 AUC가 현저하게 증가하였다.\n이트라코나졸 200 mg 1일 1회, 5일간'
EASY='이 약을 복용하기 전에 무좀치료제 및 항진균제(이트라코나졸 및 포사코나졸 경구현탁액 등)를 복용하는 환자는 의사 또는 약사와 상의하십시오.이 약은 식후에 복용합니다.'
DESC=('이트라코나졸은 항진균제로, 특히 무좀 치료에 쓰인다. 아토르바스타틴과 함께 쓰면 AUC가 현저히 증가한다.\n\n'
      '이트라코나졸은 200 mg을 1일 1회 투여하는 것이 일반적이다. 다양한 약물과 신중하게 사용해야 한다.')

class EntityNotesTests(unittest.TestCase):
 def setUp(self):
  self.chunks={'dur1':{'content':DUR_BAN},'dur2':{'content':DUR_PREG},'per1':{'content':LABEL},'easy1':{'content':EASY}}
  self.sources={'dur1':{'source':'dur','feature':'DUR_병용금기'},'dur2':{'source':'dur','feature':'DUR_임부금기'},
                'per1':{'source':'permit','feature':'PERMIT_PRECAUTION','item_name':'아토반듀오정'},'easy1':{'source':'easy','item_name':'아모틴정'}}
  ent=lambda t,src='x<SEP>y':{'entity_type':t,'description':'','source_id':src}
  v={'이트라코나졸':{'entity_type':'ACTIVE_INGREDIENT','description':DESC,'source_id':'dur1<SEP>per1'},
     '무좀':ent('DISEASE_OR_CONDITION'),'항진균제':ent('DRUG_CLASS'),'아토르바스타틴':ent('ACTIVE_INGREDIENT'),
     '다비가트란에텍실레이트':ent('ACTIVE_INGREDIENT'),'임부':ent('PATIENT_GROUP'),
     '특히':ent('PATIENT_GROUP','x'),'약물':ent('DRUG_CLASS'),'암로디핀':ent('ACTIVE_INGREDIENT'),'에스암로디핀':ent('ACTIVE_INGREDIENT'),
     '스타틴':ent('DRUG_CLASS')}
  graph={'v_data':v,'v_inci':{k:{('e',)} for k in v},'e_data':{}}
  self.notes=EntityNotes(self.chunks,self.sources,graph,MedicationIndex(self.chunks,self.sources,graph))
  self.out=self.notes.describe(('이트라코나졸',))
  self.sents={s['text']:s['sources'] for p in self.out['paragraphs'] for s in p['sentences']}

 def test_each_sentence_points_at_the_record_sentence_that_says_it(self):
  s=self.sents['이트라코나졸은 항진균제로, 특히 무좀 치료에 쓰인다.']
  self.assertEqual(s[0]['id'],'easy1');self.assertEqual(s[0]['anchors'],['무좀','항진균제'])
  # A sentence glued to the next one ("상의하십시오.이 약은") is split, so the mark is the sentence alone, word for word.
  self.assertEqual(s[0]['marks'][0],'이 약을 복용하기 전에 무좀치료제 및 항진균제(이트라코나졸 및 포사코나졸 경구현탁액 등)를 복용하는 환자는 의사 또는 약사와 상의하십시오.')
  self.assertTrue(all(m in self.chunks[x['id']]['content'] for x in s for m in x['marks']))
  auc=self.sents['아토르바스타틴과 함께 쓰면 AUC가 현저히 증가한다.']
  self.assertEqual(auc[0]['id'],'per1');self.assertIn('AUC가 현저하게 증가하였다',auc[0]['marks'][0])
  # The dose sentence goes to the study condition it was summarised from, the short line that says just that.
  dose=self.sents['이트라코나졸은 200 mg을 1일 1회 투여하는 것이 일반적이다.']
  self.assertEqual(dose[0]['marks'],['이트라코나졸 200 mg 1일 1회, 5일간'])

 def test_a_sentence_without_anything_specific_gets_no_record(self):
  self.assertEqual(self.sents['다양한 약물과 신중하게 사용해야 한다.'],[])

 def test_paragraphs_documents_and_unknown_names(self):
  self.assertEqual([p['lang'] for p in self.out['paragraphs']],['ko','ko'])
  self.assertEqual({d['id']:d['title'] for d in self.out['documents']}['per1'],'아토반듀오정 — 사용상의 주의사항')
  self.assertIsNone(self.notes.describe(('없는 이름',)))
  self.assertNotIn('특히',self.notes.vocab)  # a name the extraction used once is not a term

 def test_a_dur_record_is_one_unit_marked_where_it_matched(self):
  units=self.notes.units(('이트라코나졸',),self.notes.names_of(('이트라코나졸',)))
  dur=[u for u in units if u['id']=='dur2'][0]
  self.assertIsNone(dur['marks']);self.assertEqual(len(dur['sents']),3)
  # A sentence with the next is one mark, so the two are marked together where they stand.
  self.assertIn(['(3) 이트라코나졸 : 아토르바스타틴 40 mg과 이트라코나졸 200 mg 병용 투여 시 아토르바스타틴 AUC가 현저하게 증가하였다. 이트라코나졸 200 mg 1일 1회, 5일간'],[u['marks'] for u in units])
  self.assertEqual(sentences('복용하지 마십시오.이 약은 식후에 복용합니다.'),['복용하지 마십시오.','이 약은 식후에 복용합니다.'])

 def test_terms_in_a_sentence_with_their_types(self):
  own=self.notes.names_of(('이트라코나졸',))
  # A name inside a longer one counts only where it also stands apart.
  self.assertEqual(self.notes.terms('에스암로디핀, 암로디핀과의 병용 시에도 신중해야 한다.',own),['에스암로디핀','암로디핀'])
  self.assertEqual(self.notes.terms('아토르바스타틴과 함께 쓰면 AUC가 증가한다.',own),['아토르바스타틴'])
  first=self.out['paragraphs'][0]['sentences'][0]
  self.assertEqual(first['terms'],[{'name':'항진균제','type':'DRUG_CLASS'},{'name':'무좀','type':'DISEASE_OR_CONDITION'}])

 def test_the_name_must_stand_as_a_word(self):
  self.assertFalse(names_in('아트로바스타틴 20 mg을 투여한다.',{'로바스타틴'}))
  self.assertTrue(names_in('HMG-CoA 환원효소 억제제인 로바스타틴을 투여한다.',{'로바스타틴'}))
  self.assertTrue(names_in('Itraconazole 200 mg',{'itraconazole'}))

if __name__=='__main__':unittest.main()
