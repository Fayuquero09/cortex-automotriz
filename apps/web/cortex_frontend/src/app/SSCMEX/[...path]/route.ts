import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

function buildUrl(base: string, rel: string) {
  const cleanBase = base.replace(/\/$/, '');
  const cleanRel = rel.startsWith('/') ? rel : `/${rel}`;
  return `${cleanBase}${cleanRel}`;
}

export async function GET(_req: NextRequest, ctx: { params: { path?: string[] } }) {
  const parts = ctx.params.path ?? [];
  const rel = `/SSCMEX/${parts.join('/')}`;
  const upstream = process.env.JATO_MEDIA_BASE;

  try {
    if (upstream) {
      const url = buildUrl(upstream, rel);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        return new Response(`Upstream error ${res.status}`, { status: res.status });
      }
      const buf = await res.arrayBuffer();
      const ct = res.headers.get('content-type') ?? 'image/jpeg';
      return new Response(buf, {
        status: 200,
        headers: {
          'content-type': ct,
          'cache-control': 'public, max-age=3600',
        },
      });
    }
  } catch (e) {
    // fallthrough to local/placeholder
  }

  try {
    const publicRoot = process.env.JATO_MEDIA_LOCAL_ROOT
      ? path.resolve(process.env.JATO_MEDIA_LOCAL_ROOT)
      : path.join(process.cwd(), 'public');
    const sanitizedRel = rel.replace(/^\/+/, '');
    const diskPath = path.join(publicRoot, sanitizedRel);
    const file = await fs.readFile(diskPath);
    const ext = path.extname(diskPath).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return new Response(file, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    // fallthrough to placeholder
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <rect width="100%" height="100%" fill="#f0f0f0"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#666">
    Imagen no disponible (configura JATO_MEDIA_BASE)
  </text>
  <text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#999">
    ${rel}
  </text>
  </svg>`;
  return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
}
