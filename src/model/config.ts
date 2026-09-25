export const MODEL_ID = 'jiting/xlm-roberta-ner-japanese_onnx';
export const LOCAL_ONLY = import.meta.env.VITE_MODEL_SOURCE === 'local';
export function appBase(): string { return new URL(import.meta.env.BASE_URL, location.href).href; }
