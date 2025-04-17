export type FederationSlug =
  | 'hos'
  | 'bevl'
  | 'hvf'
  | 'ossrb'
  | 'hvl'
  | 'bvf'
  | 'frv'
  | 'qva'
  | 'cvf'
  | 'ozs'
  | 'tvf'
  | 'nvbf'
  | 'svf'
  | 'fpv'
  | 'rfevb'
  | 'bli'
  | 'lml'
  | 'lnv'
  | 'vbl'
  | 'bvl'
  | 'mevza'
  | 'eope'
  | 'swi'
  | 'uvf'
  | 'fshv'
  | 'kop'
  | 'fpdv'
  | 'evf'
  | 'aclav'
  | 'osbih'
  | 'fbf'
  | 'iva'
  | 'svbf';

export interface FederationInfo {
  slug: FederationSlug;
  name: string;
  emoji: string;
  competitionIds: number[];
}

export const federations: FederationInfo[] = [
  {
    slug: 'hos',
    name: 'Хорватия',
    emoji: '🇭🇷',
    competitionIds: [102, 103, 104, 105],
  },
  { slug: 'bevl', name: 'Бельгия', emoji: '🇧🇪', competitionIds: [33, 35] },
  { slug: 'hvf', name: 'Венгрия', emoji: '🇭🇺', competitionIds: [49, 51, 52] },
  { slug: 'ossrb', name: 'Сербия', emoji: '🇷🇸', competitionIds: [79, 80] },
  { slug: 'hvl', name: 'Греция (М)', emoji: '🇬🇷', competitionIds: [48] },
  { slug: 'eope', name: 'Греция (Ж)', emoji: '🇬🇷', competitionIds: [11] },
  { slug: 'bvf', name: 'Болгария', emoji: '🇧🇬', competitionIds: [47, 48] },
  { slug: 'frv', name: 'Румыния', emoji: '🇷🇴', competitionIds: [53, 56] },
  { slug: 'qva', name: 'Катар', emoji: '🇶🇦', competitionIds: [26] },
  { slug: 'cvf', name: 'Чехия', emoji: '🇨🇿', competitionIds: [42, 47] },
  {
    slug: 'ozs',
    name: 'Словения',
    emoji: '🇸🇮',
    competitionIds: [116, 117, 118, 124],
  },
  // { slug: 'tvf', name: 'Турция', emoji: '🇹🇷', competitionIds: [] }, // Другой движок
  {
    slug: 'nvbf',
    name: 'Норвегия',
    emoji: '🇳🇴',
    competitionIds: [75, 76, 77, 78],
  },
  { slug: 'svf', name: 'Словакия', emoji: '🇸🇰', competitionIds: [68, 70] },
  { slug: 'fpv', name: 'Португалия', emoji: '🇵🇹', competitionIds: [107, 108] },
  {
    slug: 'rfevb',
    name: 'Испания',
    emoji: '🇪🇸',
    competitionIds: [136, 137, 138, 139],
  },
  { slug: 'bli', name: 'Исландия', emoji: '🇮🇸', competitionIds: [112, 113] },
  { slug: 'lml', name: 'Финляндия', emoji: '🇫🇮', competitionIds: [128, 130] },
  {
    slug: 'lnv',
    name: 'Франция',
    emoji: '🇫🇷',
    competitionIds: [113, 115, 116],
  },
  {
    slug: 'vbl',
    name: 'Германия',
    emoji: '🇩🇪',
    competitionIds: [175, 177, 182],
  },
  {
    slug: 'bvl',
    name: 'Балтийская лига',
    emoji: '🌍',
    competitionIds: [16, 18],
  },
  { slug: 'mevza', name: 'MEVZA', emoji: '🌍', competitionIds: [49, 51] },
  { slug: 'swi', name: 'Швейцария', emoji: '🇨🇭', competitionIds: [71, 72] },
  { slug: 'uvf', name: 'Украина', emoji: '🇺🇦', competitionIds: [] },
  { slug: 'fshv', name: 'Албания', emoji: '🇦🇱', competitionIds: [95, 98] },
  { slug: 'kop', name: 'Кипр', emoji: '🇨🇾', competitionIds: [36] },
  { slug: 'fpdv', name: 'Перу', emoji: '🇵🇪', competitionIds: [22] },
  { slug: 'evf', name: 'Эстония', emoji: '🇪🇪', competitionIds: [70, 71, 79] },
  { slug: 'aclav', name: 'Аргентина', emoji: '🇦🇷', competitionIds: [40] },
  { slug: 'osbih', name: 'Босния', emoji: '🇧🇦', competitionIds: [39, 41] },
  { slug: 'fbf', name: 'Фареры', emoji: '🇫🇴', competitionIds: [] },
  { slug: 'iva', name: 'Израиль', emoji: '🇮🇱', competitionIds: [39, 40] },
  { slug: 'svbf', name: 'Швеция', emoji: '🇸🇪', competitionIds: [402, 403] },
];
