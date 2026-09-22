import type { Language } from './i18n';

export interface PracticeMap { key: string; nameByLang: Record<Language, string>; url: string; keywords: Record<Language, string[]>; }

// Verified 2026 Steam Workshop CS2 items (checked to avoid dead links) — one
// well-known destination per training category, matching what real trainers
// (e.g. Refrag) group practice into: aim, recoil, utility, prefire, movement.
const MAPS: PracticeMap[] = [
  {
    key: 'aim',
    nameByLang: { uz: 'Aim Botz', ru: 'Aim Botz', en: 'Aim Botz' },
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3070244462',
    keywords: {
      uz: ['aim', 'nishon', 'otish', 'moljal', 'reaksiya', 'flick', 'headshot'],
      ru: ['прицел', 'стрельб', 'реакц', 'флик', 'хедшот', 'aim'],
      en: ['aim', 'crosshair', 'flick', 'reaction', 'headshot', 'shooting'],
    },
  },
  {
    key: 'recoil',
    nameByLang: { uz: 'Recoil Master', ru: 'Recoil Master', en: 'Recoil Master' },
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3100869952',
    keywords: {
      uz: ['spray', 'otdacha', 'qaytish', 'recoil', 'ak-47', 'ak47'],
      ru: ['спрей', 'отдач', 'recoil', 'ак-47', 'ак47'],
      en: ['spray', 'recoil', 'ak-47', 'ak47', 'burst'],
    },
  },
  {
    key: 'prefire',
    nameByLang: { uz: 'Prefire xaritalari (5E_Prac)', ru: 'Карты для префайра (5E_Prac)', en: 'Prefire maps (5E_Prac)' },
    url: 'https://steamcommunity.com/workshop/browse/?appid=730&searchtext=5E_Prac+Prefire',
    keywords: {
      uz: ['prefire', 'burchak', 'peek', 'pozitsiya', 'crosshair placement'],
      ru: ['префайр', 'угол', 'пик', 'позици', 'плейсмент'],
      en: ['prefire', 'peek', 'angle', 'positioning', 'placement'],
    },
  },
  {
    key: 'utility',
    nameByLang: { uz: 'Yprac Hub (granata/util)', ru: 'Yprac Hub (граната/утилити)', en: 'Yprac Hub (utility)' },
    url: 'https://steamcommunity.com/workshop/browse/?appid=730&searchtext=Yprac+Hub',
    keywords: {
      uz: ['granata', 'tutun', 'flash', 'molotov', 'util', 'lineup'],
      ru: ['гранат', 'дым', 'флеш', 'молотов', 'утилит', 'лайнап'],
      en: ['utility', 'smoke', 'flash', 'molotov', 'grenade', 'lineup'],
    },
  },
  {
    key: 'movement',
    nameByLang: { uz: 'Harakat/KZ xaritalari', ru: 'Карты движения/KZ', en: 'Movement/KZ maps' },
    url: 'https://steamcommunity.com/workshop/browse/?appid=730&searchtext=kz_grotto',
    keywords: {
      uz: ['harakat', 'sakrash', 'bhop', 'kz', 'strafe'],
      ru: ['движени', 'прыж', 'bhop', 'kz', 'страф'],
      en: ['movement', 'jump', 'bhop', 'kz', 'strafe'],
    },
  },
];

export function findPracticeMap(focusText: string | undefined | null, lang: Language): PracticeMap | null {
  if (!focusText) return null;
  const haystack = focusText.toLowerCase();
  for (const entry of MAPS) {
    if (entry.keywords[lang].some((w) => haystack.includes(w.toLowerCase()))) return entry;
  }
  return null;
}

export const PRACTICE_LABEL: Record<Language, string> = { uz: 'Mashq qiling', ru: 'Тренируйтесь', en: 'Practice' };
