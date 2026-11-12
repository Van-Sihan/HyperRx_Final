import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceTarget} from '../src/evidence-state.js';
test('Adding or completing LLM/RAG does not take over HyperRAG evidence',()=>{
 for(const selection of [['hyperrag'],['hyperrag','llm'],['llm','rag','hyperrag'],['rag','hyperrag']])assert.equal(evidenceTarget(selection),'hyperrag');
});
test('Removing evidence mode falls back, and readding HyperRAG restores automatic priority',()=>{
 assert.equal(evidenceTarget(['llm','rag']),'rag');assert.equal(evidenceTarget(['llm']),null);
 assert.equal(evidenceTarget(['llm','hyperrag']),'hyperrag');assert.equal(evidenceTarget(['rag'],'hyperrag'),'rag');
});
test('Explicit source inspection is independent from answer selection order',()=>{
 assert.equal(evidenceTarget(['hyperrag','rag','llm'],'rag'),'rag');assert.equal(evidenceTarget(['hyperrag','llm'],'rag'),'hyperrag');
 assert.equal(evidenceTarget(['llm','rag'],'llm'),'rag');
});
