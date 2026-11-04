"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Bookmark, CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Cloud, CloudOff, Compass, Copy, Download, ExternalLink, Gift, Heart, Hotel, ListChecks, Loader2, MapPin, Map as MapIcon, MoreHorizontal, Navigation, NotebookPen, Pencil, Plane, Plus, Search, ShoppingBag, Snowflake, Sparkles, Luggage as Suitcase, Trash2, Upload, Users, Utensils, Waves, X } from 'lucide-react';
import TripMap from './components/TripMap';
import type { PlacePoint, RecordItem, RecordType } from './lib/types';
import { apiFetch, getShareUrl, publicAssetUrl } from './lib/client-access';
import { AuthImage } from './components/AccessGate';
import { hasDraftContent, hasLocation, hasNumber, hotelTotal, rebaseDraft, recordTitle } from './components/record-draft';

type Tab = 'map' | 'days' | 'notes' | 'packing' | 'food' | 'hotels' | 'gifts';
type SearchPlace = PlacePoint & { subtitle?: string };
type Editor = { type: RecordType; record?: RecordItem; data: any; baseline: Record<string, unknown> };
type RoadRoute = { geometry: { type: 'LineString'; coordinates: number[][] }; distance: number; duration: number; order: string[]; signature: string; mode: 'walking' | 'driving' };
const DAYS = ['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09'];
const WEEKDAYS = ['周六', '周日', '周一', '周二', '周三'];
const PEOPLE = ['崔天琴', '张渝琳'];
const PROFILES: Record<string, { nickname: string; photo: string }> = {
  '崔天琴': { nickname: '小脆', photo: publicAssetUrl('/avatars/xiaocui.jpg') },
  '张渝琳': { nickname: '小鱼', photo: publicAssetUrl('/avatars/xiaoyu.jpg') },
};
const NAV: { id: Tab; title: string; subtitle: string; icon: typeof MapIcon }[] = [
  { id: 'map', title: '地图探索', subtitle: '把向往的地方，放进地图', icon: MapIcon },
  { id: 'days', title: '每日行程', subtitle: '留一点计划，也留一点随性', icon: CalendarDays },
  { id: 'notes', title: '共同备忘', subtitle: '出发前的小事，一起记好', icon: NotebookPen },
  { id: 'packing', title: '双人行李', subtitle: '一个目的地，两只行李箱', icon: Suitcase },
  { id: 'food', title: '想吃的美食', subtitle: '用一顿好饭，认识一座城', icon: Utensils },
  { id: 'hotels', title: '酒店比较', subtitle: '挑一个冬夜里温暖的落脚点', icon: Hotel },
  { id: 'gifts', title: '伴手礼', subtitle: '把一点海参崴，带回日常', icon: Gift },
];
const money = (value: any, currency = 'RUB') => value === '' || value === undefined || value === null ? '价格待记录' : `${currency === 'RUB' ? '₽' : '¥'} ${Number(value).toLocaleString('zh-CN')}`;
const shortDay = (day: string) => day ? `${Number(day.slice(5, 7))}.${Number(day.slice(8))}` : '未安排';
const pointOf = (r: RecordItem, index?: number): PlacePoint => ({ id: r.id, name: recordTitle(r), lat: Number(r.data.lat), lng: Number(r.data.lng), category: r.type === 'hotel' ? '酒店' : r.type === 'restaurant' ? '美食' : r.data.category, index });
const safeUrl = (url: string) => /^https?:\/\//i.test(url || '') ? url : '';
const yandex = (r: RecordItem) => `https://yandex.com/maps/?${hasLocation(r) ? `ll=${r.data.lng}%2C${r.data.lat}&z=16&pt=${r.data.lng}%2C${r.data.lat}%2Cpm2rdm` : `text=${encodeURIComponent(`${r.data.ruName || r.data.name || r.data.address || ''} Владивосток`)}`}`;
const signature = (list: RecordItem[]) => list.map(r => `${r.id}:${r.data.lat},${r.data.lng}`).join('|');

async function request(url: string, options?: RequestInit): Promise<any> {
  const response = await apiFetch(url, { cache: 'no-store', ...options });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 409 ? '这条记录刚刚被修改了。已刷新最新内容，请检查后重新保存。' : data.error || '暂时无法连接，请稍后再试。') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

function defaults(type: RecordType, overrides: any = {}) {
  const data: Record<string, any> = {
    place: { name: '', ruName: '', lat: '', lng: '', category: '景点', day: '', order: Date.now(), time: '', duration: '', note: '', visited: false },
    note: { text: '', category: '出发前', done: false },
    packing: { text: '', owner: '', category: '其他', done: false },
    restaurant: { name: '', ruName: '', address: '', lat: '', lng: '', cuisine: '', price: '', currency: 'RUB', note: '', url: '', visited: false },
    hotel: { name: '', address: '', lat: '', lng: '', price: '', currency: 'RUB', nights: '', images: [], url: '', note: '', status: '备选' },
    gift: { name: '', quantity: '', price: '', currency: 'RUB', buyer: '一起', note: '', done: false },
    settings: { startDate: DAYS[0], endDate: DAYS[4], outbound: '', inbound: '' },
  };
  return { ...data[type], ...overrides };
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}><header className="modal-header"><div><span className="eyebrow">OUR TRAVEL JOURNAL</span><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={21} /></button></header>{children}</div></div>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}</label>; }
function Empty({ icon: Icon = Bookmark, title, text, action }: { icon?: typeof Bookmark; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-illustration"><Icon size={29} strokeWidth={1.4} /></div><h3>{title}</h3><p>{text}</p>{action}</div>; }

export default function TripApp() {
  const [tab, setTab] = useState<Tab>('map');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [sync, setSync] = useState<'loading' | 'saved' | 'error' | 'saving'>('loading');
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecordItem | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPlace[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState('全部');
  const [day, setDay] = useState(DAYS[0]);
  const [mode, setMode] = useState<'walking' | 'driving'>('walking');
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [noteFilter, setNoteFilter] = useState('全部');
  const [quickText, setQuickText] = useState<Record<string, string>>({});
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<SearchPlace[] | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [editorName, setEditorName] = useState('旅行伙伴');
  const uploadBusy = useRef(false);
  const touchedFields = useRef(new Set<string>());
  const mutationBusy = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const serial = ++generation.current;
    try {
      const data = await request('/api/records');
      if (serial !== generation.current) return data.records as RecordItem[];
      setRecords(data.records); setLoadError('');
      if (!mutationBusy.current) setSync('saved');
      return data.records as RecordItem[];
    } catch (e: any) {
      if (serial === generation.current) { setSync('error'); setLoadError(e.message); }
      if (!quiet) throw e;
      return undefined;
    }
  }, []);
  useEffect(() => {
    try { setEditorName(localStorage.getItem('trip-editor') || '旅行伙伴'); } catch {}
    void load(true);
    const timer = setInterval(() => { if (!document.hidden && !mutationBusy.current) void load(true); }, 12000);
    const focus = () => { if (!document.hidden && !mutationBusy.current) void load(true); };
    document.addEventListener('visibilitychange', focus);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', focus); };
  }, [load]);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 5000); return () => clearTimeout(id); } }, [toast]);
  useEffect(() => { setRoute(null); setRouteError(''); }, [day, mode]);
  const places = useMemo(() => records.filter(r => r.type === 'place'), [records]);
  const restaurants = useMemo(() => records.filter(r => r.type === 'restaurant'), [records]);
  const hotels = useMemo(() => records.filter(r => r.type === 'hotel'), [records]);
  const notes = useMemo(() => records.filter(r => r.type === 'note'), [records]);
  const packing = useMemo(() => records.filter(r => r.type === 'packing'), [records]);
  const unassignedPacking = packing.filter(r => !PEOPLE.includes(r.data.owner));
  const gifts = useMemo(() => records.filter(r => r.type === 'gift'), [records]);
  const dayPlaces = useMemo(() => places.filter(r => r.data.day === day).sort((a, b) => Number(a.data.order || 0) - Number(b.data.order || 0) || a.id.localeCompare(b.id)), [places, day]);
  const locatedDayPlaces = dayPlaces.filter(hasLocation);
  const daySignature = signature(locatedDayPlaces);
  const visibleRoute = route?.signature === daySignature && route.mode === mode ? route : null;
  const allSavedRecords = [...places, ...restaurants, ...hotels];
  const allMapRecords = allSavedRecords.filter(hasLocation);
  const mapRecords = allSavedRecords.filter(r => category === '全部' || pointOf(r).category === category);
  const selectedRecord = records.find(r => r.id === selectedId);
  const activeNav = NAV.find(n => n.id === tab)!;
  const settings = records.find(r => r.type === 'settings');

  const mutate = async (operation: () => Promise<any>) => {
    mutationBusy.current = true; setSync('saving');
    try { const result = await operation(); await load(); setSync('saved'); return result; }
    catch (e) { setSync('error'); await load(true); throw e; }
    finally { mutationBusy.current = false; }
  };
  const create = (type: RecordType, data: any) => mutate(() => request('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, data }) }));
  const update = (record: RecordItem, data: any) => mutate(() => request(`/api/records/${encodeURIComponent(record.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, version: record.version }) }));
  const act = async (fn: () => Promise<any>, message?: string) => { try { await fn(); if (message) setToast(message); } catch (e: any) { setToast(e.message); } };
  const closeEditor = useCallback(() => { if (!mutationBusy.current && !uploadBusy.current) { setEditor(null); setFormError(''); } }, []);
  const openEditor = (type: RecordType, record?: RecordItem, data?: any) => { touchedFields.current = new Set(); const initial = defaults(type, record?.data || data || {}); setEditor({ type, record, data: initial, baseline: structuredClone(initial) }); setFormError(''); setLocationQuery(''); setLocationResults(null); };
  const setData = (key: string, value: any) => { touchedFields.current.add(key); setEditor(e => e ? { ...e, data: { ...e.data, [key]: value } } : e); };

  async function saveEditor(event: FormEvent) {
    event.preventDefault(); if (!editor || saving || uploading) return;
    const data: Record<string, any> = Object.fromEntries(Object.entries(editor.data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
    if (!hasDraftContent(data, touchedFields.current, !!editor.record)) { setFormError('先填任意一项，或上传一张照片，就可以保存；其他内容可以以后补。'); return; }
    if (data.url && !safeUrl(data.url)) { setFormError('链接需要以 https:// 或 http:// 开头。'); return; }
    for (const key of ['lat', 'lng', 'price', 'quantity', 'nights', 'duration', 'order']) {
      if (data[key] === '' || data[key] === undefined || data[key] === null) { delete data[key]; continue; }
      data[key] = Number(data[key]);
      if (!Number.isFinite(data[key])) { setFormError('数字格式不正确，请检查价格和坐标。'); return; }
    }
    for (const key of Object.keys(data)) if (typeof data[key] === 'string') { data[key] = data[key].trim(); if (!data[key]) delete data[key]; }
    setSaving(true); setFormError('');
    try { if (editor.record) await update(editor.record, data); else await create(editor.type, data); setEditor(null); setToast('已保存到你们的旅行空间'); }
    catch (e: any) {
      setFormError(e.message);
      // Keep the draft; use the latest revision only after the user reviews it and saves again.
      if (e.status === 409 && editor.record) {
        const latest = await load(true); const fresh = latest?.find(r => r.id === editor.record!.id);
        if (fresh) setEditor(current => {
          if (!current) return current;
          const latestBaseline = defaults(current.type, fresh.data);
          return { ...current, record: fresh, data: rebaseDraft(current.baseline, current.data, latestBaseline), baseline: structuredClone(latestBaseline) };
        });
      }
    } finally { setSaving(false); }
  }
  async function findPlaces(event?: FormEvent, insideModal = false) {
    event?.preventDefault(); const q = (insideModal ? locationQuery : query).trim(); if (!q) return;
    insideModal ? setLocationLoading(true) : setSearching(true);
    insideModal ? setFormError('') : setSearchError('');
    const localMatches: SearchPlace[] = allMapRecords.filter(r => `${recordTitle(r)} ${r.data.ruName || ''} ${r.data.address || ''}`.toLowerCase().includes(q.toLowerCase())).map(r => ({ ...pointOf(r), subtitle: r.data.ruName || r.data.address || '已收藏地点' }));
    if (localMatches.length) (insideModal ? setLocationResults : setSearchResults)(localMatches);
    try {
      const data = await request(`/api/search?q=${encodeURIComponent(q)}`);
      const results = [...localMatches, ...(data.results as SearchPlace[]).filter(p => !localMatches.some(l => Math.abs(l.lat - p.lat) < .0003 && Math.abs(l.lng - p.lng) < .0003))];
      insideModal ? setLocationResults(results) : setSearchResults(results);
      if (!results.length) (insideModal ? setFormError : setSearchError)('没有找到。可以试试俄文或英文名称，也可以在地图上手动标记。');
    } catch (e: any) { if (!localMatches.length) (insideModal ? setFormError : setSearchError)(e.message); }
    finally { insideModal ? setLocationLoading(false) : setSearching(false); }
  }
  function chooseSearch(place: SearchPlace) {
    const existing = records.find(r => r.id === place.id);
    if (existing) { setCategory('全部'); setSelectedId(existing.id); setSearchResults(null); return; }
    openEditor('place', undefined, { name: place.name, lat: place.lat, lng: place.lng, note: place.subtitle || '' });
  }
  function addToDay(record: RecordItem, targetDay = day) {
    if (record.type === 'place') { openEditor('place', record); setEditor(current => current ? { ...current, data: { ...current.data, day: targetDay, order: Date.now() } } : current); }
    else openEditor('place', undefined, { name: record.data.name, ruName: record.data.ruName || '', lat: record.data.lat ?? '', lng: record.data.lng ?? '', category: record.type === 'hotel' ? '酒店' : '美食', day: targetDay, note: record.data.note || '' });
  }
  async function copyAddress(record: RecordItem) {
    const value = record.data.ruName || record.data.address || record.data.name;
    if (!value) { setToast('这条记录还没有名称或地址，可以稍后补充。'); return; }
    try { await navigator.clipboard.writeText(value); setToast('已复制，可给司机或店员查看'); }
    catch { setToast('复制未成功，请直接长按选择地址。'); }
  }
  async function quickAdd(type: 'packing' | 'note', key: string, extra: any = {}) {
    const text = quickText[key]?.trim(); if (!text) return;
    try { await create(type, defaults(type, { text, ...extra })); setQuickText(q => ({ ...q, [key]: '' })); }
    catch (e: any) { setToast(e.message); }
  }
  async function movePlace(record: RecordItem, delta: number) {
    const i = dayPlaces.findIndex(r => r.id === record.id), other = dayPlaces[i + delta]; if (!other) return;
    const ordered = [...dayPlaces]; [ordered[i], ordered[i + delta]] = [ordered[i + delta], ordered[i]];
    await act(async () => {
      await mutate(() => request('/api/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: ordered.map((item, order) => ({ id: item.id, version: item.version, order })) }) })); setRoute(null);
    });
  }
  async function calculateRoute(optimize: boolean) {
    if (optimize && locatedDayPlaces.length !== dayPlaces.length) { setRouteError('有地点尚未填写完整位置。补好位置后，就可以一起优化路线。'); return; }
    if (locatedDayPlaces.length < 2 || routing) return;
    setRouting(true); setRouteError(''); setRoute(null);
    try {
      const data = await request('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: locatedDayPlaces.map(r => pointOf(r)), optimize, mode }) });
      let ordered = locatedDayPlaces;
      if (optimize) {
        ordered = data.order.map((id: string) => locatedDayPlaces.find(r => r.id === id)).filter(Boolean);
        if (ordered.length !== locatedDayPlaces.length) throw new Error('路线结果不完整，请稍后重试。');
        await mutate(() => request('/api/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: ordered.map((item, order) => ({ id: item.id, version: item.version, order })) }) }));
        setToast('已按道路路线调整顺序；出发与结束地点保留，请复核各站时间');
      }
      setRoute({ ...data, signature: signature(ordered), mode });
    } catch (e: any) { setRouteError(e.message); }
    finally { setRouting(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    uploadBusy.current = true; setUploading(true); setFormError('');
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('请选择不超过 4 MB 的图片。');
      const body = new FormData(); body.append('file', file);
      const data = await request('/api/upload', { method: 'POST', body });
      setEditor(e => e ? { ...e, data: { ...e.data, images: [...(e.data.images || []), data.url] } } : e);
    } catch (e: any) { setFormError(e.message); }
    finally { uploadBusy.current = false; setUploading(false); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ title: '去海的另一边', exportedAt: new Date().toISOString(), records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = '海参崴-双人旅行备份.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('已导出旅行记录备份');
  }
  const editActions = (record: RecordItem) => <div className="card-actions"><button className="icon-button" aria-label={`编辑${recordTitle(record)}`} onClick={() => openEditor(record.type, record)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`删除${recordTitle(record)}`} onClick={() => setDeleteTarget(record)}><Trash2 size={15} /></button></div>;
  const pageHeader = (eyebrow: string, title: string, text: string, action?: ReactNode) => <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>{action}</div>;
  const addButton = (type: RecordType, text: string) => <button className="button primary" onClick={() => openEditor(type)}><Plus size={17} />{text}</button>;

  return <div className="travel-app can-edit">
    <aside className="sidebar">
      <button className="brand" onClick={() => setTab('map')} aria-label="返回地图主页"><span className="brand-icon"><Waves size={25} /></span><span><b>去海的另一边</b><small>OUR WINTER ESCAPE</small></span></button>
      <div className="sidebar-destination"><span className="eyebrow">NEXT DESTINATION</span><strong>海参崴 <span>·</span> Владивосток</strong><div><Snowflake size={13} /> 2026 冬日旅行</div></div>
      <nav aria-label="旅行手册导航">{NAV.map(({ id, title, icon: Icon }) => <button key={id} aria-label={title} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setPickMode(false); }}><Icon size={19} strokeWidth={1.7} /><span>{title}</span>{id === 'notes' && notes.filter(r => !r.data.done).length > 0 && <small>{notes.filter(r => !r.data.done).length}</small>}{id === 'map' && <span className="active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="travel-stamp"><Compass size={36} strokeWidth={1} /><span>43°07′ N · 131°54′ E</span><strong>一起出发，就很好。</strong><p>从日常出发，去海风里见面。</p></div><button className="sidebar-link" onClick={exportData} disabled={!records.length}><Download size={15} />导出旅行记录</button><button className="sidebar-link" onClick={() => setShowInfo(true)}><Users size={15} />关于这个共享空间</button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>我们的旅行</span><ChevronRight size={14} /><strong>{activeNav.title}</strong></div><div className="topbar-right"><button className={`sync-state ${sync === 'error' ? 'failed' : ''}`} onClick={() => void load(true)} title="点击刷新；页面打开时每 12 秒同步"><span>{sync === 'error' ? <CloudOff size={15} /> : sync === 'loading' || sync === 'saving' ? <Loader2 size={15} className="spin" /> : <Cloud size={15} />}</span><span>{sync === 'error' ? '同步失败' : sync === 'loading' ? '正在连接' : sync === 'saving' ? '正在保存' : '云端已同步'}</span></button><span className="access-label">人人可编辑</span><button className="share-button" onClick={() => setShowShare(true)}><Users size={15} /><span>分享</span></button><span className="top-divider" /><button className="avatars" onClick={() => setShowInfo(true)} aria-label="小脆（崔天琴）和小鱼（张渝琳），查看协作设置">{PEOPLE.map(person => <span key={person} title={`${PROFILES[person].nickname} · ${person}`}><img src={PROFILES[person].photo} alt={`${PROFILES[person].nickname}的头像`} /></span>)}</button></div></header>
      <main>
        {loadError && <div className="connection-banner" role="alert"><CloudOff size={17} /><span>{loadError} 当前页面可能不是最新记录。</span><button onClick={() => void load(true)}>重试</button></div>}
        {tab === 'map' && <>
          {pageHeader('VLADIVOSTOK · WINTER 2026', '海参崴，等我们来。', '沿着海湾慢慢走，把想去的地方都收藏在这里。', <div className="trip-date"><CalendarDays size={20} /><div><b>12.05 <span>—</span> 12.09</b><small>2026 · 5 天 4 晚</small></div></div>)}
          <div className="trip-ribbon"><span><Plane size={16} />去程 <b>12.05 · {settings?.data.outbound || '时间待补充'}</b></span><span><Plane size={16} className="plane-home" />返程 <b>12.09 · {settings?.data.inbound || '时间待补充'}</b></span><button onClick={() => setTab('days')}>查看行程<ArrowRight size={15} /></button></div>
          <div className="explore-toolbar"><form className="search-box" onSubmit={e => void findPlaces(e)}><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索景点、餐厅、酒店 · 可用俄文 / 英文" aria-label="搜索海参崴地点" /><button type="submit" disabled={searching || !query.trim()}>{searching ? <Loader2 size={17} className="spin" /> : '搜索'}</button></form><button className={`button subtle ${pickMode ? 'selected' : ''}`} onClick={() => setPickMode(p => !p)}><MapPin size={16} />{pickMode ? '取消标记' : '手动标记'}</button></div>
          {searchError && <p className="inline-error" role="alert">{searchError}</p>}
          {searchResults && <div className="search-results-panel"><div className="section-top"><h3>搜索结果 <span>{searchResults.length}</span></h3><button className="icon-button" aria-label="关闭搜索结果" onClick={() => setSearchResults(null)}><X size={17} /></button></div>{searchResults.map((place, i) => <button key={`${place.id}-${i}`} className="search-result" onClick={() => chooseSearch(place)}><MapPin size={17} /><span><b>{place.name}</b><small>{place.subtitle}</small></span><Plus size={18} /></button>)}<p className="tiny-text">搜索由 Photon / OpenStreetMap 提供。请核对地点；中文没找到时试试俄文。</p></div>}
          <div className="map-heading"><div className="chips">{['全部', '景点', '美食', '酒店', '交通'].map(c => <button key={c} className={category === c ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>{c}</button>)}</div><span className="map-count"><Bookmark size={14} />{allMapRecords.length} 个已标记地点</span></div>
          <div className="explore-grid"><div className={`map-frame ${pickMode ? 'picking' : ''}`}><TripMap points={mapRecords.filter(hasLocation).map(r => pointOf(r))} selectedId={selectedId} onSelect={setSelectedId} onPick={pickMode ? (lat, lng) => { openEditor('place', undefined, { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }); setPickMode(false); } : undefined} />{pickMode ? <div className="map-caption pick-caption"><MapPin size={16} />双击地图，标记你们想去的位置</div> : <div className="map-caption"><span className="live-dot" />我们的海参崴收藏地图<span>Владивосток</span></div>}</div>
          <section className="saved-panel"><div className="saved-heading"><div><span className="eyebrow">THE WISHLIST</span><h2>想去的地方 <span>{mapRecords.length}</span></h2></div><button className="icon-button outlined" aria-label="新增地图地点" onClick={() => openEditor('place')}><Plus size={18} /></button></div><div className="saved-list">{mapRecords.length === 0 ? <Empty title="下一站，由你标记" text="搜索一个名字，或直接点选地图。" /> : mapRecords.map((record, i) => <article key={record.id} className={`saved-place ${selectedId === record.id ? 'selected' : ''}`}><button className="place-main" onClick={() => setSelectedId(record.id)}><span className={`place-number category-${pointOf(record).category}`}>{String(i + 1).padStart(2, '0')}</span><span><strong>{recordTitle(record)}</strong><small>{record.data.ruName || record.data.address || (hasLocation(record) ? `${Number(record.data.lat).toFixed(3)}° N · ${Number(record.data.lng).toFixed(3)}° E` : '位置待补充 · 先收藏，稍后定位')}</small><span className="place-tags"><i>{pointOf(record).category}</i>{record.data.day && <i className="day-tag">{shortDay(record.data.day)}</i>}</span></span></button>{selectedId === record.id && <div className="place-expanded">{record.data.note && <p>{record.data.note}</p>}{safeUrl(record.data.sourceUrl) && <a className="tiny-text text-link" href={record.data.sourceUrl} target="_blank" rel="noreferrer">地点资料 <ExternalLink size={12} /></a>}<div className="place-links"><button onClick={() => addToDay(record)}><CalendarDays size={13} />安排行程</button><button aria-label="编辑地点" onClick={() => openEditor(record.type, record)}><Pencil size={14} /></button><a href={yandex(record)} target="_blank" rel="noreferrer" aria-label="在 Yandex 地图打开"><ExternalLink size={14} /></a></div></div>}</article>)}</div><div className="saved-footer"><Heart size={14} />先收藏喜欢的，再慢慢安排。</div></section></div>
          <div className="map-bottom-note"><Compass size={16} /><span>地图负责找到方向，你们负责发现惊喜。</span><button onClick={() => setTab('days')}>开始安排每天行程 <ArrowRight size={14} /></button></div>
        </>}

        {tab === 'days' && <>
          {pageHeader('FIVE DAYS BY THE SEA', '把五天，过成喜欢的样子。', '初始路线是可调整的建议，开放时间待确认 · 行程使用海参崴当地时间', <button className="button primary" onClick={() => openEditor('place', undefined, { day })}><Plus size={17} />添加行程地点</button>)}
          <div className="day-tabs">{DAYS.map((d, i) => <button key={d} className={day === d ? 'active' : ''} onClick={() => setDay(d)}><span>DAY {String(i + 1).padStart(2, '0')}</span><strong>12.{5 + i} <small>{WEEKDAYS[i]}</small></strong><span>{i === 0 ? '出发，向海而行' : i === 4 ? '带着回忆返程' : `${places.filter(r => r.data.day === d).length} 个计划地点`}</span></button>)}</div>
          {(day === DAYS[0] || day === DAYS[4]) && <div className="flight-card"><span className="flight-icon"><Plane size={23} /></span><div><strong>{day === DAYS[0] ? '抵达海参崴' : '准备返程'} <span>航班已订</span></strong><p>{day === DAYS[0] ? '抵达后预留入境和进城时间，适合安排入住与晚餐。航班起降均按机票各机场当地时间记录。' : '请结合机票起飞时刻、机场要求、实际交通与天气，提前留出值机和前往机场的时间。'}</p></div><b>{day === DAYS[0] ? settings?.data.outbound || '时间待补充' : settings?.data.inbound || '时间待补充'}</b></div>}
          <div className="itinerary-grid"><section className="itinerary-panel"><div className="section-top"><div><h2>{shortDay(day)} 的路线</h2><p>可调整先后顺序与每站停留时间</p></div><span className="count-pill">{dayPlaces.length} 站</span></div>{dayPlaces.length === 0 ? <Empty icon={Navigation} title="今天想从哪里开始？" text="从地图收藏中选择地点，串起属于你们的一天。" action={<button className="button secondary" onClick={() => setTab('map')}>去地图挑选<ArrowRight size={15} /></button>} /> : <div className="timeline">{dayPlaces.map((record, i) => <article key={record.id} className="timeline-item"><div className="timeline-marker">{i + 1}</div><div className="timeline-content"><div className="timeline-title"><h3>{recordTitle(record)}</h3><button className="icon-button" aria-label={`编辑${recordTitle(record)}行程`} onClick={() => openEditor('place', record)}><Pencil size={14} /></button></div><p className="russian-name">{record.data.ruName || record.data.category}</p><div className="time-tags"><span>{record.data.time || '时间待定'}</span><span>{hasNumber(record.data.duration) ? `停留 ${record.data.duration} 分钟` : '停留时间待定'}</span></div>{record.data.note && <p className="timeline-note">{record.data.note}</p>}<div className="timeline-controls"><a href={yandex(record)} target="_blank" rel="noreferrer"><Navigation size={13} />打开地图</a><div><button className="icon-button" aria-label="向前移动" disabled={i === 0 || routing} onClick={() => void movePlace(record, -1)}><ArrowUp size={14} /></button><button className="icon-button" aria-label="向后移动" disabled={i === dayPlaces.length - 1 || routing} onClick={() => void movePlace(record, 1)}><ArrowDown size={14} /></button><button className="icon-button" aria-label="移出当天行程" disabled={routing} onClick={() => void act(() => update(record, { ...record.data, day: '' }), '已移出当天，地点仍保留在地图里')}><X size={14} /></button></div></div></div></article>)}</div>}<button className="add-dashed edit-only" onClick={() => openEditor('place', undefined, { day })}><Plus size={17} />再加一站</button></section>
          <section className="route-panel"><div className="route-toolbar"><div className="segmented"><button className={mode === 'walking' ? 'active' : ''} disabled={routing} onClick={() => setMode('walking')}>步行</button><button className={mode === 'driving' ? 'active' : ''} disabled={routing} onClick={() => setMode('driving')}>驾车 / 打车</button></div><button className="text-button" onClick={() => void calculateRoute(false)} disabled={routing || locatedDayPlaces.length < 2}>{routing ? <Loader2 size={15} className="spin" /> : <Navigation size={15} />}查看路线</button></div><div className="day-map"><TripMap points={locatedDayPlaces.map((r, i) => pointOf(r, dayPlaces.findIndex(item => item.id === r.id)))} selectedId={selectedId} onSelect={setSelectedId} route={visibleRoute?.geometry || null} routeMode={mode} /></div><div className="route-summary">{visibleRoute ? <><div><span>道路总里程</span><strong>{(visibleRoute.distance / 1000).toFixed(1)} <small>km</small></strong></div><div><span>{mode === 'walking' ? '步行' : '驾车'}时间估算</span><strong>{Math.ceil(visibleRoute.duration / 60)} <small>分钟</small></strong></div><p>不含停留 · 模型估算，非实时路况</p></> : <p className="route-placeholder">{locatedDayPlaces.length < 2 ? '添加至少两个地点，就能查看道路路线。' : '点击「查看路线」，检查地点之间的道路与距离。'}</p>}</div><div className="optimize-box"><div><Sparkles size={19} /><span><b>少绕一点路，多留一点时间</b><small>保留起点与终点，按道路距离优化中间顺序。</small></span></div><button className="button primary" onClick={() => void calculateRoute(true)} disabled={routing || locatedDayPlaces.length < 3 || locatedDayPlaces.length > 10 || locatedDayPlaces.length !== dayPlaces.length}>{routing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}优化路线</button></div>{locatedDayPlaces.length !== dayPlaces.length && <p className="tiny-text" style={{padding:"0 20px"}}>还有 {dayPlaces.length - locatedDayPlaces.length} 站位置待补充；路线只包含已定位的地点，补好后可优化完整行程。</p>}{locatedDayPlaces.length > 10 && <p className="inline-error">每次支持最多 10 个地点，请把行程分段安排。</p>}{routeError && <p className="inline-error" role="alert">{routeError}</p>}<p className="routing-credit">道路数据 © OpenStreetMap · 路线由 OSRM / FOSSGIS 提供。冬季路面与营业情况请当天确认。<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">反馈地图问题</a></p></section></div>
          {places.some(r => !r.data.day) && <section className="unplanned"><div className="section-top"><h3>还没安排的收藏</h3><span>{places.filter(r => !r.data.day).length} 个</span></div><div className="unplanned-list">{places.filter(r => !r.data.day).map(r => <button key={r.id} onClick={() => addToDay(r)}><MapPin size={14} />{recordTitle(r)}<Plus size={14} /></button>)}</div></section>}
        </>}

        {tab === 'notes' && <>
          {pageHeader('LITTLE THINGS, ALL REMEMBERED', '小事记在这里，安心去旅行。', '证件、通信、换汇、预约……一起把出发前的事情准备好。', addButton('note', '添加备忘'))}
          <div className="summary-banner"><span className="summary-icon"><ListChecks size={25} /></span><div><strong>{notes.filter(r => r.data.done).length} / {notes.length} 项已完成</strong><p>每准备好一件小事，就离出发更近一点。</p></div><div className="progress-track"><span style={{ width: `${notes.length ? notes.filter(r => r.data.done).length / notes.length * 100 : 0}%` }} /></div></div>
          <div className="chips margin-bottom">{['全部', '待完成', '已完成'].map(n => <button key={n} className={noteFilter === n ? 'chip active' : 'chip'} onClick={() => setNoteFilter(n)}>{n}</button>)}</div><section className="checklist-card"><form className="quick-add edit-only" onSubmit={e => { e.preventDefault(); void quickAdd('note', 'notes'); }}><Plus size={18} /><input placeholder="记下一件需要准备的小事…" aria-label="快速添加备忘" value={quickText.notes || ''} onChange={e => setQuickText(q => ({ ...q, notes: e.target.value }))} /><button className="button secondary" type="submit">添加</button></form>{notes.filter(r => noteFilter === '全部' || (noteFilter === '已完成' ? r.data.done : !r.data.done)).map(r => <div key={r.id} className={`check-row ${r.data.done ? 'done' : ''}`}><button className="check-control" aria-label={`${r.data.done ? '取消完成' : '标记完成'}：${recordTitle(r)}`} onClick={() => void act(() => update(r, { ...r.data, done: !r.data.done }))}>{r.data.done ? <CheckCircle2 size={23} /> : <Circle size={23} />}</button><div className="check-content"><strong>{recordTitle(r)}</strong><span className="mini-tag">{r.data.category || '出发前'}</span></div>{editActions(r)}</div>)}{!notes.length && <Empty icon={NotebookPen} title="想到什么，就记下来" text="这里是你们共同的出发前备忘录。" />}</section>
        </>}

        {tab === 'packing' && <>
          {pageHeader('TWO SUITCASES, ONE ADVENTURE', '你带什么，我都看得见。', '各自整理，也能互相照应。共用物品写清楚由谁携带，避免重复。')}
          <div className="packing-board">{PEOPLE.map((person, index) => { const list = packing.filter(r => r.data.owner === person), done = list.filter(r => r.data.done).length; return <section className={`packing-column person-${index}`} key={person}><div className="person-heading"><div className="person-avatar"><img src={PROFILES[person].photo} alt={`${PROFILES[person].nickname}（${person}）的头像`} /></div><div><span className="eyebrow">SUITCASE {String(index + 1).padStart(2, '0')}</span><h2>{PROFILES[person].nickname}<small className="person-real-name">{person}</small></h2><p>{done} / {list.length} 件已装好</p></div><Suitcase size={37} strokeWidth={1.2} className="suitcase-drawing" /></div><div className="progress-track"><span style={{ width: `${list.length ? done / list.length * 100 : 0}%` }} /></div><form className="packing-quick edit-only" onSubmit={e => { e.preventDefault(); void quickAdd('packing', person, { owner: person }); }}><input aria-label={`添加${person}的行李`} placeholder="还需要带什么？" value={quickText[person] || ''} onChange={e => setQuickText(q => ({ ...q, [person]: e.target.value }))} /><button className="icon-button" type="submit" aria-label={`添加到${person}的行李`}><Plus size={19} /></button></form><div className="packing-items">{list.map(r => <div className={`packing-item ${r.data.done ? 'done' : ''}`} key={r.id}><button className="check-control" aria-label={`${r.data.done ? '未装好' : '已装好'}：${recordTitle(r)}`} onClick={() => void act(() => update(r, { ...r.data, done: !r.data.done }))}>{r.data.done ? <CheckCircle2 size={21} /> : <Circle size={21} />}</button><button className="packing-item-name" onClick={() => openEditor('packing', r)}><strong>{recordTitle(r)}</strong><small>{r.data.category || '其他'}</small></button><button className="icon-button delete-packing" aria-label={`删除${recordTitle(r)}`} onClick={() => setDeleteTarget(r)}><X size={14} /></button></div>)}{!list.length && <p className="packing-empty">空空的箱子，等待出发。</p>}</div><button className="add-dashed edit-only" onClick={() => openEditor('packing', undefined, { owner: person })}><Plus size={15} />添加行李</button></section>; })}</div>
          {unassignedPacking.length > 0 && <section className="checklist-card" style={{marginTop:20,padding:'20px 24px'}} aria-labelledby="unassigned-packing-title"><div className="section-top"><div><h3 id="unassigned-packing-title">尚未分配的行李</h3><p>先记下来，稍后选择谁来带。</p></div><span className="count-pill">{unassignedPacking.length} 件</span></div>{unassignedPacking.map(r => <div key={r.id} className={`check-row ${r.data.done ? 'done' : ''}`}><button className="check-control" aria-label={`${r.data.done ? '取消完成' : '标记完成'}：${recordTitle(r)}`} onClick={() => void act(() => update(r, { ...r.data, done: !r.data.done }))}>{r.data.done ? <CheckCircle2 size={23} /> : <Circle size={23} />}</button><div className="check-content"><strong>{recordTitle(r)}</strong><span className="mini-tag">{r.data.category || '其他'}</span></div><button className="text-button" onClick={() => openEditor('packing', r)}>选择归属</button><button className="icon-button danger-hover" aria-label={`删除${recordTitle(r)}`} onClick={() => setDeleteTarget(r)}><Trash2 size={15} /></button></div>)}</section>}
          <div className="gentle-note"><Snowflake size={18} /><span>冬日行李小提醒：保暖层、防风外套、帽子手套、防滑鞋，以及充电与常用护理用品。</span></div>
        </>}

        {tab === 'food' && <>
          {pageHeader('A TASTE OF VLADIVOSTOK', '下一顿，想吃点什么？', '收藏餐厅、记录人均，也给偶然发现的小店留一个位置。', addButton('restaurant', '收藏餐厅'))}
          <div className="collection-summary"><span><Utensils size={16} />{restaurants.length} 家想吃</span><span><CheckCircle2 size={16} />{restaurants.filter(r => r.data.visited).length} 家已打卡</span><span>地址可以一键复制给司机</span></div>
          {!restaurants.length ? <div className="empty-card"><Empty icon={Utensils} title="让第一家餐厅成为期待" text="粘贴收藏链接，记下位置和人均。添加位置后，它也会出现在主页地图。" action={addButton('restaurant', '记下一家想吃的店')} /></div> : <div className="food-grid">{restaurants.map((r, i) => <article className="food-card" key={r.id}><div className={`food-cover cover-${i % 3}`}><Utensils size={43} strokeWidth={1} /><span>{r.data.cuisine || '一顿值得期待的饭'}</span><button className={r.data.visited ? 'visited-button active' : 'visited-button'} onClick={() => void act(() => update(r, { ...r.data, visited: !r.data.visited }))}><Check size={13} />{r.data.visited ? '已打卡' : '想去吃'}</button></div><div className="food-body"><div className="card-title-row"><h2>{recordTitle(r)}</h2>{editActions(r)}</div>{r.data.ruName && <p className="russian-name">{r.data.ruName}</p>}<div className="food-meta"><span><MapPin size={14} />{r.data.address || '地址待补充'}</span><strong>{money(r.data.price, r.data.currency)}<small> / 人</small></strong></div>{r.data.note && <p className="card-note">{r.data.note}</p>}<div className="card-bottom"><button className="text-button" onClick={() => addToDay(r)}><CalendarDays size={14} />加入行程</button><div><button className="icon-button" aria-label="复制餐厅地址" onClick={() => void copyAddress(r)}><Copy size={15} /></button><a className="icon-button" href={safeUrl(r.data.url) || yandex(r)} target="_blank" rel="noreferrer" aria-label="打开餐厅链接"><ExternalLink size={15} /></a></div></div></div></article>)}</div>}
        </>}

        {tab === 'hotels' && <>
          {pageHeader('A WARM PLACE TO COME BACK TO', '选一扇，面向海的窗。', '把候选放在一起，比较价格、位置和喜欢的理由。', <div className="heading-actions"><button className="button secondary" onClick={() => setShowComparison(v => !v)} disabled={!hotels.length}>{showComparison ? '卡片视图' : '并排比较'}</button>{addButton('hotel', '记录酒店')}</div>)}
          <div className="hotel-note"><Hotel size={17} /><span>价格按你们记录的币种与晚数计算，不自动换汇；实际房价与余房以预订页面为准。</span></div>
          {!hotels.length ? <div className="empty-card"><Empty icon={Hotel} title="把心动的酒店，先收进来" text="价格、位置、环境图片、预订链接，一个地方就能比较。" action={addButton('hotel', '添加第一个候选')} /></div> : showComparison ? <div className="comparison-wrap"><table className="comparison-table"><thead><tr><th>比较项目</th>{hotels.map(r => <th key={r.id}><strong>{recordTitle(r)}</strong><button className="text-button" onClick={() => openEditor('hotel', r)}>编辑<Pencil size={13} /></button></th>)}</tr></thead><tbody>{[['每晚', (r: RecordItem) => money(r.data.price, r.data.currency)], ['入住晚数', (r: RecordItem) => hasNumber(r.data.nights) ? `${r.data.nights} 晚` : '晚数待记录'], ['预计总价', (r: RecordItem) => hotelTotal(r) === undefined ? '价格或晚数待记录' : money(hotelTotal(r), r.data.currency)], ['位置', (r: RecordItem) => r.data.address || '待补充'], ['选择状态', (r: RecordItem) => r.data.status || '备选'], ['环境与备注', (r: RecordItem) => r.data.note || '待记录']].map(([label, fn]) => <tr key={String(label)}><td>{String(label)}</td>{hotels.map(r => <td key={r.id}>{(fn as (r: RecordItem) => string)(r)}</td>)}</tr>)}<tr><td>预订链接</td>{hotels.map(r => <td key={r.id}>{safeUrl(r.data.url) ? <a className="text-link" href={r.data.url} target="_blank" rel="noreferrer">查看详情 <ExternalLink size={13} /></a> : '待添加'}</td>)}</tr></tbody></table></div> : <div className="hotel-grid">{hotels.map(r => <article className="hotel-card" key={r.id}><div className="hotel-image">{r.data.images?.length ? <AuthImage src={r.data.images[0]} alt={`${recordTitle(r)}环境照片`} /> : <><Hotel size={42} strokeWidth={1} /><span>还没有环境照片</span></>}<span className={`hotel-status ${r.data.status === '已订' ? 'booked' : ''}`}>{r.data.status || '备选'}</span>{r.data.images?.length > 1 && <span className="image-count">{r.data.images.length} 张照片</span>}</div><div className="hotel-body"><div className="card-title-row"><h2>{recordTitle(r)}</h2>{editActions(r)}</div><p className="address-line"><MapPin size={14} />{r.data.address || '地址待补充'}</p><div className="hotel-price"><strong>{money(r.data.price, r.data.currency)}<small> / 晚</small></strong><span>{hasNumber(r.data.nights) ? `${r.data.nights} 晚合计 ` : '晚数待记录 · '}{hotelTotal(r) === undefined ? '价格或晚数待记录' : money(hotelTotal(r), r.data.currency)}</span></div>{r.data.note && <p className="card-note">{r.data.note}</p>}<div className="card-bottom"><button className="text-button" onClick={() => { if (hasLocation(r)) { setTab('map'); setCategory('酒店'); setSelectedId(r.id); } else openEditor('hotel', r); }}><MapPin size={14} />查看位置</button><a className="text-link" href={safeUrl(r.data.url) || yandex(r)} target="_blank" rel="noreferrer">{safeUrl(r.data.url) ? '预订页面' : '地图搜索'}<ExternalLink size={14} /></a></div></div></article>)}</div>}
        </>}

        {tab === 'gifts' && <>
          {pageHeader('BRING A LITTLE JOY HOME', '把旅途的喜欢，带回家。', '给自己，也给惦记的人。记好想买什么、买给谁，慢慢挑。', addButton('gift', '添加伴手礼'))}
          <div className="summary-banner gifts-banner"><span className="summary-icon"><ShoppingBag size={25} /></span><div><strong>{gifts.filter(r => r.data.done).length} / {gifts.length} 件已买到</strong><p>清单里的每一件，都装着一点心意。</p></div><div className="gift-totals">{['RUB', 'CNY'].map(c => { const items = gifts.filter(r => r.data.currency === c && hasNumber(r.data.price) && hasNumber(r.data.quantity)); return items.length > 0 ? <span key={c}>{money(items.reduce((a, r) => a + Number(r.data.price) * Number(r.data.quantity), 0), c)}<small> 已填价格与数量的预算</small></span> : null; })}</div></div>
          {!gifts.length ? <div className="empty-card"><Empty icon={Gift} title="从一份小小的心意开始" text="记录名称、数量、预算和购买人，到了当地就不用临时回想。" action={addButton('gift', '写下想带回去的东西')} /></div> : <div className="gift-grid">{gifts.map(r => <article key={r.id} className={`gift-card ${r.data.done ? 'done' : ''}`}><div className="gift-card-top"><span className="gift-symbol"><Gift size={24} strokeWidth={1.5} /></span>{editActions(r)}</div><h2>{recordTitle(r)}</h2><div className="gift-meta"><span>{hasNumber(r.data.quantity) ? `× ${r.data.quantity}` : '数量待记录'}</span><span>{r.data.buyer || '一起'} 负责</span><span>{money(r.data.price, r.data.currency)} / 件</span></div>{r.data.note && <p>{r.data.note}</p>}<button className={`gift-check ${r.data.done ? 'active' : ''}`} onClick={() => void act(() => update(r, { ...r.data, done: !r.data.done }))}>{r.data.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}{r.data.done ? '已经买到啦' : '还在愿望清单里'}</button></article>)}</div>}
        </>}
        <footer className="page-footer"><span>崔天琴 & 张渝琳 · 我们的冬日旅行手册</span><span>VLADIVOSTOK, WITH YOU.</span></footer>
      </main>
    </div>

    {editor && <Modal title={`${editor.record ? '编辑' : '添加'}${({ place: '想去的地点', note: '共同备忘', packing: '行李物品', restaurant: '想吃的餐厅', hotel: '候选酒店', gift: '伴手礼', settings: '旅行信息' })[editor.type]}`} subtitle="所有内容都选填，先记任意一项或上传照片，其余以后再补。" onClose={closeEditor}><form className="edit-form" onSubmit={saveEditor}>
      <div className="form-grid">
        {['place', 'restaurant', 'hotel', 'gift'].includes(editor.type) && <Field label="名称（选填）" wide><input maxLength={200} value={editor.data.name || ''} onChange={e => setData('name', e.target.value)} placeholder={editor.type === 'hotel' ? '酒店名称' : '给这份期待起个名字'} /></Field>}
        {['note', 'packing'].includes(editor.type) && <Field label="内容（选填）" wide><input maxLength={500} value={editor.data.text || ''} onChange={e => setData('text', e.target.value)} placeholder={editor.type === 'packing' ? '例如：防风手套' : '例如：购买流量卡'} /></Field>}
        {['note', 'packing', 'place'].includes(editor.type) && <Field label="分类"><select value={editor.data.category || ''} onChange={e => setData('category', e.target.value)}>{(editor.type === 'place' ? ['景点', '美食', '酒店', '交通'] : editor.type === 'note' ? ['出发前', '证件', '通信', '交通', '预订', '住宿', '行程', '其他'] : ['证件', '衣物', '洗护', '电子', '药品', '日用', '共用', '其他']).map(v => <option key={v}>{v}</option>)}</select></Field>}
        {editor.type === 'packing' && <Field label="放进谁的行李箱"><select value={editor.data.owner || ''} onChange={e => setData('owner', e.target.value)}><option value="">暂不分配</option>{PEOPLE.map(p => <option key={p} value={p}>{PROFILES[p].nickname} · {p}</option>)}</select></Field>}
        {['place', 'restaurant'].includes(editor.type) && <Field label="俄文名称"><input maxLength={200} value={editor.data.ruName || ''} onChange={e => setData('ruName', e.target.value)} placeholder="方便地图搜索与问路" /></Field>}
        {editor.type === 'place' && <><Field label="安排在哪一天"><select value={editor.data.day || ''} onChange={e => setData('day', e.target.value)}><option value="">先收藏，还没决定</option>{DAYS.map((d, i) => <option key={d} value={d}>12.{i + 5} · {WEEKDAYS[i]}</option>)}</select></Field><Field label="计划到达时间"><input type="time" value={editor.data.time || ''} onChange={e => setData('time', e.target.value)} /></Field><Field label="预计停留（分钟）"><input type="number" min={5} max={1440} step={5} value={editor.data.duration ?? ''} onChange={e => setData('duration', e.target.value)} /></Field></>}
        {editor.type === 'restaurant' && <Field label="想吃什么 / 菜系"><input maxLength={200} value={editor.data.cuisine || ''} onChange={e => setData('cuisine', e.target.value)} placeholder="例如：海鲜、俄餐、咖啡" /></Field>}
        {['restaurant', 'hotel'].includes(editor.type) && <Field label="详细地址" wide><input maxLength={500} value={editor.data.address || ''} onChange={e => setData('address', e.target.value)} placeholder="可以粘贴俄文地址" /></Field>}
        {['place', 'restaurant', 'hotel'].includes(editor.type) && <div className="location-form field-wide"><label>在地图上定位（选填）</label><div className="location-search"><input aria-label="查找地点坐标" value={locationQuery} onChange={e => setLocationQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void findPlaces(undefined, true); } }} placeholder="输入地点名，搜索后选择" /><button type="button" className="button secondary" disabled={locationLoading || !locationQuery.trim()} onClick={() => void findPlaces(undefined, true)}>{locationLoading ? <Loader2 size={15} className="spin" /> : <Search size={15} />}搜索</button></div>{locationResults && <div className="location-results">{locationResults.map((p, i) => <button type="button" key={`${p.id}-${i}`} onClick={() => { setEditor(e => e ? { ...e, data: { ...e.data, name: e.data.name || p.name, lat: p.lat, lng: p.lng, ...(['hotel', 'restaurant'].includes(e.type) ? { address: e.data.address || p.subtitle || '' } : {}) } } : e); setLocationResults(null); setLocationQuery(p.name); }}><MapPin size={14} /><span><b>{p.name}</b><small>{p.subtitle}</small></span></button>)}</div>}<div className="coordinate-fields"><Field label="纬度 Latitude"><input type="number" step="any" min={-90} max={90} value={editor.data.lat ?? ''} onChange={e => setData('lat', e.target.value)} placeholder="43.11…" /></Field><Field label="经度 Longitude"><input type="number" step="any" min={-180} max={180} value={editor.data.lng ?? ''} onChange={e => setData('lng', e.target.value)} placeholder="131.89…" /></Field></div><p className="tiny-text">搜索未找到时，可填入坐标，或关闭窗口后在主页选择「手动标记」。</p></div>}
        {['restaurant', 'hotel', 'gift'].includes(editor.type) && <><Field label={editor.type === 'hotel' ? '每晚价格' : editor.type === 'restaurant' ? '预计人均' : '单件预算'}><div className="price-input"><select aria-label="币种" value={editor.data.currency || 'RUB'} onChange={e => setData('currency', e.target.value)}><option value="RUB">₽ RUB</option><option value="CNY">¥ CNY</option></select><input type="number" min={0} step="0.01" value={editor.data.price ?? ''} onChange={e => setData('price', e.target.value)} placeholder="待记录" /></div></Field>{editor.type === 'hotel' && <><Field label="入住晚数"><input type="number" min={1} max={30} value={editor.data.nights ?? ''} onChange={e => setData('nights', e.target.value)} /></Field><Field label="选择状态"><select value={editor.data.status || '备选'} onChange={e => setData('status', e.target.value)}>{['收藏', '备选', '已订'].map(v => <option key={v}>{v}</option>)}</select></Field></>}{editor.type === 'gift' && <><Field label="数量"><input type="number" min={1} max={999} value={editor.data.quantity ?? ''} onChange={e => setData('quantity', e.target.value)} /></Field><Field label="谁负责购买"><select value={editor.data.buyer || '一起'} onChange={e => setData('buyer', e.target.value)}>{['一起', ...PEOPLE].map(p => <option key={p} value={p}>{PROFILES[p] ? `${PROFILES[p].nickname} · ${p}` : p}</option>)}</select></Field></>}</>}
        {['hotel', 'restaurant'].includes(editor.type) && <Field label="收藏 / 预订链接" wide><input type="url" value={editor.data.url || ''} onChange={e => setData('url', e.target.value)} placeholder="https://…" /></Field>}
        {editor.type === 'hotel' && <div className="field field-wide"><span>环境照片</span><div className="upload-gallery">{(editor.data.images || []).map((src: string, i: number) => <div key={src} className="upload-thumb"><AuthImage src={src} alt={`酒店环境照片 ${i + 1}`} /><button type="button" aria-label={`移除照片 ${i + 1}`} onClick={() => setData('images', editor.data.images.filter((_: string, index: number) => index !== i))}><X size={13} /></button></div>)}{(editor.data.images || []).length < 8 && <label className="upload-button">{uploading ? <Loader2 size={21} className="spin" /> : <Upload size={21} />}<span>{uploading ? '上传中…' : '添加照片'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={e => void upload(e.target.files?.[0])} /></label>}</div><p className="tiny-text">JPG、PNG、WebP 或 GIF，每张不超过 4 MB，最多 8 张。</p></div>}
        {['place', 'restaurant', 'hotel', 'gift'].includes(editor.type) && <Field label={editor.type === 'hotel' ? '环境、优缺点与比较备注' : editor.type === 'gift' ? '买给谁 / 去哪里买 / 备注' : '备注'} wide><textarea rows={3} maxLength={4000} value={editor.data.note || ''} onChange={e => setData('note', e.target.value)} placeholder="记下喜欢的理由，或需要注意的小事…" /></Field>}
        {editor.type === 'settings' && <><Field label="去程时间"><input value={editor.data.outbound || ''} onChange={e => setData('outbound', e.target.value)} /></Field><Field label="返程时间"><input value={editor.data.inbound || ''} onChange={e => setData('inbound', e.target.value)} /></Field></>}
      </div>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <div className="modal-footer"><button type="button" className="button secondary" onClick={closeEditor} disabled={saving || uploading}>取消</button><button className="button primary" type="submit" disabled={saving || uploading}>{saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{saving ? '正在保存…' : '保存到共享空间'}</button></div>
    </form></Modal>}
    {deleteTarget && <Modal title="删除这条记录？" subtitle="这会同步更新你们两人的共享清单。" onClose={() => { if (!saving) setDeleteTarget(null); }}><div className="delete-content"><p>{recordTitle(deleteTarget)}</p><div className="modal-footer"><button className="button secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>保留</button><button className="button danger" disabled={saving} onClick={async () => { setSaving(true); try { await mutate(() => request(`/api/records/${deleteTarget.id}?version=${deleteTarget.version}`, { method: 'DELETE' })); setDeleteTarget(null); setToast('记录已删除'); } catch (e: any) { setToast(e.message); } finally { setSaving(false); } }}>{saving ? '正在删除…' : '确认删除'}</button></div></div></Modal>}
    {showInfo && <Modal title="一起编辑这份旅行手册" onClose={() => setShowInfo(false)}><div className="info-content"><div className="info-avatars">{PEOPLE.map(person => <div className="info-person" key={person}><span><img src={PROFILES[person].photo} alt={`${PROFILES[person].nickname}的头像`} /></span><b>{PROFILES[person].nickname}</b><small>{person}</small></div>)}</div><p>地图、行程和清单保存在云端。打开同一个网站链接的所有人都能查看和编辑，无需登录。页面打开时，每 12 秒检查一次更新。</p><p>每个人的行李放在自己的列里，彼此都能查看。保存时如果同一条内容被修改，会提醒你核对，避免直接覆盖。</p><div className="info-account"><Cloud size={16} />当前编辑者：{editorName}</div><label className="editor-label">我正在以这个名字编辑：<select className="editor-name" value={editorName} onChange={e => { setEditorName(e.target.value); try { localStorage.setItem("trip-editor", e.target.value); } catch {} setToast("编辑者名称已更新"); }}><option>旅行伙伴</option>{PEOPLE.map(p => <option key={p} value={p}>{PROFILES[p].nickname} · {p}</option>)}</select></label><p className="tiny-text">这是人人可编辑的共享空间。编辑者名称用于标记修改记录，选择后会保存在当前浏览器。</p>{settings && <button className="button secondary" onClick={() => { setShowInfo(false); openEditor('settings', settings); }}><Pencil size={15} />编辑航班时间</button>}<button className="button secondary" onClick={exportData}><Download size={15} />导出记录备份</button></div></Modal>}
    {showShare && <Modal title="把旅行分享出去" subtitle="同一个链接，大家一起查看和编辑。" onClose={() => setShowShare(false)}><div className="share-links"><section><h3>旅行协作链接</h3><p>打开链接就能查看和编辑地图、行程和清单，无需登录。</p><div className="share-input-row"><input readOnly aria-label="旅行协作链接" value={getShareUrl()} onFocus={e => e.target.select()} /><button className="button primary" onClick={async () => { try { await navigator.clipboard.writeText(getShareUrl()); setToast('旅行协作链接已复制'); } catch { setToast('请点选左侧链接后手动复制'); } }}><Copy size={14} />复制</button></div></section></div></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={17} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}
