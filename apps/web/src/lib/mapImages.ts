const BASE = import.meta.env.BASE_URL;

const MAP_IMAGES: Record<string,string> = {
  de_mirage: 'de_mirage.svg',
  mirage: 'de_mirage.svg',
  de_dust2: 'de_dust2.svg',
  dust2: 'de_dust2.svg',
  dust_2: 'de_dust2.svg',
  de_inferno: 'de_inferno.svg',
  inferno: 'de_inferno.svg',
  de_anubis: 'de_anubis.svg',
  anubis: 'de_anubis.svg',
  de_ancient: 'de_ancient.svg',
  ancient: 'de_ancient.svg',
  de_nuke: 'de_nuke.svg',
  nuke: 'de_nuke.svg',
  de_vertigo: 'de_vertigo.svg',
  vertigo: 'de_vertigo.svg',
  de_overpass: 'de_overpass.svg',
  overpass: 'de_overpass.svg',
  de_train: 'de_train.svg',
  train: 'de_train.svg',
};

export const DEFAULT_MAP_IMAGE = `${BASE}map-thumbnails/unknown.svg`;

function keyFor(map: string): string {
  return map.trim().toLowerCase().replace(/\s+/g, '_');
}

export function normalizeMapName(map?: string | null): string | null {
  if (!map?.trim()) return null;
  const key = keyFor(map);
  const aliases: Record<string,string> = {
    mirage:'de_mirage',dust2:'de_dust2',dust_2:'de_dust2',inferno:'de_inferno',
    anubis:'de_anubis',ancient:'de_ancient',nuke:'de_nuke',vertigo:'de_vertigo',
    overpass:'de_overpass',train:'de_train',
  };
  return aliases[key] ?? (MAP_IMAGES[key] ? key : map.trim());
}

export function getMapImage(map?: string | null): string {
  const key = keyFor(map ?? '');
  const file = MAP_IMAGES[key];
  return file ? `${BASE}map-thumbnails/${file}` : DEFAULT_MAP_IMAGE;
}
