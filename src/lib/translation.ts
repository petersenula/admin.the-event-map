import axios from 'axios';

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY;

/**
 * Перевод текста с одного языка на другой с указанием sourceLang
 * @param text - исходный текст
 * @param targetLang - язык перевода (например, 'en')
 * @param sourceLang - исходный язык (например, 'de')
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string
): Promise<string> {
  if (!text || text.trim() === '') return '';

  if (!GOOGLE_API_KEY) {
    console.error('API ключ не найден в переменных окружения');
    return text;
  }

  const params = new URLSearchParams();
  params.append('q', text);
  params.append('target', targetLang);
  params.append('source', sourceLang); // <- теперь мы передаём исходный язык
  params.append('format', 'text');
  params.append('key', GOOGLE_API_KEY);

  try {
    const response = await axios.post(
      'https://translation.googleapis.com/language/translate/v2',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.data.translations[0].translatedText;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error('Ошибка перевода:');
      console.log('Полный ответ:', error.toJSON?.() || error);
      console.log('Ответ Google:', error.response?.data);
    } else {
      console.error('Неизвестная ошибка:', error);
    }
    return text;
  }
}
