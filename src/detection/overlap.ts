import type { Candidate } from './types';

/** Accept candidates in priority order. Compressed intervals avoid pairwise scans. */
export function selectNonOverlapping(sorted: Candidate[]): Candidate[] {
  const accepted: Candidate[]=[];
  if (sorted.length < 64) {
    for (const item of sorted) if (!accepted.some(c=>c.start<item.end && item.start<c.end)) accepted.push(item);
    return accepted;
  }
  const points=[...new Set(sorted.flatMap(c=>[c.start,c.end]))].sort((a,b)=>a-b);
  const positions=new Map(points.map((point,index)=>[point,index]));
  const tree=new Int32Array(points.length+1);
  const sum=(end:number) => { let total=0; for(let i=end;i>0;i-=i&-i) total+=tree[i]; return total; };
  for (const item of sorted) {
    const start=positions.get(item.start)!;
    const end=positions.get(item.end)!;
    if (sum(end)!==sum(start)) continue;
    accepted.push(item);
    // Accepted ranges never overlap, so every compressed segment is marked at most once.
    for(let segment=start;segment<end;segment++) for(let i=segment+1;i<tree.length;i+=i&-i) tree[i]++;
  }
  return accepted;
}
