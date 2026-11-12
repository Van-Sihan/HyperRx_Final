// 약물 개수 → 검색 방식 (2026-11-10). The reader sets the drug count with the slider in the question bar (the question's own
// drugs set it first, while it is typed), and the count sets the method: 1·2제 RAG, 3제 이상 HyperRAG. There is no other way
// to choose. HyperRx 팀 평가 (본실행 v2, 135문항, 2026-11-02~04, 3회 평균 정답 일치): 1제 RAG 93.3 · HyperRAG 84.4,
// 2제 87.4 · 72.6, 3제 48.9 · 72.6. Questions of four drugs or more were not in it; they follow the three-drug result.
export const METHODS=['rag','hyperrag'];
export const METHOD_NAMES={rag:'RAG',hyperrag:'HyperRAG'};
export const EVALUATED={1:{rag:93.3,hyperrag:84.4},2:{rag:87.4,hyperrag:72.6},3:{rag:48.9,hyperrag:72.6}};
// The slider's stops: 1, 2 and 3 (3제 이상).
export const clampCount=n=>Math.min(3,Math.max(1,Math.round(Number(n))||1));
export const countLabel=n=>clampCount(n)>=3?'3제 이상':`${clampCount(n)}제`;
// No drug found (only drug classes such as NSAIDs, or names the DB does not know): null, and the slider stays where it is.
export function recommended(count){const n=Number(count)||0;return n>=3?'hyperrag':n>=1?'rag':null;}
// A review built from 복용 중인 약 and 새로 추가할 약 counts its own drugs: three or more are answered with HyperRAG.
export function reviewMethod(meds,added){
 const count=new Set([...(meds||[]),added].map(x=>String(x||'').trim()).filter(Boolean)).size;
 return {method:recommended(count)||'hyperrag',count:Math.max(count,1)};
}
