// lib/options.ts

// Канонические значения для БД + подписи для UI
// format: значение в БД ВСЕГДА англ.: any | children | adults
export const FORMAT_OPTIONS = [
  { value: 'any',      label: { ru: 'семья',     en: 'family' } },
  { value: 'children', label: { ru: 'детям',     en: 'children' } },
  { value: 'adults',   label: { ru: 'взрослым',  en: 'adults' } },
];

// type: значение в БД ДОЛЖНО быть на РУССКОМ (из твоего массива-ограничения)
export const TYPE_OPTIONS = [
  { valueRu: 'культура',                 label: { ru: 'культура',                 en: 'culture' } },
  { valueRu: 'выставка',                 label: { ru: 'выставка',                 en: 'exhibition' } },
  { valueRu: 'живопись',                 label: { ru: 'живопись',                 en: 'painting' } },
  { valueRu: 'спектакль',                label: { ru: 'спектакль',                en: 'play' } },
  { valueRu: 'кино',                     label: { ru: 'кино',                     en: 'cinema' } },
  { valueRu: 'спорт',                    label: { ru: 'спорт',                    en: 'sports' } },
  { valueRu: 'развлечение',              label: { ru: 'развлечение',              en: 'entertainment' } },
  { valueRu: 'клубы и ночная жизнь',     label: { ru: 'клубы и ночная жизнь',     en: 'clubs & nightlife' } },
  { valueRu: 'развлекательные центры',   label: { ru: 'развлекательные центры',   en: 'amusement centers' } },
  { valueRu: 'игра',                     label: { ru: 'игра',                     en: 'game' } },
  { valueRu: 'общение',                  label: { ru: 'общение',                  en: 'social' } },
  { valueRu: 'наука',                    label: { ru: 'наука',                    en: 'science' } },
  { valueRu: 'здоровье',                 label: { ru: 'здоровье',                 en: 'health' } },
  { valueRu: 'религия',                  label: { ru: 'религия',                  en: 'religion' } },
  { valueRu: 'ярмарка',                  label: { ru: 'ярмарка',                  en: 'fair' } },
  { valueRu: 'еда',                      label: { ru: 'еда',                      en: 'food' } },
  { valueRu: 'автомобили',               label: { ru: 'автомобили',               en: 'cars' } },
  { valueRu: 'фестиваль',                label: { ru: 'фестиваль',                en: 'festival' } },
  { valueRu: 'природа',                  label: { ru: 'природа',                  en: 'nature' } },
  { valueRu: 'танцы',                    label: { ru: 'танцы',                    en: 'dance' } },
  { valueRu: 'концерт',                  label: { ru: 'концерт',                  en: 'concert' } },
  { valueRu: 'традиционное',             label: { ru: 'традиционное',             en: 'traditional' } },
  { valueRu: 'мастеркласс',              label: { ru: 'мастеркласс',              en: 'master class' } },
  { valueRu: 'музыка',                   label: { ru: 'музыка',                   en: 'music' } },
  { valueRu: 'другое',                   label: { ru: 'другое',                   en: 'other' } },
  { valueRu: 'детское',                  label: { ru: 'детское',                  en: 'kids' } },
  { valueRu: 'квест',                    label: { ru: 'квест',                    en: 'quest' } },
  { valueRu: 'книги',                    label: { ru: 'книги',                    en: 'books' } },
  { valueRu: 'лекция',                   label: { ru: 'лекция',                   en: 'lecture' } },
  { valueRu: 'обучение',                 label: { ru: 'обучение',                 en: 'education' } },
  { valueRu: 'технологии',               label: { ru: 'технологии',               en: 'technology' } },
];

// age_group: храним в БД КАНОНИЧЕСКИЕ значения (такие же при любом языке)
export const AGE_GROUPS = [
  { value: '0-2',  label: { ru: '0–2',  en: '0–2' } },
  { value: '3-5',  label: { ru: '3–5',  en: '3–5' } },
  { value: '6-8',  label: { ru: '6–8',  en: '6–8' } },
  { value: '9-12', label: { ru: '9–12', en: '9–12' } },
  { value: '13-17',label: { ru: '13–17',en: '13–17' } },
  { value: '18+',  label: { ru: '18+',  en: '18+' } },
  { value: 'any',  label: { ru: 'любой', en: 'any' } }, // спец-опция "выбрать все"
];
