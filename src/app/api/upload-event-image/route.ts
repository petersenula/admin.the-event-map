export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const eventId = formData.get('eventId')?.toString();

    if (!file || !eventId) {
      return NextResponse.json({ error: 'file and eventId required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileName = `${eventId}_${Date.now()}.jpg`;

    const { data: uploaded, error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(fileName, bytes, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage
      .from('event-images')
      .getPublicUrl(uploaded.path);

    const publicUrl = pub?.publicUrl;

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
