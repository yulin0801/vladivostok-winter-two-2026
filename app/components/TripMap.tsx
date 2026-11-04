'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { PlacePoint } from '../lib/types';
import 'leaflet/dist/leaflet.css';

interface Props { points:PlacePoint[]; selectedId?:string|null; onSelect?:(id:string)=>void; onPick?:(lat:number,lng:number)=>void; route?:{type:'LineString';coordinates:number[][]}|null; routeMode?:'walking'|'driving'; }
const colors:Record<string,string>={'景点':'#216977','美食':'#d37c5b','酒店':'#766a9b','交通':'#73866a'};
export default function TripMap({points,selectedId,onSelect,onPick,route,routeMode='walking'}:Props){
  const el=useRef<HTMLDivElement>(null); const map=useRef<Leaflet.Map|null>(null); const L=useRef<typeof Leaflet|null>(null);
  const markers=useRef<Leaflet.LayerGroup|null>(null); const routeLayer=useRef<Leaflet.Layer|null>(null);
  const callbacks=useRef({onSelect,onPick}); callbacks.current={onSelect,onPick};
  const [ready,setReady]=useState(false); const [tileError,setTileError]=useState(false); const [loadError,setLoadError]=useState(false);
  const signature=JSON.stringify(points.map(p=>[p.id,p.name,p.lat,p.lng,p.category,p.index]));
  useEffect(()=>{if(ready&&map.current){if(onPick)map.current.doubleClickZoom.disable();else map.current.doubleClickZoom.enable();}},[ready,!!onPick]);
  useEffect(()=>{let stopped=false; let resize:ResizeObserver|undefined;
    import('leaflet').then(mod=>{if(stopped||!el.current)return; const lib=(mod.default||mod) as typeof Leaflet; L.current=lib;
      const m=lib.map(el.current,{zoomControl:false,attributionControl:true,doubleClickZoom:!callbacks.current.onPick}).setView([43.116,131.885],13);map.current=m;
      lib.control.zoom({position:'bottomright'}).addTo(m);
      const tile=lib.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(m);
      tile.on('tileerror',()=>setTileError(true)); tile.on('tileload',()=>setTileError(false));
      m.on('dblclick',(e:Leaflet.LeafletMouseEvent)=>callbacks.current.onPick?.(e.latlng.lat,e.latlng.lng));
      markers.current=lib.layerGroup().addTo(m);resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(el.current);setReady(true);
    }).catch(()=>setLoadError(true));
    return()=>{stopped=true;resize?.disconnect();map.current?.remove();map.current=null;setReady(false)};
  },[]);
  useEffect(()=>{if(!ready||!L.current||!map.current||!markers.current)return;const lib=L.current;markers.current.clearLayers();
    for(const p of points){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng))continue;const active=p.id===selectedId;const color=colors[p.category||'景点']||'#216977';
      const marker=lib.marker([p.lat,p.lng],{icon:lib.divIcon({className:'trip-pin-wrap',html:`<span class="trip-pin${active?' is-selected':''}" style="--pin-color:${color}">${p.index!==undefined?p.index+1:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>'}</span>`,iconSize:[34,42],iconAnchor:[17,37]}),title:p.name,keyboard:true,zIndexOffset:active?1000:0});
      const label=document.createElement('span');label.textContent=p.name;marker.bindTooltip(label,{direction:'top',offset:[0,-35],className:'trip-map-tooltip'});marker.on('click',()=>callbacks.current.onSelect?.(p.id));marker.addTo(markers.current);
    }
  },[ready,signature,selectedId]);
  const fitted=useRef(false);
  useEffect(()=>{if(ready&&map.current&&points.length&&!fitted.current){const valid=points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));if(valid.length){map.current.fitBounds(valid.map(p=>[p.lat,p.lng] as [number,number]),{padding:[42,42],maxZoom:14});fitted.current=true;}}},[ready,signature]);
  useEffect(()=>{const p=points.find(p=>p.id===selectedId);if(p&&ready&&map.current)map.current.flyTo([p.lat,p.lng],Math.max(14,map.current.getZoom()),{duration:.6});},[selectedId,ready]);
  const routeSignature=JSON.stringify(route);
  useEffect(()=>{if(!ready||!map.current||!L.current)return;if(routeLayer.current){map.current.removeLayer(routeLayer.current);routeLayer.current=null;}if(route?.coordinates?.length){const line=L.current.polyline(route.coordinates.map(c=>[c[1],c[0]] as [number,number]),{color:'#1b6472',weight:5,opacity:.85,dashArray:routeMode==='walking'?'7 7':undefined});line.addTo(map.current);routeLayer.current=line;map.current.fitBounds(line.getBounds(),{padding:[40,40],maxZoom:15});}},[ready,routeSignature,routeMode]);
  return <div className="trip-map-shell" style={{position:'relative',width:'100%',height:'100%',minHeight:360,isolation:'isolate'}}>
    <div ref={el} style={{width:'100%',height:'100%',minHeight:360,background:'#e4ece8'}} aria-label="海参崴交互地图，可缩放、选择地点" />
    {(!ready||loadError)&&<div className="map-loading" style={{position:'absolute',inset:0,display:'grid',placeContent:'center',background:'#e4ece8',color:'#37606a',zIndex:450}}>{loadError?'地图暂时无法加载，请刷新重试':'正在展开海参崴地图…'}</div>}
    {tileError&&<div style={{position:'absolute',bottom:42,left:12,right:60,zIndex:450,background:'#fff8e9',padding:10,borderRadius:10,fontSize:12}}>地图底图暂时无法连接，已保存的地点仍可从列表查看。</div>}
    {onPick&&ready&&<span style={{position:'absolute',bottom:24,left:12,zIndex:450,background:'rgba(255,255,255,.92)',borderRadius:7,padding:'6px 10px',fontSize:11,color:'#49616a'}}>双击地图 · 标记新地点</span>}
    <style>{`.trip-pin-wrap{background:none;border:0}.trip-pin{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:var(--pin-color);border:3px solid white;box-shadow:0 3px 10px #123b4b35;color:white;font-size:12px;font-weight:700}.trip-pin>svg{transform:rotate(45deg)}.trip-pin.is-selected{outline:5px solid #21697732;scale:1.15}.trip-pin:not(:has(svg)){transform:none;border-radius:50%}.trip-map-tooltip{border:0!important;border-radius:8px!important;font-family:inherit!important;padding:7px 10px!important}.leaflet-container{font-family:inherit!important}.leaflet-control-attribution{font-size:9px!important}.leaflet-control-zoom{border:0!important;box-shadow:0 2px 12px #123b4b20!important}.leaflet-control-zoom a{color:#175b65!important;border-color:#e3e9e4!important}`}</style>
  </div>;
}
