import dayjs from 'dayjs'
import { NextRequest } from 'next/server'

import {
  AiSummaryFormat,
  getDailySummarySystemPrompt,
} from '@/prompts/summarize/daily-summary-user'
import { RouteMessageMap } from '@/types/upstash'
import { UrlBodies } from '@/types/urls'
import { anthropic } from '@/utils/ai'
import { formatCalendarEvents, getDaysEvents } from '@/utils/calendar'
import { createOrUpdateFile } from '@/utils/github'
import { redis } from '@/utils/redis'
import { verifyUpstashSignature } from '@/utils/upstash'

interface Note {
  title: string
  summary: string
}

interface UrlContent {
  title: string
  summary: string
}

interface DailySummary {
  overallSummary: string
  interestingIdeas: string[]
  commonThemes: string[]
  questionsForExploration: string[]
  nextSteps: string[]
}

export async function getDailySummary(req: NextRequest) {
  const body: RouteMessageMap['/api/summarize/daily'] =
    await verifyUpstashSignature(req)

  const [urlBodies, notes] = await Promise.all([
    redis.hgetall<UrlBodies>(body.urlsKey),
    redis.hgetall<Record<string, string>>(body.notesKey),
  ])

  if (!notes || Object.keys(notes).length === 0) {
    return null
  }

  const notesArray = formatNotesArray(notes)
  const urlsArray = urlBodies ? formatUrlsArray(urlBodies) : null

  const aiResponse = await generateAiSummary(notesArray, urlsArray)
  const parsed = await parseAiResponse(aiResponse)

  const events =
    process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
      ? await getDaysEvents()
      : null
  const eventsSection = events ? await formatCalendarEvents(events) : null

  const responseContent = await generateResponseContent({
    date: body.date,
    parsed,
    eventsSection,
    notes,
    urlBodies,
  })

  await createOrUpdateFile({
    filename: `${process.env.DAILY_SUMMARY_NAME} ${body.date}${process.env.NODE_ENV === 'development' ? '-DEV' : ''}.md`,
    content: responseContent,
    path: process.env.DAILY_SUMMARY_FOLDER,
    inbox: true,
  })

  return responseContent
}

function formatNotesArray(notes: Record<string, string>): Note[] {
  return Object.entries(notes).map(([title, summary]) => ({
    title,
    summary: summary ?? '',
  }))
}

function formatUrlsArray(urlBodies: UrlBodies): UrlContent[] {
  return Object.entries(urlBodies).map(([url, content]) => ({
    title: content.title ?? '',
    summary: `${url}: ${content.summary ?? ''}`,
  }))
}

async function generateAiSummary(notes: Note[], urls: UrlContent[] | null) {
  const response = await anthropic.messages.create({
    messages: [
      {
        role: 'user',
        content: getDailySummarySystemPrompt({
          notes,
          urls,
        }),
      },
    ],
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 4000,
  })

  const content = response.content[0]
  if (!('text' in content)) {
    throw new Error('Unexpected response format')
  }
  return content.text
}

async function parseAiResponse(response: string): Promise<DailySummary> {
  try {
    const parsed = AiSummaryFormat.parse(JSON.parse(response))
    return {
      overallSummary: parsed.overallSummary ?? '',
      commonThemes: parsed.commonThemes ?? [],
      interestingIdeas: parsed.interestingIdeas ?? [],
      questionsForExploration: parsed.questionsForExploration ?? [],
      nextSteps: parsed.nextSteps ?? [],
    }
  } catch (error) {
    console.error('Error parsing response:', error)
    throw error
  }
}

async function generateResponseContent({
  date,
  parsed,
  eventsSection,
  notes,
  urlBodies,
}: {
  date: string
  parsed: DailySummary
  eventsSection: string | null
  notes: Record<string, string>
  urlBodies: UrlBodies | null
}) {
  let content = `# Daily Summary for ${dayjs(date).format('MMMM D, YYYY')}\n`

  if (eventsSection) {
    content += `## Calendar\n${eventsSection}`
  }

  content += `## Overall Summary\n${parsed.overallSummary}\n`
  content += `## Interesting Ideas\n- ${parsed.interestingIdeas.join('\n- ')}\n`
  content += `## Common Themes\n${parsed.commonThemes.join('\n- ')}\n`
  content += `## Questions for Exploration\n- ${parsed.questionsForExploration.join('\n- ')}\n`
  content += `## Possible Next Steps\n- ${parsed.nextSteps.join('\n- ')}`

  if (notes) {
    content += `\n---\n## Notes\n${formatNotesSection(notes)}`
  }

  if (urlBodies) {
    content += `\n---\n## Urls\n${formatUrlsSection(urlBodies)}`
  }

  return content
}

function formatNotesSection(notes: Record<string, string>): string {
  return Object.entries(notes)
    .map(([title, summary]) => {
      return `### [[${title.replace('.md', '')}]]\n${summary
        .replaceAll('<summary>', '')
        .replaceAll('</summary>', '')
        .trim()}`
    })
    .join('\n')
}

function formatUrlsSection(urlBodies: UrlBodies): string {
  return Object.entries(urlBodies)
    .map(([url, content]) => {
      if (content && 'title' in content && 'summary' in content) {
        const { title, summary } = content as { title: string; summary: string }
        return `- [${title}](${url})${summary ? `: ${summary}` : ''}`
      }
      return ''
    })
    .join('\n')
}
