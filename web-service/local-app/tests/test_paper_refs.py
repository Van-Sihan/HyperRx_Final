import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools'))
from make_paper_refs import initials,apa_authors,journal_title,pages,article_number,apa_text
from evidence import describe_source,source_info,paper_reference

class ApaTests(unittest.TestCase):
 def test_initials_from_forename(self):
  self.assertEqual(initials('Christopher G.','CG'),'C. G.');self.assertEqual(initials('Jean-Pierre','JP'),'J.-P.');self.assertEqual(initials('','AB'),'A. B.')
 def test_author_list_rules(self):
  self.assertEqual(apa_authors(['Kim, A.']),'Kim, A.')
  self.assertEqual(apa_authors(['Kim, A.','Lee, B.']),'Kim, A., & Lee, B.')
  many=[f'A{i}, B.' for i in range(1,23)]
  self.assertEqual(apa_authors(many),', '.join(many[:19])+', . . . A22, B.') # 21+ authors: first 19, ellipsis, last
 def test_journal_title_case(self):
  self.assertEqual(journal_title('American journal of perinatology'),'American Journal of Perinatology')
  self.assertEqual(journal_title('Clinical infectious diseases : an official publication of the Infectious Diseases Society of America'),'Clinical Infectious Diseases')
  self.assertEqual(journal_title('Methods in molecular biology (Clifton, N.J.)'),'Methods in Molecular Biology')
  self.assertEqual(journal_title('American journal of health-system pharmacy'),'American Journal of Health-System Pharmacy')
  self.assertEqual(journal_title('JAMA network open'),'JAMA Network Open')
 def test_pages(self):
  self.assertEqual(pages('1243-50'),'1243–1250');self.assertEqual(pages('e1069-e1074'),'e1069–e1074');self.assertEqual(pages('e0263221'),'Article e0263221')
  self.assertEqual(article_number('afaf300'),'Article afaf300');self.assertEqual(article_number('S0002-9149(23)00123-4'),'')
 def test_reference_text(self):
  r={'kind':'article','authors':'Payne, T. H., & Hines, L. E.','year':'2015','title':'Recommendations to improve the usability of drug-drug interaction clinical decision support alerts.','container':'Journal of the American Medical Informatics Association','volume':'22','issue':'6','pages':'1243–1250','url':'https://doi.org/10.1093/jamia/ocv011'}
  self.assertEqual(apa_text(r),'Payne, T. H., & Hines, L. E. (2015). Recommendations to improve the usability of drug-drug interaction clinical decision support alerts. Journal of the American Medical Informatics Association, 22(6), 1243–1250. https://doi.org/10.1093/jamia/ocv011')
  r2={**r,'authors':''};self.assertTrue(apa_text(r2).startswith('Recommendations to improve the usability of drug-drug interaction clinical decision support alerts. (2015). Journal'))

class SourceNameTests(unittest.TestCase):
 def test_official_public_data_names(self):
  d=describe_source({'source':'dur','feature':'DUR_병용금기'},'[병용금기] 가(Ga)(단일제)과(와) 나(Na)(단일제)은 함께 쓰지 않습니다.')
  self.assertEqual(d['source_label'],'식품의약품안전처_의약품안전사용서비스(DUR)성분정보');self.assertEqual(d['source_operation'],'병용금기 정보조회')
  self.assertEqual(d['source_page'],'https://www.data.go.kr/data/15056780/openapi.do')
  self.assertEqual(source_info('permit')['name'],'식품의약품안전처_의약품 제품 허가정보');self.assertEqual(source_info('permit')['operation'],'의약품 제품 허가 상세정보')
  self.assertEqual(source_info('easy')['name'],'식품의약품안전처_의약품개요정보(e약은요)')
 def test_paper_gets_its_apa_reference(self):
  ref=paper_reference('36452967')
  if not ref:self.skipTest('paper_refs.json not built')
  d=describe_source({'source':'paper','pmid':'36452967'},'Medical Marijuana Legalization in Oklahoma\nAbstract')
  self.assertEqual(d['source_label'],'PubMed');self.assertEqual(d['citation']['container'],'American Journal of Perinatology')
  self.assertTrue(d['citation']['text'].startswith('DeShea, L., Rolfs, S.,'));self.assertIn('https://doi.org/10.1055/a-1990-8311',d['citation']['text'])

if __name__=='__main__':unittest.main()

class OriginTests(unittest.TestCase):
 def test_readable_origin_rows(self):
  from evidence import origin,source_meta
  if not source_meta('DUR-b01c19e544c7eb67807e2f72'):self.skipTest('source_meta.json.gz not built')
  rows=origin('DUR-b01c19e544c7eb67807e2f72')['rows']
  self.assertEqual(rows[0][:2],['원자료','DUR 성분정보 병용금기 파일, 48번째 행']);self.assertIn(['고시일자','2009-03-03',''],rows)
  self.assertIn(['성분코드','D000027 심바스타틴',''],rows);self.assertIn(['성분코드','D000373 클래리트로마이신',''],rows)
  self.assertEqual(origin('DUR-b01c19e544c7eb67807e2f72|DUR-x')['rows'][-1][0],'같은 본문 기록')
  self.assertIsNone(origin('NOT-A-RECORD'))
