import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the container image and for the post-deploy smoke test in
 * the release pipeline.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'admin',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-dev',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}
