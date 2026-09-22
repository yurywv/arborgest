export type MapPoint = {
  id: string;
  code: string;
  lat: number;
  lng: number;
  species?: string | null;
  scientific?: string | null;
  status: string;
  condition?: string | null;
  risk?: string | null;
  dap?: number | null;
  height?: number | null;
  photoUrl?: string | null;
  lastInspection?: string | null;
  nextInspection?: string | null;
  property?: string | null;
};
