import { NextRequest } from 'next/server'

import { validateAuthToken } from '@/middleware/auth'
import { validateEnvVariables } from '@/utils/env-validator'
import { getRecentFiles } from '@/utils/github'
import { getQueueKeys } from '@/utils/redis-queue'
import { errorResponse, successResponse } from '@/utils/response'
import { verifyUpstashSignature } from '@/utils/upstash'

import { processDailySummary } from './services/daily-summary'
import {
  queueDailySummary,
  queueNoteProcessing,
  queueUrlProcessing,
} from './services/queue'
import { processNewUrls } from './services/url-processor'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/summarize/daily started')
    const body = await verifyUpstashSignature(req)

    const summary = await processDailySummary(body)
    if (!summary) {
      return successResponse({ message: 'No notes found' })
    }

    return successResponse({ message: 'Daily summary processed' })
  } catch (error) {
    console.error('Error in POST /api/summarize/daily:', error)
    return errorResponse((error as Error).message)
  }
}

export async function GET(req: NextRequest) {
  try {
    validateAuthToken(req)
    validateEnvVariables(
      'YOUR_NAME',
      'OPENAI_API_KEY',
      'GITHUB_USERNAME',
      'GITHUB_REPO',
    )

    const recentFiles = await getRecentFiles(
      process.env.GITHUB_USERNAME!,
      process.env.GITHUB_REPO!,
    )
    const keys = getQueueKeys('daily-note-queue')

    const usefulUrls = await processNewUrls(recentFiles, keys)
    await queueUrlProcessing(usefulUrls, keys)
    await queueNoteProcessing(recentFiles, keys)
    await queueDailySummary(keys)

    return successResponse({ message: 'Daily summary processed' })
  } catch (error) {
    console.error('Error in GET /api/summarize/daily:', error)
    return errorResponse((error as Error).message)
  }
}
