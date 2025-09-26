'use client';

import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { supabase } from '../../lib/supabase'

export default function ArchiveDialog({
  isOpen,
  onClose,
  fetchEvents,
}: {
  isOpen: boolean;
  onClose: () => void;
  fetchEvents: () => void;
}) {
  const [archiveDate, setArchiveDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleArchive = async () => {
    if (!archiveDate) {
      setMessage('Укажи дату архивации');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data: eventsToArchive, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .lte('end_date', archiveDate);

      if (fetchError) throw fetchError;
      if (!eventsToArchive || eventsToArchive.length === 0) {
        setMessage('Нет событий для архивации');
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('old_events')
        .insert(eventsToArchive);

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .in('id', eventsToArchive.map(e => e.id));

      if (deleteError) throw deleteError;

      setMessage(`Архивировано ${eventsToArchive.length} событий`);
      fetchEvents();
      setArchiveDate('');
    } catch (error: any) {
      console.error(error);
      setMessage('Ошибка архивации: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-sm rounded bg-white p-6 shadow">
          <Dialog.Title className="text-lg font-bold mb-4">Архивировать события</Dialog.Title>

          <input
            type="date"
            className="w-full border rounded px-2 py-1 mb-4"
            value={archiveDate}
            onChange={(e) => setArchiveDate(e.target.value)}
          />

          {message && <p className="text-sm text-red-600 mb-4">{message}</p>}

          <div className="flex justify-end gap-2">
            <button
              className="px-4 py-2 bg-gray-300 text-black rounded hover:bg-gray-400"
              onClick={onClose}
              disabled={loading}
            >
              Отмена
            </button>
            <button
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              onClick={handleArchive}
              disabled={loading}
            >
              {loading ? 'Обработка...' : 'Перенести'}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
