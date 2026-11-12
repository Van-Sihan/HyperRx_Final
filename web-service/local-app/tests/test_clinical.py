import unittest
from evidence import MedicationIndex
from clinical import ClinicalIndex,sentences,parse_pair,parse_flag

PAIR1='[병용금기] 심바스타틴(Simvastatin)(단일제)과(와) 클래리트로마이신(Clarithromycin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 근병증, 횡문근융해의 위험증가'
PAIR2='[병용금기] 클래리트로마이신(Clarithromycin)(단일제)과(와) 심바스타틴(Simvastatin)(복합제; 복합 구성 성분: [D000350]Ezetimibe(에제티미브))은 함께 쓰지 않습니다. 금기·주의 내용: 근육병증의 위험 증가 가능'
PAIR3='[병용금기] 와파린(Warfarin)(단일제)과(와) 미코나졸(Miconazole)(단일제)은 함께 쓰지 않습니다.'
FLAG1='[임부금기] 대상 성분은 심바스타틴(Simvastatin)(단일제)입니다. 제형은 정제입니다. 임부 금기 등급: 1등급. 금기·주의 내용: 태아 발육에 필수적인 콜레스테롤의 생합성 감소 가능성.'
FLAG2='[용량주의] 대상 성분은 심바스타틴(Simvastatin)(단일제)입니다. 제형은 정제입니다. 최대 투여량: 심바스타틴 80밀리그램.'
FLAG3='[임부금기] 대상 성분은 아스피린(Aspirin)(단일제)입니다. 임부 금기 등급: 2등급.'
LABEL=('[심바정20밀리그램(심바스타틴) | 주성분: 심바스타틴 20 밀리그램 | 전문의약품 | [02180]동맥경화용제 | 주성분 영문명: Simvastatin] 사용상의 주의사항 '
 '2. 다음 환자에는 투여하지 말 것 1) 이 약에 과민반응 환자 4) 강력한 CYP3A4 억제제를 투여중인 환자(6. 상호작용 참조)(예. 이트라코나졸, 클라리트로마이신, 네파조돈) 5) 겜피브로질을 투여중인 환자 '
 '6. 상호작용 이 약의 주성분인 심바스타틴은 CYP3A4에 의해 대사되며 수송체 단백질의 기질이다. 강력한 CYP3A4 억제제(예, 클라리트로마이신)와 병용투여하지 않는다. 만일 강력한 CYP3A4 억제제의 단기 투여가 불가피하다면 그 투여기간 동안 일시적으로 이 약의 투여를 중지한다. 자몽주스는 섭취하지 않도록 한다.')
COMBO=('[복합정(심바스타틴,클래리트로마이신) | 주성분: 심바스타틴 10 밀리그램; 클래리트로마이신 250 밀리그램 | 전문의약품 | 주성분 영문명: Clarithromycin/Simvastatin] '
 '사용상의 주의사항 클래리트로마이신 성분으로 인해 위장관 이상반응이 나타날 수 있다.')
ASPIRIN_LABEL=('[아스피정(클로피도그렐,아스피린) | 주성분: 클로피도그렐황산염 75 밀리그램; 아스피린장용펠렛 100 밀리그램 | 전문의약품] '
 '사용상의 주의사항 이 약과 와파린을 병용 투여 시 출혈 위험이 증가한다. 와파린과 클로피도그렐을 병용투여시 출혈의 위험성이 증가한다.')
CLOPI_PAIR='[병용금기] 클로피도그렐(Clopidogrel)(단일제)과(와) 셀렉시팍(Selexipag)(단일제)은 함께 쓰지 않습니다.'
PAPER='Statin myopathy with macrolides\nSimvastatin exposure rose with clarithromycin in this case series.'

class ClinicalTests(unittest.TestCase):
 def setUp(self):
  texts={'p1':(PAIR1,'dur','DUR_병용금기'),'p2':(PAIR2,'dur','DUR_병용금기'),'p3':(PAIR3,'dur','DUR_병용금기'),'f1':(FLAG1,'dur','DUR_임부금기'),'f2':(FLAG2,'dur','DUR_용량주의'),'f3':(FLAG3,'dur','DUR_임부금기'),'p4':(CLOPI_PAIR,'dur','DUR_병용금기'),
   'l1':(LABEL,'permit','PERMIT_PRECAUTION'),'l2':(COMBO,'permit','PERMIT_PRECAUTION'),'l3':(ASPIRIN_LABEL,'permit','PERMIT_PRECAUTION'),'pa':(PAPER,'paper','')}
  self.chunks={k:{'content':t} for k,(t,_,_) in texts.items()}
  self.sources={k:{'source':src,'feature':f,'record_ids':'REC-'+k,'item_name':''} for k,(_,src,f) in texts.items()}
  variants=[{'canonical':'클래리트로마이신','en':'Clarithromycin','spellings':['클래리트로마이신','클라리트로마이신']}]
  self.index=ClinicalIndex(self.chunks,self.sources,MedicationIndex(self.chunks,self.sources),variants=variants)

 def test_parsers_keep_regulator_wording(self):
  p=parse_pair(PAIR2)
  self.assertEqual(p['b']['form'],'복합제');self.assertEqual(p['b']['components'],[{'name':'에제티미브','en':'Ezetimibe'}]);self.assertEqual(p['reason'],'근육병증의 위험 증가 가능')
  self.assertEqual(parse_pair(PAIR3)['reason'],'')
  f=parse_flag(FLAG2);self.assertEqual(f['max_dose'],'심바스타틴 80밀리그램');self.assertEqual(f['dosage_form'],'정제')

 def test_listed_pair_in_either_order_single_agent_first(self):
  r=self.index.summary('심바스타틴과 클래리트로마이신을 함께 복용해도 되나요?')
  self.assertEqual([d['name'] for d in r['drugs']],['심바스타틴','클래리트로마이신'])
  pair=r['pairs'][0];self.assertEqual(pair['status'],'listed')
  self.assertEqual([x['chunk_id'] for x in pair['dur']['records']],['p1','p2'])
  self.assertEqual(pair['dur']['records'][1]['a']['name'],'심바스타틴') # oriented to the pair's order
  self.assertEqual(pair['dur']['reasons'],['근병증, 횡문근융해의 위험증가']);self.assertEqual(pair['dur']['combination_reasons'],['근육병증의 위험 증가 가능'])
  self.assertEqual([x['direct'] for x in pair['dur']['records']],[True,False])

 def test_variant_spelling_in_question_and_label(self):
  r=self.index.summary('심바스타틴과 클라리트로마이신')
  self.assertEqual(len(r['drugs']),2);self.assertEqual(r['pairs'][0]['status'],'listed')
  m=r['pairs'][0]['label']['mentions']
  self.assertTrue(m and all(x['spelling']=='클라리트로마이신' for x in m))

 def test_label_sentences_are_literal_ranked_and_skip_products_containing_both(self):
  r=self.index.summary('심바스타틴과 클래리트로마이신');label=r['pairs'][0]['label']
  m=label['mentions'];self.assertEqual(len(m),2)
  self.assertTrue(m[0]['section'].endswith('다음 환자에는 투여하지 말 것'));self.assertTrue(m[0]['text'].startswith('4) 강력한'))
  self.assertNotIn('5) 겜피브로질',m[0]['text'])
  self.assertEqual(m[1]['section'],'6. 상호작용');self.assertTrue(m[1]['text'].endswith('이 약의 투여를 중지한다.')) # the "만일 …" follow-up stays with it
  for x in m:
   self.assertEqual(LABEL[x['start']:x['end']],x['text'])
   for h in x['hits']:self.assertEqual(x['text'][h['start']:h['end']],'클라리트로마이신')
  self.assertTrue(all(x['chunk_id']!='l2' for x in m))
  self.assertEqual([k['text'] for k in label['mechanism']],['이 약의 주성분인 심바스타틴은 CYP3A4에 의해 대사되며 수송체 단백질의 기질이다.'])

 def test_flags_and_unknown_names(self):
  r=self.index.summary('심바스타틴과 아스피린')
  simva=r['drugs'][0];self.assertEqual([f['category'] for f in simva['flags']],['임부금기','용량주의'])
  self.assertEqual(simva['flags'][0]['grade'],'1등급')
  self.assertEqual(r['pairs'][0]['status'],'not_listed')
  self.assertEqual(self.index.summary('심바스타틴과 무명약')['pairs'],[]) # only one known drug: no pair is judged

 def test_diluted_raw_material_names_its_drug(self):
  from clinical import is_ingredient
  for name in ('희석니트로글리세린','희석된니트로글리세린','희석된니트로글리세린(니트로글리세린','희석한니트로글리세린용액','묽은니트로글리세린'):
   self.assertTrue(is_ingredient(name,{'니트로글리세린'}),name)
  for name in ('dilutenitroglycerin','dilutenitroglycerin(nitroglycerin2%inlactose)','dilutenitroglycerinsolution'):
   self.assertTrue(is_ingredient(name,{'nitroglycerin'}),name)
  for name in ('희석된니트로글리세린복용환자','희석액','희석','묽은염산'):
   self.assertFalse(is_ingredient(name,{'니트로글리세린'}),name)
 def test_isosorbide_products_reach_their_own_nitrate(self):
  from clinical import is_ingredient,load_variants
  from evidence import compact
  groups={g['canonical']:{compact(g['canonical']),compact(g['en']),*map(compact,g['spellings'])} for g in load_variants()}
  mono,di=groups['이소소르비드일질산염'],groups['이소소르비드이질산염']
  for name in ('isosorbide-5-mononitrate','isosorbide-5-mononitrate90%','isosorbide-5-mononitratemontanglycolwaxmixture40%','이소소르비드일질산염서방과립','묽은이소소르비드일질산염'):
   self.assertTrue(is_ingredient(name,mono),name);self.assertFalse(is_ingredient(name,di),name)
  for name in ('희석이소소르비드질산염','희석이소소르비드질산염(','질산이소소르비드/염화나트륨','지속성질산이소소르비드펠렛','이소소르비드이질산염지속과립','묽은이소소르비드이질산염'):
   self.assertTrue(is_ingredient(name,di),name);self.assertFalse(is_ingredient(name,mono),name)
  # 이소비지속성캡슐: only its English header says mononitrate; ATC, Korean name and dosing say dinitrate.
  self.assertFalse(is_ingredient('isosorbidemononitratesustained-releasepellets',mono))
 def test_dosage_form_suffix_marks_a_combination_product(self):
  r=self.index.summary('아스피린과 와파린')
  aspirin=next(d for d in r['drugs'] if d['name']=='아스피린')
  self.assertIn('아스피정(클로피도그렐,아스피린)',aspirin['label_products'])
  from clinical import is_ingredient
  self.assertTrue(is_ingredient('아토르바스타틴칼슘삼수화물과립',{'아토르바스타틴'}));self.assertTrue(is_ingredient('atorvastatincalciumtrihydrategranule',{'atorvastatin'}))
  self.assertFalse(is_ingredient('아토르바스타틴복용환자',{'아토르바스타틴'}))
  m=r['pairs'][0]['label']['mentions']
  self.assertEqual(len(m),1);self.assertEqual(m[0]['single'],False)
  self.assertEqual(m[0]['text'],'이 약과 와파린을 병용 투여 시 출혈 위험이 증가한다.') # the clopidogrel sentence is not about aspirin

 def test_papers_naming_both(self):
  self.assertEqual(self.index.summary('simvastatin and clarithromycin')['pairs'][0]['papers']['count'],1)

 def test_sentence_split_keeps_brackets(self):
  text='4) 환자(6. 상호작용 참조)(예. 가, 나) 5) 다음. 6. 상호작용 끝입니다'
  self.assertEqual([text[s:e] for s,e in sentences(text)],['4) 환자(6. 상호작용 참조)(예. 가, 나)','5) 다음.','6. 상호작용','끝입니다'])

if __name__=='__main__':unittest.main()

class ReviewCases(unittest.TestCase):
 """Cases from the independent review (2026-11-05): drugs listed only in combinations, a name inside another name,
 combination-only records, quoted cross-references, nested parentheses and enzymes merely listed next to a drug."""
 def setUp(self):
  texts={
   'n1':'[병용금기] 니르마트렐비르(Nirmatrelvir)(복합제; 복합 구성 성분: [D000001]Ritonavir(리토나비르))과(와) 심바스타틴(Simvastatin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 근병증 위험 증가',
   'n2':'[임부금기] 대상 성분은 아스피린(Aspirin)(단일제)입니다.',
   't1':'[병용금기] 트레티노인(Tretinoin)(단일제)과(와) 이소트레티노인(Isotretinoin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 독성 증가',
   'e1':'[병용금기] 에제티미브(Ezetimibe)(복합제; 복합 구성 성분: [D000027]Simvastatin(심바스타틴))과(와) 이트라코나졸(Itraconazole)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 근병증',
   'e2':'[임부금기] 대상 성분은 에제티미브(Ezetimibe)(단일제)입니다. 임부 금기 등급: 2등급.',
   'h1':'[병용금기] 아미노카프론산(Aminocaproic Acid)(단일제)과(와) 트롬빈(Thrombin)(단일제)은 함께 쓰지 않습니다. 금기·주의 내용: 혈전형성',
   'c1':'[병용금기] 아토르바스타틴(Atorvastatin)(단일제)과(와) 사이클로스포린(Cyclosporine)(단일제)은 함께 쓰지 않습니다.',
  }
  label=('[아토정10밀리그램(아토르바스타틴) | 주성분: 아토르바스타틴 10 밀리그램 | 전문의약품 | [02180]동맥경화용제 | 주성분 영문명: Atorvastatin] 사용상의 주의사항 '
   '5. 일반적 주의 1) 근육병증의 위험이 있다(‘2. 다음 환자에는 투여하지 말 것’ 항 참조). 2) 이 약과 사이클로스포린을 병용 투여하는 경우 주의를 기울여야 한다. '
   '3) 아스피린, CYP2C19 유도제와 병용 시 출혈 위험이 있다.')
  self.chunks={k:{'content':t} for k,t in texts.items()};self.chunks['l']={'content':label}
  self.sources={k:{'source':'dur','feature':'DUR_병용금기' if t.startswith('[병용금기]') else 'DUR_임부금기','record_ids':k} for k,t in texts.items()}
  self.sources['l']={'source':'permit','feature':'PERMIT_PRECAUTION','record_ids':'l','item_name':'아토정'}
  self.index=ClinicalIndex(self.chunks,self.sources,MedicationIndex(self.chunks,self.sources),variants=[])
 def pair(self,q):
  r=self.index.summary(q);return r,(r['pairs'][0] if r['pairs'] else None)
 def test_drug_listed_only_in_a_combination_is_found_and_listed(self):
  r,_=self.pair('심바스타틴과 아스피린을 복용 중인 환자에게 니르마트렐비르를 추가해도 되나요?')
  self.assertEqual([d['name'] for d in r['drugs']],['심바스타틴','아스피린','니르마트렐비르'])
  p=next(p for p in r['pairs'] if {r['drugs'][p['a']]['name'],r['drugs'][p['b']]['name']}=={'심바스타틴','니르마트렐비르'})
  self.assertEqual(p['status'],'listed') # 니르마트렐비르 never appears as a single agent, so its combination is the drug
  self.assertEqual(p['dur']['records'][0]['combinations'],[])
 def test_a_name_inside_another_name_is_kept_when_written_on_its_own(self):
  r,p=self.pair('트레티노인과 이소트레티노인을 함께 복용해도 되나요?')
  self.assertEqual([d['name'] for d in r['drugs']],['트레티노인','이소트레티노인']);self.assertEqual(p['status'],'listed')
  r,_=self.pair('이소트레티노인을 복용 중입니다');self.assertEqual([d['name'] for d in r['drugs']],['이소트레티노인'])
 def test_combination_only_record_is_not_a_single_agent_contraindication(self):
  r,p=self.pair('에제티미브와 이트라코나졸을 함께 복용해도 되나요?')
  self.assertEqual(p['status'],'combination_only');self.assertFalse(p['dur']['listed']);self.assertEqual(p['dur']['direct'],0)
  self.assertEqual(p['dur']['reasons'],['근병증'])
  self.assertEqual(p['dur']['records'][0]['combinations'],['에제티미브+심바스타틴'])
 def test_a_name_inside_a_word_is_not_a_drug(self):
  r,_=self.pair('항트롬빈과 아미노카프론산을 함께 써도 되나요?')
  self.assertEqual([d['name'] for d in r['drugs']],['아미노카프론산'])
  r,_=self.pair('와파린과아미노카프론산과트롬빈') # particles written without spaces still separate names
  self.assertEqual([d['name'] for d in r['drugs']],['아미노카프론산','트롬빈'])
 def test_quoted_cross_reference_is_not_the_section(self):
  r,p=self.pair('아토르바스타틴과 사이클로스포린')
  m=p['label']['mentions'];self.assertEqual(len(m),1)
  self.assertEqual(m[0]['section'],'5. 일반적 주의');self.assertTrue(m[0]['text'].startswith('2) 이 약과 사이클로스포린'))
 def test_parse_nested_parentheses(self):
  p=parse_pair('[병용금기] 요오드화나트륨(131I)(Sodium Iodide(131I))(단일제)과(와) 아미오다론(Amiodarone)(단일제)은 함께 쓰지 않습니다.')
  self.assertEqual(p['a']['name'],'요오드화나트륨(131I)');self.assertEqual(p['a']['en'],'Sodium Iodide(131I)')
 def test_enzyme_must_be_tied_to_the_drug(self):
  from clinical import linked_enzymes
  self.assertEqual(linked_enzymes('3) 아스피린, CYP2C19 유도제와 병용 시 출혈 위험이 있다.',[(3,7)]),set())
  s='강력한 CYP3A4 억제제(예, 클라리트로마이신)와 병용투여하지 않는다.';i=s.index('클라리')
  self.assertEqual(linked_enzymes(s,[(i,i+8)]),{'CYP3A4'})
  s='클래리트로마이신은 CYP3A4 저해제이다.';self.assertEqual(linked_enzymes(s,[(0,8)]),{'CYP3A4'})
