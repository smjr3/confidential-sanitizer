import type { Candidate, Method } from './types';

/** Refresh only the requested detection methods and preserve the user's decisions. */
export function mergeCandidates(previous: Candidate[], incoming: Candidate[], replaceMethods: Method[]): Candidate[] {
  const oldById=new Map(previous.map(item=>[item.id,item]));
  const replacing=new Set(replaceMethods);
  const next=new Map(previous.filter(item=>!replacing.has(item.method)).map(item=>[item.id,item]));
  for (const item of incoming) {
    const old=oldById.get(item.id);
    next.set(item.id,old ? {...item,enabled:old.enabled,category:old.category,replacement:old.replacement} : item);
  }
  return [...next.values()].sort((a,b)=>a.start-b.start || b.end-a.end);
}
