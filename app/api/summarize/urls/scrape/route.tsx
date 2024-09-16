import { NextRequest } from 'next/server'

import { RouteMessageMap } from '@/types/upstash'
import { verifyUpstashSignature } from '@/utils/upstash'
import { processUrl } from '@/utils/urls'

// Serverless Functions must have a maxDuration between 1 and 60 for plan hobby.
// export const maxDuration = 300
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body: RouteMessageMap['/api/summarize/urls/scrape'] =
    await verifyUpstashSignature(req)
  await processUrl(body.url, body.keys.urlsKey)

  return new Response('ok', { status: 200 })
}
