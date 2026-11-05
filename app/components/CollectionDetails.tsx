'use client';

import type { ReactNode } from 'react';
import { CalendarDays, CheckCircle2, Circle, Copy, ExternalLink, MapPin, Pencil } from 'lucide-react';
import type { RecordItem } from '../lib/types';
import { hasLocation, hasNumber, hotelTotal } from './record-draft';
import { PhotoViewer } from './CollectionPhotos';

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="collection-detail-field"><dt>{label}</dt><dd>{children}</dd></div>;
}
const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const price = (value: unknown, currency: string = 'RUB') => `${currency === 'RUB' ? '₽' : '¥'} ${Number(value).toLocaleString('zh-CN')} ${currency}`;
const safeLink = (value: unknown): value is string => hasText(value) && /^https?:\/\//i.test(value);

export default function CollectionDetails({ record, busy, onEdit, onCopyAddress, onShowLocation, onAddToDay, onToggle }: {
  record: RecordItem; busy: boolean; onEdit: () => void; onCopyAddress: () => void; onShowLocation: () => void; onAddToDay: () => void; onToggle: () => void;
}) {
  const { data, type } = record;
  const status = type === 'hotel' ? data.status || '备选' : type === 'restaurant' ? data.visited ? '已打卡' : '想去吃' : data.done ? '已经买到啦' : '还在愿望清单里';
  const completed = type === 'hotel' ? data.status === '已订' : type === 'restaurant' ? data.visited : data.done;
  const hasAddress = hasText(data.ruName) || hasText(data.address) || hasText(data.name);
  return <div className="collection-detail"><PhotoViewer record={record} /><div className="collection-detail-content">
    <div className={`collection-detail-status ${completed ? 'completed' : ''}`}>{completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}{status}</div>
    <dl className="collection-detail-grid">
      {hasText(data.name) && <DetailField label="名称">{data.name}</DetailField>}
      {hasText(data.ruName) && <DetailField label="俄文名称">{data.ruName}</DetailField>}
      {hasText(data.cuisine) && <DetailField label="菜系 / 想吃什么">{data.cuisine}</DetailField>}
      {hasText(data.address) && <DetailField label="详细地址">{data.address}</DetailField>}
      {hasNumber(data.price) && <DetailField label={type === 'hotel' ? '每晚价格' : type === 'restaurant' ? '预计人均' : '单件预算'}>{price(data.price, data.currency)}</DetailField>}
      {hasText(data.currency) && !hasNumber(data.price) && <DetailField label="币种">{data.currency === 'RUB' ? '俄罗斯卢布 · RUB' : data.currency === 'CNY' ? '人民币 · CNY' : data.currency}</DetailField>}
      {type === 'hotel' && hasNumber(data.nights) && <DetailField label="入住晚数">{data.nights} 晚</DetailField>}
      {type === 'hotel' && hotelTotal(record) !== undefined && <DetailField label="预计住宿总价">{price(hotelTotal(record), data.currency)}</DetailField>}
      {type === 'gift' && hasNumber(data.quantity) && <DetailField label="数量">{data.quantity} 件</DetailField>}
      {type === 'gift' && hasText(data.buyer) && <DetailField label="负责人">{data.buyer}</DetailField>}
      {type === 'gift' && hasNumber(data.price) && hasNumber(data.quantity) && <DetailField label="预计合计">{price(Number(data.price) * Number(data.quantity), data.currency)}</DetailField>}
      {hasNumber(data.lat) && <DetailField label="纬度">{data.lat}</DetailField>}
      {hasNumber(data.lng) && <DetailField label="经度">{data.lng}</DetailField>}
    </dl>
    {hasText(data.note) && <section className="collection-detail-note"><h3>{type === 'hotel' ? '环境与比较备注' : type === 'gift' ? '这份心意的小备注' : '想吃的理由与备注'}</h3><p>{data.note}</p></section>}
    {safeLink(data.url) && <a className="collection-detail-link" href={data.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /><span>{type === 'hotel' ? '打开收藏 / 预订链接' : '打开收藏链接'}<small>{data.url}</small></span></a>}
    {safeLink(data.sourceUrl) && <a className="text-link" href={data.sourceUrl} target="_blank" rel="noopener noreferrer">查看地点资料<ExternalLink size={14} /></a>}
    <p className="collection-detail-caption">先收藏这一份心动，缺少的内容可以随时补上。</p>
    <div className="collection-detail-actions">
      <button type="button" className="button primary" disabled={busy} onClick={onEdit}><Pencil size={15} />编辑 / 补充</button>
      {type !== 'hotel' && <button type="button" className={`button ${completed ? 'subtle selected' : 'secondary'}`} disabled={busy} onClick={onToggle}>{completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}{type === 'restaurant' ? completed ? '已打卡 · 撤销' : '标记已打卡' : completed ? '已买到 · 撤销' : '标记已买到'}</button>}
      {type === 'restaurant' && <button type="button" className="button secondary" disabled={busy} onClick={onAddToDay}><CalendarDays size={15} />加入行程</button>}
      {type !== 'gift' && hasAddress && <button type="button" className="button secondary" onClick={onCopyAddress}><Copy size={15} />复制名称 / 地址</button>}
      {type !== 'gift' && hasLocation(record) && <button type="button" className="button secondary" onClick={onShowLocation}><MapPin size={15} />查看地图位置</button>}
    </div>
  </div></div>;
}
