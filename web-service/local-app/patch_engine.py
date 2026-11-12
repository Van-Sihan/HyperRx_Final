from pathlib import Path
root=Path(__file__).resolve().parent
p=root/'vendor/Hyper-RAG/hyperrag/operate.py'
s=p.read_text(encoding='utf-8')
if '# galYAKsi: return retrieval evidence without a second generation' not in s:
 s=s.replace('    context = combine_contexts(relation_context.get("context"), entity_context.get("context"))','    entity_context = entity_context or {}\n    relation_context = relation_context or {}\n    context = combine_contexts(relation_context.get("context"), entity_context.get("context"))')
 # Applies to hyper / hyper-stream context-return branch. Generation stays in Node.
 s=s.replace('    if query_param.only_need_context:\n        return context\n    if context is None:', '    if query_param.only_need_context:\n        # galYAKsi: return retrieval evidence without a second generation\n        return {**contextJson, "context": context or ""} if query_param.return_type == "json" else context\n    if context is None:')
 start=s.index('async def naive_query(');end=s.index('async def llm_query(',start)
 part=s[start:end].replace('    if not len(results):\n        return PROMPTS["fail_response"]','    if not len(results):\n        return {"context": "", "text_units": []} if query_param.return_type == "json" else PROMPTS["fail_response"]')
 part=part.replace('        return section','        return {"context": section, "text_units": [{"content": c["content"]} for c in maybe_trun_chunks]} if query_param.return_type == "json" else section')
 s=s[:start]+part+s[end:]
 p.write_text(s,encoding='utf-8')
print('Engine evidence-return patch ready')
