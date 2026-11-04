export type RecordType = 'place' | 'note' | 'packing' | 'restaurant' | 'hotel' | 'gift' | 'settings';
export interface RecordItem { id: string; type: RecordType; data: any; version: number; updatedAt: string; updatedBy: string; }
export interface PlacePoint { id: string; name: string; lat: number; lng: number; category?: string; index?: number; }
