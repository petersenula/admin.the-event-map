export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

/** Делает относительные пути абсолютными относительно страницы */
function absolutize(base: string, maybe?: string) {
  try {
    return maybe ? new URL(maybe, base).toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Небольшой ретраер для нестабильных 5xx */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
  delayMs = 700
): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return r;
      if (r.status >= 500) {
        await new Promise(res => setTimeout(res, delayMs * (i + 1)));
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      await new Promise(res => setTimeout(res, delayMs * (i + 1)));
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

/** Ищем лучший URL картинки на странице события */
async function pickImageUrlFromHtml(pageUrl: string, html: string) {
  const $ = cheerio.load(html);

  // 1) og:image
  const og = $('meta[property="og:image"]').attr('content');
  if (og) return absolutize(pageUrl, og);

  // 2) twitter:image
  const tw = $('meta[name="twitter:image"], meta[name="twitter:image:src"]').attr('content');
  if (tw) return absolutize(pageUrl, tw);

  // 3) JSON-LD
  const blocks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const t = $(el).text();
    if (t) blocks.push(t);
  });
  for (const b of blocks) {
    try {
      const data = JSON.parse(b);
      const arr = Array.isArray(data) ? data : [data];
      for (const d of arr) {
        const img = (d as any)?.image || (d as any)?.imageUrl || (d as any)?.logo;
        if (typeof img === 'string') return absolutize(pageUrl, img);
        if (Array.isArray(img) && img.length) return absolutize(pageUrl, img[0]);
      }
    } catch {}
  }

  // 4) link rel="image_src"
  const linkImg = $('link[rel="image_src"]').attr('href');
  if (linkImg) return absolutize(pageUrl, linkImg);

  // 5) srcset (берём самую большую)
  const srcset = $('img[srcset]').attr('srcset');
  if (srcset) {
    const parts = srcset.split(',').map(s => s.trim().split(' ')[0]);
    const last = parts[parts.length - 1];
    if (last) return absolutize(pageUrl, last);
  }

  // 6) первая осмысленная <img>
  const imgs = $('img');
  for (let i = 0; i < imgs.length; i++) {
    const el = imgs[i];
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (!src) continue;
    const lower = src.toLowerCase();
    if (lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp')) {
      return absolutize(pageUrl, src);
    }
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url: string; eventId: string };
    let { url, eventId } = body || ({} as any);

    if (!url || !eventId) {
      return NextResponse.json({ error: 'url and eventId required' }, { status: 400 });
    }

    // нормализуем URL
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    // env
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is missing' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing (server env)' }, { status: 500 });
    }

    // страница события
    const pageRes = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (EventMap Bot)' },
      redirect: 'follow',
    });
    if (!pageRes.ok) {
      return NextResponse.json({ error: `cant fetch page: ${pageRes.status}` }, { status: 400 });
    }
    const html = await pageRes.text();

    // ищем картинку
    const imageUrl = await pickImageUrlFromHtml(url, html);
    if (!imageUrl) {
      return NextResponse.json({ error: 'image not found' }, { status: 404 });
    }

    // скачиваем картинку
    const imgRes = await fetchWithRetry(imageUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (EventMap Bot)',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        Referer: url,
      },
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: `cant fetch image: ${imgRes.status}` }, { status: 400 });
    }

    const srcContentType = imgRes.headers.get('content-type') || '';
    if (!srcContentType.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    // байты исходника
    const arr = await imgRes.arrayBuffer();
    let bytes = new Uint8Array(arr);

    // выходной тип/расширение по умолчанию — webp превью
    let outContentType = 'image/webp';
    let outExt = 'webp';

    // уменьшаем и конвертируем (sharp → Buffer, потом обратно в чистый ArrayBuffer)
    try {
      const sharp = (await import('sharp')).default;
      const inputBuf = Buffer.from(bytes);
      const outBuf = await sharp(inputBuf)
        .resize(800, 450, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      const outAb = outBuf.buffer.slice(
        outBuf.byteOffset,
        outBuf.byteOffset + outBuf.byteLength
      ) as ArrayBuffer;

      bytes = new Uint8Array(outAb);
    } catch {
      // фолбек — заливаем оригинал
      outContentType = srcContentType || 'image/jpeg';
      outExt =
        outContentType.includes('png') ? 'png' :
        outContentType.includes('webp') ? 'webp' : 'jpg';
    }

    // Сохраняем в Storage и обновляем events
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // серверный ключ
    );

    const fileName = `${eventId}_${Date.now()}.${outExt}`;
    const { data: put, error: putErr } = await supabase.storage
      .from('event-images')
      .upload(fileName, bytes, {
        contentType: outContentType,
        upsert: false,
        cacheControl: '31536000, immutable',
      });

    if (putErr) {
      const msg = (putErr as any)?.message ?? JSON.stringify(putErr);
      return NextResponse.json({ error: 'storage upload: ' + msg }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from('event-images').getPublicUrl(put.path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: 'no publicUrl from storage' }, { status: 500 });
    }

    // апдейт события по id ИЛИ по uuid
    const { data: updated, error: upErr } = await supabase
      .from('events')
      .update({
        image_url: publicUrl,
        image_source: imageUrl,
        image_checked_at: new Date().toISOString(),
      })
      .or(`id.eq.${eventId},uuid.eq.${eventId}`)
      .select('id');

    if (upErr) {
      const msg =
        (upErr as any)?.message ??
        (typeof upErr === 'string' ? upErr : JSON.stringify(upErr));
      return NextResponse.json({ error: 'db update: ' + msg }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'event not found by id or uuid' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, publicUrl, source: imageUrl });
  } catch (e: any) {
    const msg = e?.message ?? (typeof e === 'string' ? e : JSON.stringify(e));
    return NextResponse.json({ error: msg || 'unknown error' }, { status: 500 });
  }
}
