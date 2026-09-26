import catalog from './ja.json';

export type TextKey = keyof typeof catalog.messages;
export function t(key: TextKey, values: Record<string,string|number> = {}):string {
  return catalog.messages[key].replace(/\{(\w+)\}/g,(token,name:string)=>
    Object.prototype.hasOwnProperty.call(values,name) ? String(values[name]) : token);
}
export function escapeHtml(value:string):string {
  return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
// Catalog changes remain plain text and cannot introduce markup or scripts.
export function htmlText(key:TextKey, values:Record<string,string|number>={}):string {
  return escapeHtml(t(key,values));
}
