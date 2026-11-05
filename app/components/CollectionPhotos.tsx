'use client';

import { useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, Gift, Hotel, Images, Loader2, Trash2, Upload, Utensils } from 'lucide-react';
import type { RecordItem } from '../lib/types';
import { AuthImage } from './AccessGate';
import { recordTitle } from './record-draft';

export function collectionImages(data: Record<string, unknown>): string[] {
  return Array.isArray(data.images) ? data.images.filter((src): src is string => typeof src === 'string' && src.trim().length > 0) : [];
}

function PhotoPlaceholder({ type, detail = false }: { type: RecordItem['type']; detail?: boolean }) {
  const Icon = type === 'restaurant' ? Utensils : type === 'gift' ? Gift : Hotel;
  return <span className="collection-photo-placeholder"><Icon size={detail ? 48 : 42} strokeWidth={1.1} /><strong>{type === 'restaurant' ? '留一个位置，给心动的味道' : type === 'gift' ? '把这份小小的心意收好' : '留住想入住的风景'}</strong><small>还没有照片，随时可以补上</small></span>;
}

export function CollectionPhoto({ record, onOpen }: { record: RecordItem; onOpen: () => void }) {
  const images = collectionImages(record.data);
  return <button type="button" className={`collection-photo-button ${images.length ? 'has-photo' : 'no-photo'}`} onClick={onOpen} aria-label={`查看${recordTitle(record)}详情`}>
    {images.length ? <AuthImage src={images[0]} alt={`${recordTitle(record)}封面`} /> : <PhotoPlaceholder type={record.type} />}
    {images.length > 0 && <span className="collection-photo-count"><Images size={14} />{images.length} 张照片</span>}
    <span className="collection-photo-hint">查看详情 <ChevronRight size={14} /></span>
  </button>;
}

export function PhotoViewer({ record }: { record: RecordItem }) {
  const images = collectionImages(record.data);
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(images.length - 1, 0));
  const move = (direction: number) => setSelected((active + direction + images.length) % images.length);
  return <section className="photo-viewer" aria-label="照片浏览" onKeyDown={event => {
    if (images.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1);
  }}>
    <div className={`photo-viewer-stage ${images.length ? '' : 'no-photo'}`}>
      {images.length ? <AuthImage src={images[active]} alt={`${recordTitle(record)}，第 ${active + 1} 张照片`} /> : <PhotoPlaceholder type={record.type} detail />}
      {images.length > 1 && <><button type="button" className="photo-viewer-nav previous" aria-label="上一张照片" onClick={() => move(-1)}><ChevronLeft size={24} /></button><button type="button" className="photo-viewer-nav next" aria-label="下一张照片" onClick={() => move(1)}><ChevronRight size={24} /></button></>}
      {images.length > 0 && <span className="photo-viewer-position" aria-live="polite">{active + 1} / {images.length}</span>}
    </div>
    {images.length > 1 && <div className="photo-viewer-thumbs" aria-label="选择照片">{images.map((src, index) => <button key={`${src}-${index}`} type="button" className={index === active ? 'active' : ''} aria-label={`查看第 ${index + 1} 张照片`} aria-pressed={index === active} onClick={() => setSelected(index)}><AuthImage src={src} alt={`照片 ${index + 1} 缩略图`} /></button>)}</div>}
  </section>;
}

export function CollectionImageEditor({ images, busy, uploading, onChange, onUpload }: {
  images: string[]; busy: boolean; uploading: boolean; onChange: (images: string[]) => void; onUpload: (files: File[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return <div className="field field-wide collection-image-editor"><span>照片（选填）</span><div className="image-upload-grid">
    {images.map((src, index) => <div key={`${src}-${index}`} className="image-upload-item"><AuthImage src={src} alt={`已上传照片 ${index + 1}${index === 0 ? '，当前封面' : ''}`} />{index === 0 && <span className="image-cover-label"><Check size={12} />封面</span>}<div className="image-upload-actions"><button type="button" disabled={busy || index === 0} onClick={() => onChange([src, ...images.filter((_, i) => i !== index)])} aria-label={`将照片 ${index + 1} 设为封面`}><Camera size={12} />{index === 0 ? '当前封面' : '设为封面'}</button><button type="button" disabled={busy} aria-label={`删除照片 ${index + 1}`} onClick={() => onChange(images.filter((_, i) => i !== index))}><Trash2 size={13} /></button></div></div>)}
    {images.length < 8 && <button type="button" className="upload-button collection-upload-button" disabled={busy} onClick={() => fileInput.current?.click()} aria-label="上传照片，可一次选择多张">{uploading ? <Loader2 size={23} className="spin" /> : <Upload size={23} />}<span>{uploading ? '正在上传照片…' : '添加照片'}</span><small>可一次选择多张</small></button>}
  </div><input ref={fileInput} hidden aria-label="选择上传照片" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={event => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; if (files.length) onUpload(files); }} /><p className="tiny-text">JPG、PNG、WebP 或 GIF，每张不超过 4 MB，最多 8 张。首张是封面；只上传照片也可以保存。</p></div>;
}
