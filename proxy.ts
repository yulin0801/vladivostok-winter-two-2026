import { NextRequest, NextResponse } from 'next/server';
import { isAllowedFrontendOrigin } from './app/lib/origin';

const methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const allowedHeaders = new Set(['content-type', 'x-trip-editor']);

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = isAllowedFrontendOrigin(origin);
  let response: NextResponse;
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('access-control-request-method') || '';
    const headers = (request.headers.get('access-control-request-headers') || '')
      .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!allowed || !methods.includes(method) || headers.some(header => !allowedHeaders.has(header))) {
      return new NextResponse(null, {status:403, headers:{Vary:'Origin'}});
    }
    response = new NextResponse(null, {status:204});
    response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Trip-Editor');
    response.headers.set('Access-Control-Max-Age', '600');
  } else {
    response = NextResponse.next();
  }
  response.headers.set('Vary', 'Origin');
  if (allowed && origin) response.headers.set('Access-Control-Allow-Origin', origin);
  return response;
}

export const config = { matcher: '/api/:path*' };
