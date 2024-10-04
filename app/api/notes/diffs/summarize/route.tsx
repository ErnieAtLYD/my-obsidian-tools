import type { NextRequest } from 'next/server'

import { getDiffSummarizationPrompt } from '@/prompts/notes/note-summary-user'
import type { RouteMessageMap } from '@/types/upstash'
import { anthropic } from '@/utils/ai'
import { redis } from '@/utils/redis'
import { verifyUpstashSignature } from '@/utils/upstash'

export async function POST(req: NextRequest) {
  console.log('/api/notes/diffs/summarize')

  try {
    const body: RouteMessageMap['/api/notes/diffs/summarize'] =
      await verifyUpstashSignature(req)

    const response = await anthropic.messages.create({
      max_tokens: 1000,
      model: 'claude-3-sonnet-20240229',
      messages: [
        {
          role: 'user',
          content: getDiffSummarizationPrompt(body.diff.diff),
        },
      ],
    })

    if (!response.content || response.content.length === 0) {
      throw new Error('No content found in response')
    }

    const responseContent =
      'text' in response.content[0] ? response.content[0].text : ''

    await redis.hset(body.keys.notesKey, {
      [body.diff.filename]: responseContent.trim(),
    })
    await redis.expire(body.keys.notesKey, 86400) // Set TTL for 24 hours

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('Error in /api/notes/diffs/summarize:', error)
    return new Response(
      `Error processing request: ${(error as Error).message}`,
      { status: 500 },
    )
  }
}
