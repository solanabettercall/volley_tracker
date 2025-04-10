export type CountrySlug =
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
  | 'fbf';

export interface CountryInfo {
  slug: CountrySlug;
  name: string;
  emoji: string;
}

export const countries: CountryInfo[] = [
  { slug: 'hos', name: 'Хорватия', emoji: '🇭🇷' },
  { slug: 'bevl', name: 'Бельгия', emoji: '🇧🇪' },
  { slug: 'hvf', name: 'Венгрия', emoji: '🇭🇺' },
  { slug: 'ossrb', name: 'Сербия', emoji: '🇷🇸' },
  { slug: 'hvl', name: 'Греция (М)', emoji: '🇬🇷' },
  { slug: 'eope', name: 'Греция (Ж)', emoji: '🇬🇷' },
  { slug: 'bvf', name: 'Болгария', emoji: '🇧🇬' },
  { slug: 'frv', name: 'Румыния', emoji: '🇷🇴' },
  { slug: 'qva', name: 'Катар', emoji: '🇶🇦' },
  { slug: 'cvf', name: 'Чехия', emoji: '🇨🇿' },
  { slug: 'ozs', name: 'Словения', emoji: '🇸🇮' },
  { slug: 'tvf', name: 'Турция', emoji: '🇹🇷' },
  { slug: 'nvbf', name: 'Норвегия', emoji: '🇳🇴' },
  { slug: 'svf', name: 'Словакия', emoji: '🇸🇰' },
  { slug: 'fpv', name: 'Португалия', emoji: '🇵🇹' },
  { slug: 'rfevb', name: 'Испания', emoji: '🇪🇸' },
  { slug: 'bli', name: 'Исландия', emoji: '🇮🇸' },
  { slug: 'lml', name: 'Финляндия', emoji: '🇫🇮' },
  { slug: 'lnv', name: 'Франция', emoji: '🇫🇷' },
  { slug: 'vbl', name: 'Германия', emoji: '🇩🇪' },
  { slug: 'bvl', name: 'Балтийская лига', emoji: '🌍' },
  { slug: 'mevza', name: 'MEVZA', emoji: '🌍' },
  { slug: 'swi', name: 'Швейцария', emoji: '🇨🇭' },
  { slug: 'uvf', name: 'Украина', emoji: '🇺🇦' },
  { slug: 'fshv', name: 'Албания', emoji: '🇦🇱' },
  { slug: 'kop', name: 'Кипр', emoji: '🇨🇾' },
  { slug: 'fpdv', name: 'Перу', emoji: '🇵🇪' },
  { slug: 'evf', name: 'Эстония', emoji: '🇪🇪' },
  { slug: 'aclav', name: 'Аргентина', emoji: '🇦🇷' },
  { slug: 'osbih', name: 'Босния', emoji: '🇧🇦' },
  { slug: 'fbf', name: 'Фареры', emoji: '🇫🇴' },
];
