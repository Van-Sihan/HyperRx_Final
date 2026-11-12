// Answer selection and evidence navigation are separate state.
export function evidenceTarget(selected, requested='auto') {
  if(requested!=='auto' && requested!=='llm' && selected.includes(requested)) return requested;
  return ['hyperrag','rag'].find(mode=>selected.includes(mode)) || null;
}
