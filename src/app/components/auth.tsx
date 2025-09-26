'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

// БАЗОВЫЙ URL АДМИНКИ для локали и прода
const ADMIN_BASE =
  typeof window !== 'undefined'
    ? window.location.origin // локалка: http://localhost:3001 ; прод: домен админки
    : 'https://admin.the-event-map.com'; // запасной вариант на сервере

// КУДА ПОПАДАТЬ ПОСЛЕ ВХОДА (выбери свой путь)
const ADMIN_HOME = `${ADMIN_BASE}/`; // или `${ADMIN_BASE}/dashboard`

export default function AuthForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: ADMIN_HOME },
    });
  };

  const signInWithEmail = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: ADMIN_HOME },
    });
    if (error) alert('Ошибка отправки письма: ' + error.message);
    else setSent(true);
  };

  return (
    <div className="bg-white p-6 shadow rounded space-y-4 max-w-md mx-auto mt-10">
      <h2 className="text-xl font-bold text-center">Вход</h2>
      <button onClick={signInWithGoogle} className="w-full bg-green-500 text-white py-2 rounded">
        Войти через Google
      </button>
      <div className="text-center text-sm text-gray-500">или</div>
      {!sent ? (
        <>
          <input
            type="email"
            placeholder="Email"
            className="input w-full px-4 py-2 border rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={signInWithEmail} className="w-full bg-blue-500 text-white py-2 rounded">
            Отправить ссылку на вход
          </button>
        </>
      ) : (
        <div className="text-center text-green-600 text-sm">Ссылка для входа отправлена на {email}</div>
      )}
    </div>
  );
}
