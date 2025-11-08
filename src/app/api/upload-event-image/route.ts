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
    let bytes = new Uint8Array(arrayBuffer);
    let contentType = 'image/webp';
    let ext = 'webp';

    // Пытаемся уменьшить и перекодировать в WEBP
    try {
      const sharp = (await import('sharp')).default;
      bytes = await sharp(bytes)
        .resize(TARGET_W, TARGET_H, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      // Фолбек: оставим как есть
      contentType = file.type || 'image/jpeg';
      ext = contentType.includes('png') ? 'png' : (contentType.includes('webp') ? 'webp' : 'jpg');
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileName = `${eventId}_${Date.now()}.${ext}`;

    const { data: uploaded, error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(fileName, bytes, {
        contentType,
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
