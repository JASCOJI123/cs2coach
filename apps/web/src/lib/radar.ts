// Live radar calibration. Images and numbers come from the CS2 overview files
// (resource/overviews/<map>.txt, via github.com/2mlml/cs2-radar-images): the
// 1024px radar's top-left corner is world (posX, posY) and one pixel covers
// `scale` world units. Maps with two floors switch to the lower image below
// `lowerBelowZ`. Bombsite marks are fractions of the image (bombA_x/bombA_y).
import ancient from '../assets/map-radars/de_ancient.webp';
import anubis from '../assets/map-radars/de_anubis.webp';
import dust2 from '../assets/map-radars/de_dust2.webp';
import inferno from '../assets/map-radars/de_inferno.webp';
import mirage from '../assets/map-radars/de_mirage.webp';
import nuke from '../assets/map-radars/de_nuke.webp';
import nukeLower from '../assets/map-radars/de_nuke_lower.webp';
import overpass from '../assets/map-radars/de_overpass.webp';
import train from '../assets/map-radars/de_train.webp';
import trainLower from '../assets/map-radars/de_train_lower.webp';
import vertigo from '../assets/map-radars/de_vertigo.webp';
import vertigoLower from '../assets/map-radars/de_vertigo_lower.webp';

export type RadarLevel = 'upper' | 'lower';

export interface RadarCalibration {
  image: string;
  lowerImage?: string;
  lowerBelowZ?: number;
  posX: number;
  posY: number;
  scale: number;
  sites: { A: [number, number]; B: [number, number] };
}

const RADARS: Record<string, RadarCalibration> = {
  de_ancient: { image: ancient, posX: -2953, posY: 2164, scale: 5, sites: { A: [0.31, 0.25], B: [0.8, 0.4] } },
  de_anubis: { image: anubis, posX: -2796, posY: 3328, scale: 5.22, sites: { A: [0.755, 0.26], B: [0.33, 0.5] } },
  de_dust2: { image: dust2, posX: -2476, posY: 3239, scale: 4.4, sites: { A: [0.8, 0.16], B: [0.21, 0.12] } },
  de_inferno: { image: inferno, posX: -2087, posY: 3870, scale: 4.9, sites: { A: [0.81, 0.69], B: [0.49, 0.22] } },
  de_mirage: { image: mirage, posX: -3230, posY: 1713, scale: 5, sites: { A: [0.54, 0.76], B: [0.23, 0.28] } },
  de_nuke: { image: nuke, lowerImage: nukeLower, lowerBelowZ: -495, posX: -3453, posY: 2887, scale: 7, sites: { A: [0.58, 0.48], B: [0.58, 0.58] } },
  de_overpass: { image: overpass, posX: -4831, posY: 1781, scale: 5.2, sites: { A: [0.55, 0.23], B: [0.7, 0.31] } },
  de_train: { image: train, lowerImage: trainLower, lowerBelowZ: -50, posX: -2308, posY: 2078, scale: 4.082077, sites: { A: [0.63, 0.49], B: [0.52, 0.76] } },
  de_vertigo: { image: vertigo, lowerImage: vertigoLower, lowerBelowZ: 11700, posX: -3168, posY: 1762, scale: 4, sites: { A: [0.705, 0.585], B: [0.222, 0.223] } },
};

export function radarFor(map?: string | null): RadarCalibration | null {
  if (!map) return null;
  const key = map.trim().toLowerCase().replace(/\s+/g, '_');
  return RADARS[key] ?? RADARS[`de_${key}`] ?? null;
}

/** World position → percent of the radar image, plus which floor it is on. */
export function worldToRadar(radar: RadarCalibration, pos: { x: number; y: number; z: number }): { left: number; top: number; level: RadarLevel } {
  const px = (pos.x - radar.posX) / radar.scale;
  const py = (radar.posY - pos.y) / radar.scale;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const level: RadarLevel = radar.lowerBelowZ !== undefined && pos.z < radar.lowerBelowZ ? 'lower' : 'upper';
  return { left: clamp((px / 1024) * 100), top: clamp((py / 1024) * 100), level };
}

/** Which bombsite an AI action points at, if any (FAST_A, B_EXECUTE, RETAKE_B…). */
export function siteForAction(action?: string | null): 'A' | 'B' | null {
  const a = (action ?? '').toUpperCase();
  if (/(^|_)A($|_)/.test(a)) return 'A';
  if (/(^|_)B($|_)/.test(a)) return 'B';
  return null;
}
