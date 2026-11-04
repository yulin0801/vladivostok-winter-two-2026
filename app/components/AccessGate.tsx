'use client';
import {useEffect,useState} from 'react';
import {apiFetch} from '../lib/client-access';
export default function AccessGate({children}:{children:React.ReactNode}){
  return children;
}
export function AuthImage({src,alt,...props}:React.ImgHTMLAttributes<HTMLImageElement> & {src:string}){
  const [url,setUrl]=useState('');const [failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;let objectUrl='';const controller=new AbortController();setFailed(false);setUrl('');if(!src.startsWith('/api/files/')){setUrl(src);return;}
    apiFetch(src,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('image unavailable');return r.blob()}).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setFailed(true)});
    return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[src]);
  if(failed)return <div className={props.className} style={{...props.style,display:'grid',placeItems:'center',background:'#edf1eb',color:'#788b87',fontSize:12}}>图片暂时无法加载</div>;
  if(!url)return <div className={props.className} style={{...props.style,background:'#edf1eb'}} aria-label="图片加载中"/>;
  return <img {...props} src={url} alt={alt||'旅行照片'} loading="lazy"/>;
}

