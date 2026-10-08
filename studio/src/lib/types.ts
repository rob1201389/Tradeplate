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
  rego?: string;
  /** Backdrop and logo choice for this vehicle's photos. */
  look?: { background: string; watermark: boolean };
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
  /** Rotate so the wheels sit level (side, front and rear shots). */
  level?: boolean;
  /** Manual rotation in degrees, on top of auto-level. */
  rotate?: number;
  /** 0-1. Tones down hotspots on paint and glass. */
  glare?: number;
  /** Window outlines, each a list of corners as fractions of the source image. */
  glass?: Point[][];
  /** 0-1. Darkens and evens out the marked windows. */
  glassTint?: number;
  /** Use the AI-cleaned windows (only inside the outlines). */
  glassAi?: boolean;
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
  /** AI-cleaned version of the photo; only its window pixels are ever used. */
  glassFix?: Blob;
  /** The window outlines glassFix was made for, so a change invalidates it. */
  glassFixFor?: string;
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

export type LogoPos = "top-right" | "top-left" | "bottom-right" | "bottom-left";
export type Engine = "auto" | "device" | "server";
export type Aspect = "4:3" | "3:2" | "16:9" | "1:1";

export interface Settings {
  engine: Engine;
  serverUrl: string;
  /** Matches API_KEY on a server exposed to the internet. */
  serverKey: string;
  /** Access key for the AI glass clean-up service (set on the server). */
  aiKey: string;
  /** Where the AI glass service lives. Blank = this site. */
  aiUrl: string;
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
  logoPos: LogoPos;
}
