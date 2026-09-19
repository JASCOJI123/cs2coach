export const MAP_IMAGES: Record<string,string> = {
  de_mirage: '/map-thumbnails/de_mirage.svg',
  de_dust2: '/map-thumbnails/de_dust2.svg',
  de_inferno: '/map-thumbnails/de_inferno.svg',
  de_anubis: '/map-thumbnails/de_anubis.svg',
  de_ancient: '/map-thumbnails/de_ancient.svg',
  de_nuke: '/map-thumbnails/de_nuke.svg',
  de_vertigo: '/map-thumbnails/de_vertigo.svg',
  de_overpass: '/map-thumbnails/de_overpass.svg',
  de_train: '/map-thumbnails/de_train.svg',
};

export const DEFAULT_MAP_IMAGE = '/map-thumbnails/unknown.svg';

export function getMapImage(map?: string | null): string {
  if (!map) return DEFAULT_MAP_IMAGE;
  return MAP_IMAGES[map.trim().toLowerCase()] ?? DEFAULT_MAP_IMAGE;
}
