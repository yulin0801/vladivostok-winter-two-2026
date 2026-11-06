export type RecordType = 'place' | 'note' | 'packing' | 'restaurant' | 'hotel' | 'gift' | 'transition' | 'settings';
export interface TransitionData {
  name?: string; videoUrl?: string; referenceUrl?: string; opening?: string; ending?: string;
  location?: string; day?: string; owner?: string; props?: string; note?: string;
  openingDone?: boolean; endingDone?: boolean;
}
export interface RecordItem { id: string; type: RecordType; data: any; version: number; updatedAt: string; updatedBy: string; }
export interface PlacePoint { id: string; name: string; lat: number; lng: number; category?: string; index?: number; }
