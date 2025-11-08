export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TARGET_W = 800;
const TARGET_H = 450;

export async function POST(req: NextRequest) {
  try {
    // env checks
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is missing' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing on server' }, { status: 500 });
    }

    // payload
    const { url, eventId } = (await req.json()) as { url?: string; eventId?: string };
    if (!url || !eventId) {
      return NextResponse.json({ error: 'url and eventId required' }, { status: 400 });
    }

    // fetch image
    const resp = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (EventMap Bot)',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        Referer: url,
      },
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `cant fetch image: ${resp.status}` }, { status: 400 });
    }

    const srcContentType = resp.headers.get('content-type') || '';
    if (!srcContentType.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    // source bytes
    const arr = await resp.arrayBuffer();
    let bytes = new Uint8Array(arr);

    // output defaults (compact preview)
    let outContentType = 'image/webp';
    let outExt = 'webp';

    // convert/resize
    try {
      const sharp = (await import('sharp')).default;
      const inputBuf = Buffer.from(bytes);
      const outBuf = await sharp(inputBuf)
        .resize(TARGET_W, TARGET_H, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      const outAb = outBuf.buffer.slice(
        outBuf.byteOffset,
        outBuf.byteOffset + outBuf.byteLength
      ) as ArrayBuffer;

      bytes = new Uint8Array(outAb);
    } catch {
      // fallback to original
      outContentType = srcContentType || 'image/jpeg';
      outExt =
        outContentType.includes('png') ? 'png' :
        outContentType.includes('webp') ? 'webp' : 'jpg';
    }

    // upload to storage
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
      const msg = (uploadError as any)?.message ?? JSON.stringify(uploadError);
      return NextResponse.json({ error: 'storage upload: ' + msg }, { status: 500 });
    }

    const { data: pub } = supabase.storage
      .from('event-images')
      .getPublicUrl(uploaded.path);

    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: 'no publicUrl from storage' }, { status: 500 });
    }

    // update DB row by id OR uuid
    const { data: updated, error: upErr } = await supabase
      .from('events')
      .update({
        image_url: publicUrl,
        image_source: url,
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

    return NextResponse.json({ ok: true, publicUrl });
  } catch (e: any) {
    const msg = e?.message ?? (typeof e === 'string' ? e : JSON.stringify(e));
    return NextResponse.json({ error: msg || 'unknown error' }, { status: 500 });
  }
}
