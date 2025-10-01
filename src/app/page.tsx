/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

interface EventFormValues {
  title?: string;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  website?: string;
  type?: string[];
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  age_group?: string[];
  format?: string;
  repeat?: string;
  repeat_until?: string;
  description_en?: string;
  description_de?: string;
  description_fr?: string;
  description_it?: string;
  description_ru?: string;
}

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/supabase';
import GoogleMapsSearch from './googlemapsscript';
import AuthForm from './components/auth';
import { Dialog } from '@headlessui/react'; // если ты его используешь
import ArchiveDialog from './components/ArchiveDialog';

const eventType = [
  'культура', 'выставка', 'спектакль', 'живопись', 'наука',
  'спорт', 'природа', 'здоровье', 'танцы',  'музыка', 'технологии',
  'общение', 'обучение', 'книги', 'лекция', 'квест', 'мастеркласс',
  'развлечение', 'игра',  'детское',  'кино', 'развлекательные центры', 'клубы и ночная жизнь',  
  'ярмарка', 'еда', 'фестиваль', 'автомобили', 'религия', 'другое'   
];

const ageGroups = [
  '0-2', '3-5', '6-8', '9-12', '13-17', '18+', 'any'
];

const formats = [
  'any', 'children', 'adults'
];

export default function Home() {

  const [search, setSearch] = useState('');     // что ввёл пользователь
  const [isSearching, setIsSearching] = useState(false); // индикатор поиска

  // где стейты:
  const formRef = useRef<HTMLDivElement | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveDate, setArchiveDate] = useState('');
  const [scraping, setScraping] = useState(false);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const firstLoadLimit = 1000;
  const loadMoreLimit = 100;

  const getSwissTime = () => {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Zurich' });
  };
  // Пустые строки -> null, пустые массивы -> null.
  // И если нет повтора — repeat_until игнорируем.
  const normalizeForm = (raw: any) => {
    const out: any = { ...raw };

    const emptyToNull = [
      'description','address','website',
      'start_date','start_time','end_date','end_time',
      'repeat_until','format','description_en','description_de',
      'description_fr','description_it','description_ru'
    ];
    emptyToNull.forEach((k) => {
      if (out[k] === '' || out[k] === undefined) out[k] = null;
    });

    if (!Array.isArray(out.type) || out.type.length === 0) out.type = null;
    if (!Array.isArray(out.age_group) || out.age_group.length === 0) out.age_group = null;

    if (!out.repeat) out.repeat_until = null;

    return out;
  };

  const [gmapsResetKey, setGmapsResetKey] = useState(0);

  const getMarker = (value: any) => {
    if (Array.isArray(value)) return value.length > 0 ? '✅' : '❌';
    if (value === null || value === undefined) return '❌';
    if (typeof value === 'string') return value.trim().length ? '✅' : '❌';
    return value ? '✅' : '❌';
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso; // на случай неожиданного формата
    return `${d}.${m}.${y}`;
  };

  const { register, handleSubmit, setValue, reset, watch } = useForm<EventFormValues>({
    defaultValues: {
      start_time: '00:00',
      end_time: '23:59',
    },
  });

  const [events, setEvents] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
  };

  const onSubmit = async (formData: any) => {
    if (!user) { alert('Сначала войдите'); return; }

    // 1) приводим чекбоксы к массивам (на всякий случай)
    if (formData.type && !Array.isArray(formData.type)) formData.type = [formData.type];
    if (formData.age_group && !Array.isArray(formData.age_group)) formData.age_group = [formData.age_group];

    // 2) нормализуем пустые строки -> null и repeat_until при "без повтора"
    const form = normalizeForm(formData);

    let error;
    const repeatType = form.repeat; // '', 'weekly', 'monthly'
    const repeatUntil = form.repeat_until ? new Date(form.repeat_until) : null;

    const startDate = form.start_date ? new Date(form.start_date) : null;
    if (!startDate || isNaN(startDate.getTime())) {
      alert('Ошибка: некорректная дата начала');
      return;
    }

    const hasEndDate = !!form.end_date;
    const endDate = hasEndDate ? new Date(form.end_date) : null;
    const toISODate = (d: Date) => d.toISOString().slice(0, 10);

    const eventsToInsert: any[] = [];

    // выключаем "грязные" поля, работаем с cleanFormData
    const { repeat, repeat_until, id, ...cleanFormData } = form;

    if (editingId) {
      if (repeatType === 'weekly' || repeatType === 'monthly') {
        await supabase.from('events').delete().eq('id', editingId);

        while (!repeatUntil || startDate <= repeatUntil) {
          const newEvent = {
            ...cleanFormData,
            start_date: toISODate(startDate),
            end_date: hasEndDate ? toISODate(endDate!) : null, // 👈 обновляем и конец
            start_time: cleanFormData.start_time,
            end_time: cleanFormData.end_time,
            user_id: user?.id || null,
            user_email: user?.email || null,
            // created_at убери, пусть БД ставит сама
          };
          eventsToInsert.push(newEvent);

          // 👇 двигаем ОБЕ даты на шаг повтора
          if (repeatType === 'weekly') {
            startDate.setDate(startDate.getDate() + 7);
            if (hasEndDate) endDate!.setDate(endDate!.getDate() + 7);
          } else if (repeatType === 'monthly') {
            startDate.setMonth(startDate.getMonth() + 1);
            if (hasEndDate) endDate!.setMonth(endDate!.getMonth() + 1);
          }
        }

        const { error: insertError } = await supabase.from('events').insert(eventsToInsert);
        error = insertError;
      } else {
        // без повтора — просто апдейт одной записи
        ({ error } = await supabase.from('events')
          .update({ ...cleanFormData, user_id: user.id || null })
          .eq('id', editingId));
      }
    } else {
      while (!repeatUntil || startDate <= repeatUntil) {
        const newEvent = {
          ...cleanFormData,
          user_id: user.id || null,
          user_email: user.email || null,
          start_date: toISODate(startDate),
          end_date: hasEndDate ? toISODate(endDate!) : null, // 👈 вот это главное
          start_time: cleanFormData.start_time,
          end_time: cleanFormData.end_time,
          // created_at убери, пусть БД ставит сама
        };
        eventsToInsert.push(newEvent);

        if (repeatType === 'weekly') {
          startDate.setDate(startDate.getDate() + 7);
          if (hasEndDate) endDate!.setDate(endDate!.getDate() + 7);
        } else if (repeatType === 'monthly') {
          startDate.setMonth(startDate.getMonth() + 1);
          if (hasEndDate) endDate!.setMonth(endDate!.getMonth() + 1);
        } else {
          break; // без повтора
        }
      }

      const { error: insertError } = await supabase.from('events').insert(eventsToInsert);
      error = insertError;
    }

    if (error) {
      console.error('Ошибка при сохранении:', error.message);
      alert('Ошибка: ' + error.message);
    } else {
      // см. пункт 2 — тут ещё очистим поле поиска гугла
      reset({ start_time: '00:00', end_time: '23:59' });
      setEditingId(null);
      clearGoogleSearch();        // 👈 добавим эту функцию ниже
      fetchEvents(true);
      setSearch('');
    }
  };

  const onPlaceSelected = (place: google.maps.places.PlaceResult) => {
    const location = place.geometry?.location;
    if (location) {
      setValue('address', place.formatted_address || '');
      setValue('lat', location.lat());
      setValue('lng', location.lng());
    }
  };

  const deleteEvent = async (id: any) => {
    if (!id) {
      alert('Нет ID для удаления');
      return;
    }
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) {
      console.error('Ошибка при удалении:', error.message);
      alert('Ошибка при удалении: ' + error.message);
    } else {
      fetchEvents(true);
      setSearch('');
    }
  };

  const editEvent = (event: any) => {
    setEditingId(event.id);

    const keys = [
      'title', 'description', 'address', 'lat', 'lng', 'website',
      'type', 'start_date', 'start_time', 'end_date', 'end_time',
      'age_group', 'format', 'repeat', 'repeat_until',
      'description_en', 'description_de', 'description_fr',
      'description_it', 'description_ru'
    ] as const;

    keys.forEach((key) => {
      if ((key === 'type' || key === 'age_group') && Array.isArray(event[key])) {
        setValue(key, event[key]);
      } else {
        setValue(key, event[key] as any);
      }
    });
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const autoFillFromWebsite = async () => {
    const url = (watch('website') || '').trim();
    if (!url) {
      alert('Сначала вставь ссылку в поле «Сайт».');
      return;
    }
    try {
      setScraping(true);
      const res = await fetch('/api/scrape-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Не удалось получить данные');
      }

      const d = json.data || {};

      // Аккуратно подставляем только то, что нашли
      if (d.title) setValue('title', d.title);
      if (d.description) setValue('description', d.description);
      if (d.start_date) setValue('start_date', d.start_date);
      if (d.start_time) setValue('start_time', d.start_time);
      if (d.end_date) setValue('end_date', d.end_date);
      if (d.end_time) setValue('end_time', d.end_time);
      if (d.address) setValue('address', d.address);

      alert('Готово! Я заполнила поля. Проверь и дополни при необходимости.');
    } catch (e: any) {
      alert('Автозаполнение не удалось: ' + e.message);
    } finally {
      setScraping(false);
    }
  };

  const [sortBy, setSortBy] = useState<'created_at' | 'start_date' | 'end_date' | 'title'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchEvents = async (reset = false) => {
    const from = reset ? 0 : firstLoadLimit + (page - 1) * loadMoreLimit;
    const to = from + (reset ? firstLoadLimit : loadMoreLimit) - 1;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) {
      console.error('Ошибка при загрузке событий:', error.message);
      return;
    }

    if (reset) {
      setEvents(data || []);
      setPage(1);
      setHasMore((data?.length || 0) === firstLoadLimit);
    } else {
      setEvents(prev => [...prev, ...(data || [])]);
      setPage(prev => prev + 1);
      if (!data || data.length < loadMoreLimit) setHasMore(false);
    }
  };

  const searchEvents = async (query: string) => {
    if (!query || query.trim() === '') {
      // пустой запрос — возвращаемся к обычной пагинации с нуля
      await fetchEvents(true);
      return;
    }

    setIsSearching(true);
    try {
      // Ищем по нескольким полям: title, description, address, website
      // ILIKE = регистронезависимый поиск. %…% — подстрока.
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .or(
          [
            `title.ilike.%${query}%`,
            `description.ilike.%${query}%`,
            `address.ilike.%${query}%`,
            `website.ilike.%${query}%`,
          ].join(',')
        )
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .limit(200); // чтобы не перегружать; можно увеличить при желании

      if (error) {
        console.error('Ошибка поиска:', error.message);
        return;
      }

      // Переписываем текущий список результатами поиска
      setEvents(data || []);
      setHasMore(false); // при поиске страницу "Показать ещё" скрываем
      setPage(1);
    } finally {
      setIsSearching(false);
    }
  };

  const archiveEvents = async (dateString: string) => {
    if (!dateString) {
      alert('Выберите дату');
      return;
    }

    const { data: oldEvents, error } = await supabase
      .from('events')
      .select('*')
      .lte('end_date', dateString);

    if (error) {
      console.error('Ошибка при получении событий:', error.message);
      alert('Ошибка при получении событий');
      return;
    }

    if (!oldEvents || oldEvents.length === 0) {
      alert('Событий для архивации не найдено');
      return;
    }

    const { error: insertError } = await supabase
      .from('old_events')
      .insert(oldEvents);

    if (insertError) {
      console.error('Ошибка при вставке в old_events:', insertError.message);
      alert('Ошибка при переносе в архив');
      return;
    }

    const ids = oldEvents.map((e) => e.id);
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('Ошибка при удалении из events:', deleteError.message);
      alert('Архивировано частично (не удалены из основной таблицы)');
    } else {
      alert(`Архивировано ${oldEvents.length} событий`);
      fetchEvents(true); 
      setSearch('');
    }
  };

  const scrollToCard = (id: string) => {
    const el = document.getElementById(`event-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const copyEvent = async (event: any) => {
    const { id, created_at, updated_at, ...rest } = event; 
    const newEvent = {
      ...rest,
      user_id: user?.id || null,
      start_date: rest.start_date || null,
      start_time: rest.start_time || null,
      end_time: rest.end_time || null,
      description_en: rest.description_en || null,
      description_de: rest.description_de || null,
      description_fr: rest.description_fr || null,
      description_it: rest.description_it || null,
      description_ru: rest.description_ru || null,
      age_group: rest.age_group || null,
      format: rest.format || null,
      type: rest.type || null,
      // created_at убираем — пусть БД ставит сама
    };

    // 🔴 ВАЖНО: вставляем ОДИН объект (без массива) и просим вернуть id
    const { data, error } = await supabase
      .from('events')
      .insert(newEvent)
      .select('id')    // верни id
      .single();       // один ряд

    if (error) {
      console.error('Ошибка при копировании:', error.message);
      alert('Ошибка при копировании: ' + error.message);
      return;
    }

    const newId = data?.id;
    // 1) перечитать список с нуля, чтобы новая карточка гарантированно была в DOM
    await fetchEvents(true);

    // 2) маленькая пауза, чтобы React успел отрисовать карточки, и крутимся к новой
    if (newId) {
      setTimeout(() => scrollToCard(newId), 0);
    }
  };

  const clearGoogleSearch = () => {
    // очистим значения, которые мы храним в форме
    setValue('address', '');
    setValue('lat', undefined as any);
    setValue('lng', undefined as any);
    // и перемонтируем сам компонент поиска, чтобы его внутренний input стал пустым
    setGmapsResetKey((k) => k + 1);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  useEffect(() => {
    const age = watch('age_group');
    if (Array.isArray(age) && age.includes('any')) {
      // Если выбрали 'any', устанавливаем ВСЕ возрастные группы
      setValue('age_group', ageGroups);
    }
  }, [watch('age_group')]); 

  useEffect(() => {
  const t = setTimeout(() => {
    searchEvents(search.trim());
  }, 400); // подождём 0.4 сек после ввода

  return () => clearTimeout(t);
}, [search, sortBy, sortOrder]);

  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if (name === 'start_date') {
        const newStartDate = value.start_date;
        const currentEndDate = value.end_date;
        if (!currentEndDate || currentEndDate === '') {
          setValue('end_date', newStartDate);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  useEffect(() => {
    fetchEvents(true); // при смене сортировки
  }, [sortBy, sortOrder]);

  useEffect(() => {
    fetchUser(); // 👈 нужно вызывать, иначе user будет всегда null
  }, []);

  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Event Input Form</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{user.email}</span>
          <button onClick={signOut} className="bg-gray-300 text-black px-3 py-1 rounded">
            Выйти
          </button>
        </div>
      </div>

      <div ref={formRef}>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 shadow rounded space-y-4">

          {/* Название */}
          <div>
            <div className="flex items-center gap-2">
              <span>{getMarker(watch('title'))}</span>
              <textarea
                placeholder="Наименование события"
                {...register('title')}
                className="border border-gray-400 text-lg w-full px-4 resize overflow-auto h-16"
              />
            </div>
          </div>

          {/* Описание (оригинал) */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span>{getMarker(watch('description'))}</span>
              <textarea
                placeholder="Описание (оригинал)"
                {...register('description')}
                className="border border-gray-400 h-40 text-base w-full max-w-full px-4 resize overflow-auto"
              />
            </div>
          </div>

          {/* Адрес и Google Maps поиск */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span>{getMarker(watch('address'))}</span>
              <textarea
                placeholder="Адрес (выбирается из Google)"
                {...register('address')}
                className="border border-gray-400 h-16 text-base w-full max-w-full px-4 resize overflow-auto"
              />
            </div>
            <GoogleMapsSearch key={gmapsResetKey} onPlaceSelected={onPlaceSelected} />
          </div>

          {/* скрытые координаты */}
          <input type="hidden" {...register('lat')} />
          <input type="hidden" {...register('lng')} />

          {/* Вебсайт + типы */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <span>{getMarker(watch('website'))}</span>
              <textarea
                placeholder="Сайт"
                {...register('website')}
                className="border border-gray-400 h-16 text-base w-full px-4 resize overflow-auto"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={autoFillFromWebsite}
                  disabled={scraping}
                  className="bg-purple-600 text-white px-3 py-1 rounded disabled:opacity-60"
                >
                  {scraping ? 'Заполняю…' : 'Автозаполнить с сайта'}
                </button>
                <span className="text-xs text-gray-500">
                  Помощник: может не сработать на некоторых сайтах
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1">{getMarker(watch('type') || [])}</span>
              <div className="flex flex-col space-y-2">
                {[0, 1, 2].map((rowIndex) => (
                  <div key={rowIndex} className="flex flex-wrap gap-4">
                    {eventType.slice(rowIndex * 9, (rowIndex + 1) * 9).map((option) => (
                      <label key={option} className="flex items-center gap-1 text-base text-gray-800">
                        <input
                          type="checkbox"
                          value={option}
                          {...register('type')}
                          className="form-checkbox"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Старт / Конец / Возраст / Формат */}
          <div className="flex flex-wrap md:flex-nowrap items-start gap-4">

            <div className="flex items-center gap-2 shrink-0">
              <span>{getMarker(watch('start_date') && watch('start_time'))}</span>
              <input
                type="date"
                {...register('start_date')}
                className="border border-gray-400 rounded px-2 py-1 w-[9.5rem]"
              />
              <input
                type="time"
                {...register('start_time')}
                className="border border-gray-400 rounded px-2 py-1 w-[5.5rem]"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span>{getMarker(watch('end_date') && watch('end_time'))}</span>
              <input
                type="date"
                {...register('end_date')}
                className="border border-gray-400 rounded px-2 py-1 w-[9.5rem]"
              />
              <input
                type="time"
                {...register('end_time')}
                className="border border-gray-400 rounded px-2 py-1 w-[5.5rem]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span>{getMarker(watch('age_group') || [])}</span>
              <div className="flex flex-wrap items-center gap-3">
                {ageGroups.map((option) => (
                  <label key={option} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      value={option}
                      {...register('age_group')}
                      className="form-checkbox"
                    />
                    <span className="font-medium text-gray-800">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span>{getMarker(watch('format'))}</span>
              <select
                {...register('format')}
                className="border border-gray-400 rounded px-2 py-1 w-40"
              >
                <option value="">Формат события</option>
                {formats.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Повтор */}
          <div className="grid grid-cols-2 gap-4">
            <select {...register('repeat')} className="border border-gray-400 rounded px-2 py-1 w-full">
              <option value="">Без повтора</option>
              <option value="weekly">Еженедельно</option>
              <option value="monthly">Ежемесячно</option>
            </select>
            <input type="date" {...register('repeat_until')} className="border border-gray-400 rounded px-2 py-1 w-full" />
          </div>

          {/* Описания на языках */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <textarea placeholder="Описание (en)" {...register('description_en')} className="border border-gray-400 h-24 text-sm w-full max-w-full px-4 resize overflow-auto" />
            <textarea placeholder="Описание (de)" {...register('description_de')} className="border border-gray-400 h-24 text-sm w-full max-w-full px-4 resize overflow-auto" />
            <textarea placeholder="Описание (fr)" {...register('description_fr')} className="border border-gray-400 h-24 text-sm w-full max-w-full px-4 resize overflow-auto" />
            <textarea placeholder="Описание (it)" {...register('description_it')} className="border border-gray-400 h-24 text-sm w-full max-w-full px-4 resize overflow-auto" />
            <textarea placeholder="Описание (ru)" {...register('description_ru')} className="border border-gray-400 h-24 text-sm w-full max-w-full px-4 resize overflow-auto" />
          </div>

          {/* Кнопки */}
          <div className="flex gap-4">
            <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
              {editingId ? 'Обновить' : 'Сохранить'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setEditingId(null);
                }}
                className="bg-gray-400 text-white px-4 py-2 rounded"
              >
                Отмена
              </button>
            )}

            <button
              type="button"
              className="bg-yellow-500 text-white px-4 py-2 rounded"
              onClick={() => setArchiveOpen(true)}
            >
              Архивировать события
            </button>

            {archiveOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div className="bg-white p-6 rounded shadow-lg space-y-4 w-[300px]">
                  <h2 className="text-lg font-semibold">Архивировать события</h2>
                  <input
                    type="date"
                    value={archiveDate}
                    onChange={(e) => setArchiveDate(e.target.value)}
                    className="border border-gray-400 px-2 py-1 w-full"
                  />
                  <div className="flex justify-between gap-2">
                    <button
                      onClick={() => setArchiveOpen(false)}
                      className="bg-gray-300 text-black px-3 py-1 rounded"
                    >
                      Отмена
                    </button>
                    <button
                      className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                      onClick={() => setArchiveOpen(true)}
                    >
                      Архивировать события
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
      <ArchiveDialog
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        fetchEvents={fetchEvents}
      />

      <div className="flex items-center gap-4">
        <label className="font-semibold text-gray-800">Сортировать по:</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="input"
        >
          <option value="created_at">Дате добавления</option>
          <option value="start_date">Дате начала</option>
          <option value="end_date">Дате окончания</option>
          <option value="title">Наименованию</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
          className="input"
        >
          <option value="asc">↑ По возрастанию</option>
          <option value="desc">↓ По убыванию</option>
        </select>
      </div>

      <div className="flex gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию, описанию, адресу, сайту..."
          className="border border-gray-400 rounded px-3 py-2 w-full max-w-xl"
        />
        <button
          type="button"
          onClick={() => setSearch('')}
          className="px-3 py-2 bg-gray-200 rounded"
        >
          Сброс
        </button>
        {isSearching && <span className="text-sm text-gray-600">Ищу…</span>}
      </div>

      <hr className="mt-4 border-black" />
      <div className="space-y-2">
        {events.map(event => (
          <div key={event.id}
            id={`event-${event.id}`}  className="bg-white p-4 shadow rounded border border-gray-200 space-y-1">
            <div className="font-bold text-black text-base">{event.title}</div>
            <div className="text-sm text-gray-600">
              {formatDate(event.start_date)} {event.start_time?.slice(0, 5)}
              {event.end_date ? (
                <> — {formatDate(event.end_date)} {event.end_time?.slice(0, 5)}</>
              ) : null}
            </div>
            <div className="text-sm text-blue-700 underline">{event.website}</div>
            <div className="flex gap-4 mt-2">
              <button onClick={() => deleteEvent(event.id)} className="text-red-500">
                Удалить
              </button>
              <button onClick={() => editEvent(event)} className="text-blue-500">
                Редактировать
              </button>
              <button onClick={() => copyEvent(event)} className="text-green-500">
                Копировать
              </button>
            </div>
            <hr className="mt-4 border-black" />
          </div>
        ))}
        {hasMore && (
          <div className="text-center mt-4">
            <button
              onClick={() => fetchEvents()}
              className="bg-gray-200 hover:bg-gray-300 text-black px-4 py-2 rounded"
            >
              Показать ещё
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
