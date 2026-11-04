'use client';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || '';
if (apiOrigin && (new URL(apiOrigin).protocol !== 'https:' || new URL(apiOrigin).origin !== apiOrigin)) {
  throw new Error('The trip API must use a fixed HTTPS origin.');
}
export function publicAssetUrl(path: string) { return `${basePath}${path}`; }
export function getShareUrl(){return typeof window==='undefined'?'':`${window.location.origin}${basePath}/`;}
export function apiFetch(input:string,init:RequestInit={}){
  if(!input.startsWith('/api/'))throw new Error('Only trip API calls are allowed.');
  const headers=new Headers(init.headers);
  try{const editor=window.localStorage.getItem('trip-editor');if(editor)headers.set('X-Trip-Editor',encodeURIComponent(editor));}catch{}
  return fetch(`${apiOrigin}${input}`,{...init,headers,cache:'no-store',credentials:apiOrigin?'omit':'same-origin'});
}
