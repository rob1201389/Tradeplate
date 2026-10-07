export type Point = [number, number];

export interface Vehicle {
  id: string;
  stockNo: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  variant: string;
  colour: string;
  createdAt: number;
  updatedAt: number;
}

export type PlateMode = "none" | "cover" | "blur";

export interface EditSettings {
  /** Cut the car out and stage it. Off for interiors and detail shots. */
  removeBg: boolean;
  background: string;
  /** Multiplier on the automatic fit. */
  scale: number;
  /** Vertical nudge as a fraction of output height. */
  offsetY: number;
  shadow: boolean;
  reflection: boolean;
  enhance: boolean;
  plateMode: PlateMode;
  /** Plate corners TL, TR, BR, BL as fractions of the source image. */
  plateQuad: Point[] | null;
  watermark: boolean;
}

export type PhotoStatus = "new" | "processing" | "done" | "error";

export interface Photo {
  id: string;
  vehicleId: string;
  slot: string;
  order: number;
  original: Blob;
  /** Greyscale PNG, white = car. Generated once, reused on every re-render. */
  mask?: Blob;
  edit: EditSettings;
  output?: Blob;
  thumb?: Blob;
  status: PhotoStatus;
  error?: string;
  updatedAt: number;
}

export interface CustomBackground {
  id: string;
  name: string;
  image: Blob;
  floorLine: number;
  glossy: boolean;
}

export type Engine = "auto" | "device" | "server";
export type Aspect = "4:3" | "3:2" | "16:9" | "1:1";

export interface Settings {
  engine: Engine;
  serverUrl: string;
  /** Matches API_KEY on a server exposed to the internet. */
  serverKey: string;
  outputWidth: number;
  aspect: Aspect;
  jpegQuality: number;
  defaultBackground: string;
  plateText: string;
  plateBg: string;
  plateFg: string;
  plateImage?: Blob;
  defaultPlateMode: PlateMode;
  logo?: Blob;
  watermarkDefault: boolean;
  watermarkSize: number;
}
