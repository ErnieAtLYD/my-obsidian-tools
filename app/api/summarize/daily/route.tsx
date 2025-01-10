import { NextRequest } from 'next/server'
import { validateAuthToken } from '@/middleware/auth'
import { validateEnvVars } from '@/utils/env-validator'
import { createSuccessResponse, createErrorResponse } from '@/utils/response'
import { processDailySummary } from './services/daily-summary'
import { processNewUrls } from './services/url-processor'
import { verifyUpstashSignature } from '@/utils/upstash'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/summarize/daily started')
    const body = await verifyUpstashSignature(req)
    
    const summary = await processDailySummary(body)
    if (!summary) {
      return createSuccessResponse('No notes found')
    }

    return createSuccessResponse()
  } catch (error) {
    console.error('Error in POST /api/summarize/daily:', error)
    return createErrorResponse(error as Error)
  }
}

export async function GET(req: NextRequest) {
  try {
    validateAuthToken(req)
    validateEnvVars([
      'YOUR_NAME',
      'OPENAI_API_KEY',
      'GITHUB_USERNAME',
      'GITHUB_REPO',
    ])

    const recentFiles = await getRecentFiles(
      process.env.GITHUB_USERNAME!,
      process.env.GITHUB_REPO!
    )
    const keys = getQueueKeys('daily-note-queue')

    const usefulUrls = await processNewUrls(recentFiles, keys)
    await queueUrlProcessing(usefulUrls, keys)
    await queueNoteProcessing(recentFiles, keys)
    await queueDailySummary(keys)

    return createSuccessResponse()
  } catch (error) {
    console.error('Error in GET /api/summarize/daily:', error)
    return createErrorResponse(error as Error)
  }
}
