// Medication names for the chatbot2 dashboard.
// The DB server returns retrieval.matched_aliases as alias groups, one group per drug found in the question,
// e.g. [["clarithromycin","클래리트로마이신"],["simvastatin","심바스타틴"]]. A group is one drug, never one name.

export const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'');

// Accepts the raw matched_aliases value and returns clean, non-empty groups of strings.
export function aliasGroups(raw){
 return (Array.isArray(raw)?raw:[]).map(group=>[...new Set((Array.isArray(group)?group:[group]).map(x=>String(x??'').trim()).filter(Boolean))]).filter(group=>group.length);
}

// The name shown for a group: the Korean alias when there is one, otherwise the first alias.
export function displayName(group){return group.find(x=>/[가-힣]/.test(x))||group[0]||'';}

// Every alias of the drug a typed name belongs to, or just that name when the server found no group for it.
export function aliasesFor(name,groups){const k=norm(name);return groups.find(group=>group.some(a=>norm(a)===k))||[name];}

// Drugs found in the question that are not already listed under any of their aliases, one display name per drug.
export function foundMedications(groups,listed){
 const taken=new Set(listed.map(norm).filter(Boolean));
 return groups.filter(group=>!group.some(a=>taken.has(norm(a)))).map(displayName);
}

const DRUG_TYPE=/ACTIVE_INGREDIENT|DRUG_PRODUCT|DRUG_CLASS|약물|성분|제품/i;
const bare=s=>norm(String(s||'').replace(/\([^)]*\)/g,''));
// What may follow a drug name in a salt or hydrate form, after spaces are removed:
// "클로피도그렐황산수소염", "클로피도그렐나파디실레이트일수화물", "아토르바스타틴 칼슘", "CLOPIDOGREL BISULFATE".
// Words that merely end in 염 ("와파린 유발 피부염") do not qualify: a Korean salt ends in 산염 / 산수소염 / 실레이트.
const SALT_KO=/^(?:[가-힣]{1,6}(?:산|산수소)염|[가-힣]{1,6}실레이트|나트륨|칼륨|칼슘|마그네슘)?(?:(?:일|이|삼|반)?수화물)?$/;
const SALT_EN=/^(?:hydrochloride|hcl|sulfate|bisulfate|hydrogensulfate|besylate|besilate|maleate|mesylate|mesilate|tartrate|citrate|fumarate|succinate|sodium|potassium|calcium|magnesium)?(?:monohydrate|dihydrate|trihydrate|hydrate)?$/;
const saltOf=(label,keys)=>{const l=norm(label);return [...keys].some(k=>{const rest=l.startsWith(k)?l.slice(k.length):'';return !!rest&&(SALT_KO.test(rest)||SALT_EN.test(rest));});};

// Nodes that stand for the drugs the question asks about, for emphasis on the map.
// A node counts when its label is one of the drug's aliases (also after dropping a parenthetical, "심바스타틴(SIMVASTATIN)")
// or a salt/hydrate form of it. Partial matches such as "와파린 장기복용 환자" or "심바스타틴 40 MG" do not count; only when a
// drug has neither do its drug-typed partial matches stand in for it. Spelling variants ("와르파린") need the alias data.
export function keyNodeIds(names,groups,g){
 const ids=new Set();if(!g)return ids;
 for(const name of names){
  const keys=new Set(aliasesFor(name,groups).map(norm).filter(k=>k.length>=2));if(!keys.size)continue;
  const exact=g.nodes.filter(n=>keys.has(norm(n.label))||keys.has(bare(n.label))||saltOf(n.label,keys));
  for(const n of exact.length?exact:nodesMatching([...keys],g).filter(n=>DRUG_TYPE.test(n.type||'')))ids.add(n.id);
 }
 return ids;
}

// Graph nodes whose label equals or contains (or is contained in) any of the given names.
export function nodesMatching(names,g){
 const keys=[].concat(names).map(norm).filter(k=>k.length>=2);
 if(!keys.length||!g)return [];
 return g.nodes.filter(n=>{const l=norm(n.label);return keys.some(k=>l===k||(l.length>=2&&(l.includes(k)||k.includes(l))));});
}
