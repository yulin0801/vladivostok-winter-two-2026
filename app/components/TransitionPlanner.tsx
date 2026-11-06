'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Circle, Clapperboard, ExternalLink, Film, Loader2, MapPin, Pencil, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import type { RecordItem, TransitionData } from '../lib/types';
import { recordTitle } from './record-draft';

const DAYS = ['2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09'];
const VIDEO_TYPES = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' } as const;
const safeLink = (value?: string) => /^https?:\/\//i.test(value || '') ? value : '';
const dayLabel = (day: string) => /^2026-12-0[5-9]$/.test(day) ? `12 月 ${Number(day.slice(-2))} 日` : day;

export function transitionVideoType(file: Pick<File, 'name' | 'size'>) {
  const extension = file.name.toLowerCase().match(/\.(mp4|mov|webm)$/)?.[1] as keyof typeof VIDEO_TYPES | undefined;
  if (!extension) throw new Error('请选择 MP4、MOV 或 WebM 视频。');
  if (!file.size) throw new Error('这个视频是空文件，请重新选择。');
  if (file.size > 50 * 1024 * 1024) throw new Error('视频不能超过 50 MB，可以先剪短或压缩后再上传。');
  return { extension, contentType: VIDEO_TYPES[extension] };
}

function VideoPlayer({ url, title, preload = 'none' }: { url?: string; title: string; preload?: 'none' | 'metadata' }) {
  const [failedUrl, setFailedUrl] = useState('');
  const src = safeLink(url);
  if (!src) return <div className="transition-video-placeholder"><Film size={40} strokeWidth={1.2} /><strong>先记住这一段灵感</strong><span>可以上传参考视频，也可以只放原视频链接</span></div>;
  return <div className="transition-video-player"><video key={src} src={src} controls playsInline preload={preload} aria-label={`${title}参考视频`} onError={() => setFailedUrl(src)}>当前浏览器不支持播放视频。</video>{failedUrl === src && <div className="transition-video-error" role="status"><span>这段视频暂时无法播放，可能是格式或网络原因。</span><a href={src} target="_blank" rel="noopener noreferrer">在新窗口打开或下载 <ExternalLink size={14} /></a></div>}</div>;
}

function ReferenceLink({ url }: { url?: string }) {
  const href = safeLink(url);
  return href ? <a className="transition-reference" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />打开原视频 / 参考链接</a> : null;
}

function TransitionProgress({ data }: { data: TransitionData }) {
  const done = Number(!!data.openingDone) + Number(!!data.endingDone);
  return <div className="transition-progress"><progress value={done} max={2} aria-label={`已拍好 ${done} 段，共 2 段`} /><span>{done === 2 ? '两段都拍好啦' : `${done} / 2 段已拍好`}</span></div>;
}

function ShotSteps({ data, busy, onToggle, compact = false }: { data: TransitionData; busy: boolean; onToggle: (field: 'openingDone' | 'endingDone') => void; compact?: boolean }) {
  return <div className={`transition-shots ${compact ? 'compact' : ''}`}>{(['opening', 'ending'] as const).map((part, index) => {
    const field = part === 'opening' ? 'openingDone' : 'endingDone';
    return <section className={`transition-shot ${part}`} key={part}><span className="eyebrow">SHOT {index + 1 < 10 ? '0' : ''}{index + 1}</span><h3>{part === 'opening' ? '开头怎么拍' : '结尾怎么接'}</h3><p>{data[part] || (part === 'opening' ? '记下起跳、动作和镜头方向…' : '记下落地、接动作和拍摄位置…')}</p><button type="button" className={`transition-completion ${data[field] ? 'complete' : ''}`} aria-pressed={!!data[field]} disabled={busy} onClick={() => onToggle(field)}>{data[field] ? <CheckCircle2 size={17} /> : <Circle size={17} />}{data[field] ? '这段已拍好' : '标记这段拍好了'}</button></section>;
  })}</div>;
}

export function TransitionPage({ records, busy, onAdd, onEdit, onDelete, onOpen, onToggle }: {
  records: RecordItem[]; busy: boolean; onAdd: () => void; onEdit: (record: RecordItem) => void; onDelete: (record: RecordItem) => void; onOpen: (record: RecordItem) => void; onToggle: (record: RecordItem, field: 'openingDone' | 'endingDone') => void;
}) {
  const finished = records.filter(record => record.data.openingDone && record.data.endingDone).length;
  return <>
    <div className="page-heading"><div><div className="eyebrow">LITTLE SCENES, BIG MEMORIES</div><h1>把这趟旅行，拍成我们的电影。</h1><p>先收藏转场灵感，到现场再看一眼：开头怎么跳，结尾怎么接。</p></div><button className="button primary" onClick={onAdd}><Plus size={17} />添加转场灵感</button></div>
    <div className="collection-summary"><span><Clapperboard size={17} />{records.length} 个拍摄灵感</span><span><CheckCircle2 size={17} />{finished} 个已拍完整</span><span>开头与结尾分开勾选，拍完一段就记下来</span></div>
    {records.length === 0 ? <div className="transition-empty empty-card"><Film size={44} strokeWidth={1.1} /><h2>从一段喜欢的转场开始</h2><p>上传参考视频、粘贴原视频链接，或者只写一句拍法都可以。</p><button className="button primary" onClick={onAdd}><Plus size={16} />收藏第一个灵感</button></div> : <div className="transition-grid">{records.map(record => <article className="transition-card" key={record.id}>
      <div className="transition-card-head"><h2><button className="collection-title-button" onClick={() => onOpen(record)}>{recordTitle(record)}</button></h2><div className="card-actions"><button className="icon-button" aria-label={`编辑${recordTitle(record)}`} onClick={() => onEdit(record)}><Pencil size={15} /></button><button className="icon-button danger-hover" aria-label={`删除${recordTitle(record)}`} onClick={() => onDelete(record)}><Trash2 size={15} /></button></div></div>
      <div className="transition-video"><VideoPlayer url={record.data.videoUrl} title={recordTitle(record)} /></div>
      <div className="transition-body"><div className="transition-meta">{record.data.day && <span><CalendarDays size={14} />{dayLabel(record.data.day)}</span>}{record.data.location && <span><MapPin size={14} />{record.data.location}</span>}{record.data.owner && <span><Users size={14} />{record.data.owner}</span>}</div><ShotSteps data={record.data} busy={busy} compact onToggle={field => onToggle(record, field)} /><TransitionProgress data={record.data} /><div className="transition-actions"><ReferenceLink url={record.data.referenceUrl} /><button className="text-button" onClick={() => onOpen(record)}>查看详情<ArrowRight size={15} /></button></div></div>
    </article>)}</div>}
  </>;
}

export function TransitionDetails({ record, busy, onEdit, onToggle }: { record: RecordItem; busy: boolean; onEdit: () => void; onToggle: (field: 'openingDone' | 'endingDone') => void }) {
  const data: TransitionData = record.data;
  return <div className="transition-detail"><div className="transition-video"><VideoPlayer url={data.videoUrl} title={recordTitle(record)} preload="metadata" /></div><div className="transition-body"><ReferenceLink url={data.referenceUrl} /><p className="tiny-text">外站参考链接会在原网站打开；上传的视频可以在这里播放。</p><ShotSteps data={data} busy={busy} onToggle={onToggle} /><TransitionProgress data={data} /><dl className="transition-detail-fields">{([['location', '准备在哪里拍'], ['day', '安排日期'], ['owner', '谁负责拍摄'], ['props', '服装 / 道具']] as const).map(([field, label]) => data[field] ? <div key={field}><dt>{label}</dt><dd>{field === 'day' ? dayLabel(data[field]) : data[field]}</dd></div> : null)}</dl>{data.note && <section className="transition-note"><h3>其他拍摄备注</h3><p>{data.note}</p></section>}<div className="transition-actions"><button className="button primary" disabled={busy} onClick={onEdit}><Pencil size={16} />编辑 / 补充</button></div></div></div>;
}

function TransitionField({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}</label>;
}

export function TransitionEditorFields({ data, busy, setData, onUploading, onError }: {
  data: TransitionData; busy: boolean; setData: (field: string, value: unknown) => void; onUploading: (value: boolean) => void; onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const ownerListId = useId();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  useEffect(() => () => { const active = controller.current; controller.current = null; active?.abort(); }, []);
  function cancelUpload() {
    const active = controller.current;
    if (!active) return;
    controller.current = null; active.abort(); setUploading(false); onUploading(false);
    setStatus('已取消上传，之前的视频和填写的内容都保留着。');
  }
  async function uploadVideo(file: File) {
    if (busy || controller.current) return;
    let info: ReturnType<typeof transitionVideoType>;
    try { info = transitionVideoType(file); } catch (error) { onError((error as Error).message); return; }
    const operation = new AbortController(); controller.current = operation;
    setProgress(0); setStatus(''); setUploading(true); onUploading(true); onError('');
    try {
      const { upload } = await import('@vercel/blob/client');
      if (controller.current !== operation || operation.signal.aborted) return;
      const headers: Record<string, string> = {};
      try { const editor = localStorage.getItem('trip-editor'); if (editor) headers['X-Trip-Editor'] = encodeURIComponent(editor); } catch {}
      const result = await upload(`videos/${crypto.randomUUID()}.${info.extension}`, file, {
        access: 'public', contentType: info.contentType, multipart: true,
        handleUploadUrl: `${process.env.NEXT_PUBLIC_API_ORIGIN || window.location.origin}/api/video-upload`, headers,
        abortSignal: operation.signal,
        onUploadProgress: ({ percentage }) => { if (controller.current === operation) setProgress(Math.min(100, Math.round(percentage))); },
      });
      if (controller.current !== operation || operation.signal.aborted) return;
      setData('videoUrl', result.url); setStatus('视频已上传，保存这条灵感后就会同步到共享清单。');
    } catch (error) {
      if (controller.current === operation) onError(`视频上传失败，填写的内容已保留。${error instanceof Error ? error.message : '请稍后重试。'}`);
    } finally { if (controller.current === operation) { controller.current = null; setUploading(false); onUploading(false); } }
  }
  return <>
    <TransitionField label="转场名称（选填）" wide><input maxLength={200} value={data.name || ''} onChange={event => setData('name', event.target.value)} placeholder="例如：从家里一跳，落在海参崴" /></TransitionField>
    <div className="field field-wide transition-upload"><span>参考视频（选填）</span>{data.videoUrl && <div className="transition-video"><VideoPlayer url={data.videoUrl} title={data.name || '转场'} preload="metadata" /></div>}<div className="transition-actions"><button type="button" className="button secondary" disabled={busy || uploading} onClick={() => input.current?.click()}>{uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}{data.videoUrl ? '更换参考视频' : '上传参考视频'}</button>{data.videoUrl && <button type="button" className="text-button" disabled={busy || uploading} onClick={() => { setData('videoUrl', ''); setStatus(''); }}><Trash2 size={14} />移除视频</button>}</div><input ref={input} hidden type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" aria-label="选择参考视频" disabled={busy || uploading} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadVideo(file); }} /><p className="tiny-text">单个视频，MP4 / MOV / WebM，最大 50 MB。手机播放推荐 MP4；只上传视频也能保存。</p>{uploading && <div className="transition-upload-progress"><progress value={progress} max={100} aria-label={`视频上传 ${progress}%`} /><span>{progress === 100 ? '正在确认上传…' : `上传中 ${progress}%`}</span><button type="button" className="text-button" onClick={cancelUpload}><X size={14} />取消上传</button></div>}{status && <p className="tiny-text" role="status">{status}</p>}</div>
    <TransitionField label="原视频 / 外站参考链接（选填）" wide><input type="url" maxLength={2000} value={data.referenceUrl || ''} onChange={event => setData('referenceUrl', event.target.value)} placeholder="https://… 例如抖音、小红书或 B 站原视频链接" /></TransitionField>
    <div className="transition-editor-shots field-wide"><TransitionField label="开头怎么拍（选填）"><textarea rows={4} maxLength={4000} value={data.opening || ''} onChange={event => setData('opening', event.target.value)} placeholder="谁站在哪里？往哪边跳？镜头怎么移动？" /></TransitionField><TransitionField label="结尾怎么接（选填）"><textarea rows={4} maxLength={4000} value={data.ending || ''} onChange={event => setData('ending', event.target.value)} placeholder="在目的地接什么动作？朝向和机位怎样保持一致？" /></TransitionField></div>
    <TransitionField label="准备在哪里拍（选填）"><input maxLength={500} value={data.location || ''} onChange={event => setData('location', event.target.value)} placeholder="例如：家门口 → 海边灯塔" /></TransitionField>
    <TransitionField label="安排日期（选填）"><select value={data.day || ''} onChange={event => setData('day', event.target.value)}><option value="">还没决定</option>{DAYS.map(day => <option key={day} value={day}>{dayLabel(day)}</option>)}</select></TransitionField>
    <TransitionField label="谁负责拍摄（选填）"><input list={ownerListId} maxLength={200} value={data.owner || ''} onChange={event => setData('owner', event.target.value)} placeholder="填写一个名字，或一起拍" /><datalist id={ownerListId}><option value="小脆 · 崔天琴" /><option value="小鱼 · 张渝琳" /><option value="一起" /></datalist></TransitionField>
    <TransitionField label="服装 / 道具（选填）"><input maxLength={1000} value={data.props || ''} onChange={event => setData('props', event.target.value)} placeholder="例如：同一件外套、三脚架、墨镜" /></TransitionField>
    <TransitionField label="其他拍摄备注（选填）" wide><textarea rows={3} maxLength={4000} value={data.note || ''} onChange={event => setData('note', event.target.value)} placeholder="记下节奏、运镜或需要重拍的地方…" /></TransitionField>
    <div className="transition-editor-progress field-wide"><label><input type="checkbox" checked={!!data.openingDone} onChange={event => setData('openingDone', event.target.checked)} />开头已拍好</label><label><input type="checkbox" checked={!!data.endingDone} onChange={event => setData('endingDone', event.target.checked)} />结尾已拍好</label></div>
  </>;
}
