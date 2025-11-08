export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

function absolutize(base: string, maybe?: string) {
  try { return maybe ? new URL(maybe, base).toString() : undefined; }
  catch { return undefined; }
}

async function pickImageUrlFromHtml(pageUrl: string, html: string) {
  const $ = cheerio.load(html);

  // 1) og:image
  const og = $('meta[property="og:image"]').attr('content');
  if (og) return absolutize(pageUrl, og);

  // 2) twitter:image
  const tw = $('meta[name="twitter:image"], meta[name="twitter:image:src"]').attr('content');
  if (tw) return absolutize(pageUrl, tw);

  // 3) JSON-LD schema.org
  const blocks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const t = $(el).text(); if (t) blocks.push(t);
  });
  for (const b of blocks) {
    try {
      const data = JSON.parse(b);
      const arr = Array.isArray(data) ? data : [data];
      for (const d of arr) {
        const img = d?.image || d?.imageUrl || d?.logo;
        if (typeof img === 'string') return absolutize(pageUrl, img);
        if (Array.isArray(img) && img.length) return absolutize(pageUrl, img[0]);
      }
    } catch {}
  }

  // 4) link rel="image_src"
  const linkImg = $('link[rel="image_src"]').attr('href');
  if (linkImg) return absolutize(pageUrl, linkImg);

  // 5) первая достаточно крупная <img>
  let best: { src?: string; area: number } = { area: 0 };
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    const w = parseInt($(el).attr('width') || '0', 10);
    const h = parseInt($(el).attr('height') || '0', 10);
    const area = (isFinite(w) ? w : 0) * (isFinite(h) ? h : 0);
    if (src && area >= best.area && area >= 300 * 200) best = { src, area };
  });
  if (best.src) return absolutize(pageUrl, best.src);

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const { url, eventId } = await req.json() as { url: string; eventId: string };
    if (!url || !eventId) return NextResponse.json({ error: 'url and eventId required' }, { status: 400 });

    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (EventMap Bot)' },
      redirect: 'follow'
    });
    if (!pageRes.ok) return NextResponse.json({ error: `cant fetch page: ${pageRes.status}` }, { status: 400 });
    const html = await pageRes.text();

    const imageUrl = await pickImageUrlFromHtml(url, html);
    if (!imageUrl) return NextResponse.json({ error: 'image not found' }, { status: 404 });

    const imgRes = await fetch(imageUrl, { redirect: 'follow' });
    if (!imgRes.ok) return NextResponse.json({ error: `cant fetch image: ${imgRes.status}` }, { status: 400 });

    const contentType = imgRes.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }

    const arr = await imgRes.arrayBuffer();
    let buffer = Buffer.from(arr);

    // ресайз (по желанию — красиво и единообразно)
    try {
      const sharp = (await import('sharp')).default;
      buffer = await sharp(buffer)
        .resize(1200, 630, { fit: 'cover' })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {}

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // серверный ключ
    );

    const fileName = `${eventId}_${Date.now()}.jpg`;
    const { data: put, error: putErr } = await supabase.storage
      .from('event-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false });

    if (putErr) return NextResponse.json({ error: putErr.message }, { status: 500 });
    const { data: pub } = supabase.storage.from('event-images').getPublicUrl(put.path);
    const publicUrl = pub?.publicUrl;

    // Запишем поля в events
    await supabase
      .from('events')
      .update({
        image_url: publicUrl,
        image_source: imageUrl,
        image_checked_at: new Date().toISOString()
      })
      .eq('id', eventId);

    return NextResponse.json({ ok: true, publicUrl, source: imageUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 });
  }
}
