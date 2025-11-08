export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TARGET_W = 800;
const TARGET_H = 450;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const eventId = formData.get('eventId')?.toString();

    if (!file || !eventId) {
      return NextResponse.json({ error: 'file and eventId required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    // стартуем в виде Uint8Array с настоящим ArrayBuffer
    let bytes = new Uint8Array(arrayBuffer);

    // по умолчанию сохраняем компактное превью webp
    let outContentType = 'image/webp';
    let outExt = 'webp';

    // пробуем уменьшить/перекодировать
    try {
      const sharp = (await import('sharp')).default;

      // sharp удобнее кормить Buffer
      const inputBuf = Buffer.from(bytes);

      const outBuf = await sharp(inputBuf)
        .resize(TARGET_W, TARGET_H, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();

      // ПРИНЦИПИАЛЬНО: приводим Buffer к ЧИСТОМУ ArrayBuffer, затем к Uint8Array
      const outAb = outBuf.buffer.slice(
        outBuf.byteOffset,
        outBuf.byteOffset + outBuf.byteLength
      ) as ArrayBuffer;

      bytes = new Uint8Array(outAb);
    } catch {
      // фолбек — зальём оригинал и подберём тип/расширение
      const srcType = file.type || 'image/jpeg';
      outContentType = srcType;
      outExt = srcType.includes('png') ? 'png'
        : (srcType.includes('webp') ? 'webp' : 'jpg');
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
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage
      .from('event-images')
      .getPublicUrl(uploaded.path);

    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: 'no publicUrl from storage' }, { status: 500 });
    }

    // обновляем запись в таблице events
    await supabase
      .from('events')
      .update({
        image_url: publicUrl,
        image_source: 'manual',
        image_checked_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    return NextResponse.json({ ok: true, publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 });
  }
}
