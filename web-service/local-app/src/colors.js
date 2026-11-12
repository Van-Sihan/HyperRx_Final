// One color rule for 2D and 3D.
// - A relation (hyperedge) keeps its palette color: palette[colorIndex % palette.length].
// - An entity in exactly one shown relation takes that relation's color.
// - An entity shared by several shown relations is neutral (one fill, no split color ring: the ring was too busy, and mixing
//   the colors would create a new color that belongs to no relation). Its relations show through the colored areas around it.
// - An entity in no shown relation is neutral.
export const SHARED_CORE={light:'#5d6d84',dark:'#d5deea'};
export const relationColor=(edge,index,palette)=>palette[(edge.colorIndex??index)%palette.length];
export function entityColors(data,palette){
 const colors=new Map(data.nodes.map(n=>[n.id,[]]));
 data.hyperedges.forEach((edge,i)=>{const c=relationColor(edge,i,palette);for(const id of new Set(edge.members))colors.get(id)?.push(c);});
 return colors;
}
