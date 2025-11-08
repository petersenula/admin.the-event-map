export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TARGET_W = 800;
const TARGET_H = 450;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is missing' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing on server' }, { status: 500 });
    }

    const { url, eventId } = await req.json() as { url?: string; eventId?: string };
    if (!url || !eventId) {
      return NextResponse.json({ error: 'url and eventId required' }, { status: 400 });
    }

    const resp = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (EventMap Bot)',
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
        'Referer': url
      }
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `cant fetch image: ${resp.status}` }, { status: 400 });
    }

    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    const arr = await resp.arrayBuffer();

    // Изначально держим как Uint8Array c нормальным ArrayBuffer
    let bytes = new Uint8Array(arr);

    // Что будем отправлять в storage:
    let outContentType = 'image/webp';
    let outExt = 'webp';

    try {
    const sharp = (await import('sharp')).default;

    // sharp удобнее кормить Buffer:
    const inputBuf = Buffer.from(bytes);

    // Делаем превью
    const outBuf = await sharp(inputBuf)
        .resize(TARGET_W, TARGET_H, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

    // ВАЖНО: Превращаем Buffer в ЧИСТЫЙ ArrayBuffer (а не ArrayBufferLike)
    const outAb = outBuf.buffer.slice(
        outBuf.byteOffset,
        outBuf.byteOffset + outBuf.byteLength
    ) as ArrayBuffer;

    // Дальше снова работаем как с Uint8Array<ArrayBuffer>
    bytes = new Uint8Array(outAb);
    } catch {
    // Фолбек: используем оригинал и правильные тип/расширение
    outContentType = srcContentType || 'image/jpeg';
    outExt = outContentType.includes('png')
        ? 'png'
        : (outContentType.includes('webp') ? 'webp' : 'jpg');
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileName = `${eventId}_${Date.now()}.${outExt}`;
    const { data: uploaded, error: uploadError } = await supabase.storage
    .from('event-images')
    .upload(fileName, bytes, {
        contentType: outContentType,
        upsert: false,
        cacheControl: '31536000, immutable',
    });

    if (uploadError) {
      return NextResponse.json({ error: 'storage upload: ' + uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from('event-images').getPublicUrl(uploaded.path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: 'no publicUrl from storage' }, { status: 500 });
    }

    const { error: upErr } = await supabase
      .from('events')
      .update({
        image_url: publicUrl,
        image_source: url,
        image_checked_at: new Date().toISOString()
      })
      .eq('id', eventId);

    if (upErr) {
      return NextResponse.json({ error: 'db update: ' + upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 });
  }
}
