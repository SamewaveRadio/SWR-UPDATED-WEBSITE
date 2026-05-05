import type { VercelRequest, VercelResponse } from '@vercel/node';

const AZURACAST_API_BASE = (process.env.EXPO_PUBLIC_AZURACAST_API_BASE || 'https://azuracast.samewaveradio.com/api').replace(/\/$/, '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let targetUrl: string;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    targetUrl = rawUrl;
  } else if (rawUrl.startsWith('//')) {
    targetUrl = `http:${rawUrl}`;
  } else {
    // relative URL — resolve against the AzuraCast base origin
    const base = new URL(AZURACAST_API_BASE);
    targetUrl = `${base.protocol}//${base.host}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(404).end();
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('[azuracast/art]', err);
    return res.status(502).end();
  }
}
