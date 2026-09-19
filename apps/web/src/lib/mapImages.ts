// Map thumbnails are imported as ES modules (not served from public/) so Vite
// bundles them into assets/ with the rest of the build. The GitHub Pages
// workflow only mirrors dist/assets + dist/index.html into the versioned
// /v2/ path Telegram opens, so anything served from public/ 404s there —
// bundling avoids depending on that copy step at all.
import deMirage from '../assets/map-thumbnails/de_mirage.svg';
import deDust2 from '../assets/map-thumbnails/de_dust2.svg';
import deInferno from '../assets/map-thumbnails/de_inferno.svg';
import deAnubis from '../assets/map-thumbnails/de_anubis.svg';
import deAncient from '../assets/map-thumbnails/de_ancient.svg';
import deNuke from '../assets/map-thumbnails/de_nuke.svg';
import deVertigo from '../assets/map-thumbnails/de_vertigo.svg';
import deOverpass from '../assets/map-thumbnails/de_overpass.svg';
import deTrain from '../assets/map-thumbnails/de_train.svg';
import unknownMap from '../assets/map-thumbnails/unknown.svg';

const MAP_IMAGES: Record<string, string> = {
  de_mirage: deMirage,
  mirage: deMirage,
  de_dust2: deDust2,
  dust2: deDust2,
  dust_2: deDust2,
  de_inferno: deInferno,
  inferno: deInferno,
  de_anubis: deAnubis,
  anubis: deAnubis,
  de_ancient: deAncient,
  ancient: deAncient,
  de_nuke: deNuke,
  nuke: deNuke,
  de_vertigo: deVertigo,
  vertigo: deVertigo,
  de_overpass: deOverpass,
  overpass: deOverpass,
  de_train: deTrain,
  train: deTrain,
};

export const DEFAULT_MAP_IMAGE = unknownMap;

function keyFor(map: string): string {
  return map.trim().toLowerCase().replace(/\s+/g, '_');
}

export function normalizeMapName(map?: string | null): string | null {
  if (!map?.trim()) return null;
  const key = keyFor(map);
  const aliases: Record<string, string> = {
    mirage: 'de_mirage', dust2: 'de_dust2', dust_2: 'de_dust2', inferno: 'de_inferno',
    anubis: 'de_anubis', ancient: 'de_ancient', nuke: 'de_nuke', vertigo: 'de_vertigo',
    overpass: 'de_overpass', train: 'de_train',
  };
  return aliases[key] ?? (MAP_IMAGES[key] ? key : map.trim());
}

export function getMapImage(map?: string | null): string {
  const key = keyFor(map ?? '');
  return MAP_IMAGES[key] ?? DEFAULT_MAP_IMAGE;
}
