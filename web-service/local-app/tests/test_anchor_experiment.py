import sys, copy, asyncio, unittest
from pathlib import Path
APP = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP)); sys.path.insert(0, str(APP / "experiments"))
from anchor_metrics import gold_segments, gold_level, evidence_hit, retrieval_row, summarize_retrieval, summarize_answers
from evidence import MedicationIndex

FLU = '[임부금기] 대상 성분은 플루다라빈(Fludarabine)(단일제)입니다. 임부 금기 등급: 2등급.'
OTHER = '[노인주의] 대상 성분은 플루라제팜(Flurazepam)(단일제)입니다.'
REF = "함께 쓰면 위험하거나 주의가 필요하므로 '위험'으로 판단합니다. 수준: 금기. 핵심 위험: 임부 금기 2등급. 근거: [임부금기] 대상 성분은 플루다라빈(Fludarabine)(단일제)입니다. / 임부 금기 등급: 2등급.\n결론: 위험"


class MetricTests(unittest.TestCase):
    def test_gold_parsing_matches_reference_format(self):
        self.assertEqual(gold_segments(REF), ['[임부금기] 대상 성분은 플루다라빈(Fludarabine)(단일제)입니다.', '임부 금기 등급: 2등급.'])
        self.assertEqual(gold_level(REF), '금기')
        self.assertEqual(gold_segments("DB에 이 조합을 판단할 근거가 없으므로 판단을 보류합니다.\n결론: 보류"), [])

    def test_evidence_hit_ignores_whitespace_only(self):
        segs = gold_segments(REF)
        self.assertEqual(evidence_hit(segs, {'text_units': [{'content': FLU.replace(' ', '\n')}]}), 1.0)
        self.assertEqual(evidence_hit(segs, {'text_units': [{'content': OTHER}]}), 0.0)
        self.assertIsNone(evidence_hit([], {'text_units': [{'content': FLU}]}))

    def test_rows_and_summary(self):
        q = {'qid': 'Q1-01', 'stage': 1, 'question': '플루다라빈 임부', 'reference': REF, 'gold_verdict': '위험'}
        raw = {'text_units': [{'content': OTHER}], 'hyperedges': [{}, {}], 'entities': []}
        anchored = {'text_units': [{'content': FLU}], 'hyperedges': [], 'entities': [], 'retrieval': {'strategy': 'exact-medication-anchor', 'matched_aliases': [['fludarabine', '플루다라빈']]}}
        rows = [retrieval_row(q, 'naive', raw, anchored, 1.0), retrieval_row(q, 'hyper', raw, copy.deepcopy(anchored), 1.0)]
        self.assertTrue(rows[0]['triggered']); self.assertEqual(rows[0]['overlap_raw_anchor'], 0.0)
        s = summarize_retrieval(rows, {(1, 'naive'): 0.5})
        self.assertEqual(s['1제|naive']['근거포함률_원래'], 0.0); self.assertEqual(s['1제|naive']['근거포함률_가공'], 1.0)
        self.assertEqual(s['1제|naive']['본실행_기록_근거포함률'], 0.5)
        self.assertEqual(s['1제|RAG-Hyper']['원문겹침_가공'], 1.0)

    def test_answer_summary_rates(self):
        gold = {'Q1': {'stage': 1, 'gold_verdict': '위험', 'level': '금기'}, 'Q2': {'stage': 1, 'gold_verdict': '안전', 'level': None}}
        rows = [{'qid': 'Q1', 'mode': 'rag', 'condition': 'raw', 'assessment': '주의', 'citationStats': {'sentences': 4, 'cited': 3, 'uncited': 1, 'invalidRefs': 0}},
                {'qid': 'Q2', 'mode': 'rag', 'condition': 'raw', 'assessment': '금기', 'citationStats': None},
                {'qid': 'Q1', 'mode': 'rag', 'condition': 'anchor', 'error': 'x'}]
        s = summarize_answers(rows, gold)
        self.assertEqual(s['1제|rag|raw']['위험문항_위험판단률'], 1.0); self.assertEqual(s['1제|rag|raw']['위험문항_수준일치율'], 0.0)
        self.assertEqual(s['1제|rag|raw']['안전문항_과잉경고율'], 1.0); self.assertEqual(s['1제|rag|raw']['근거번호_문장비율'], 0.75)
        self.assertEqual(s['1제|rag|anchor']['오류'], 1)


try:
    import db_server
except Exception as e:  # vendor/Hyper-RAG 또는 Python 패키지가 없는 환경
    db_server = None
    SKIP = f'db_server import 불가: {type(e).__name__}'


class FakeHypergraph:
    async def get_hyperedge(self, members):
        return {'source_id': 'a'}


class FakeKV:
    def __init__(self, data): self._data = data


class FakeRag:
    def __init__(self, chunks):
        self.text_chunks = FakeKV(chunks); self.chunk_entity_relation_hypergraph = FakeHypergraph()


@unittest.skipIf(db_server is None, SKIP if db_server is None else '')
class FinalizeTests(unittest.TestCase):
    def setUp(self):
        import hashlib
        chunks = {'a': {'content': FLU}, 'b': {'content': OTHER}}
        sources = {cid: {'chunk_id': cid, 'source': 'dur', 'record_ids': 'r'} for cid in chunks}
        db_server.state.clear()
        db_server.state.update(rag=FakeRag(chunks), sources=sources, verified={'version': 'test-db'},
                               content_ids={hashlib.sha256(v['content'].encode()).hexdigest(): k for k, v in chunks.items()},
                               medications=MedicationIndex(chunks, sources))
        self.result = {'context': OTHER, 'text_units': [{'id': 0, 'content': OTHER}],
                       'hyperedges': [{'entity_set': ['플루라제팜', '노인'], 'description': OTHER}], 'entities': [{'entity_name': '플루라제팜'}]}

    def test_same_retrieval_split_into_two_conditions(self):
        q = '플루다라빈을 임부에게 써도 되나요?'
        raw = asyncio.run(db_server.finalize(q, copy.deepcopy(self.result), 'hyper', anchor=False))
        anchored = asyncio.run(db_server.finalize(q, copy.deepcopy(self.result), 'hyper', anchor=True))
        self.assertEqual([d['id'] for d in raw['text_units']], ['b']); self.assertEqual(len(raw['hyperedges']), 1)
        self.assertFalse(raw['anchor']); self.assertNotIn('retrieval', raw)
        self.assertEqual([d['id'] for d in anchored['text_units']], ['a']); self.assertEqual(anchored['hyperedges'], [])
        self.assertEqual(anchored['retrieval']['strategy'], 'exact-medication-anchor'); self.assertTrue(anchored['anchor'])
        self.assertEqual(raw['hyperedges'][0]['provenance']['database'], 'test-db')


if __name__ == '__main__':
    unittest.main()
