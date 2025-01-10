import { TextBlock } from '@anthropic-ai/sdk/resources/messages.mjs'
import dayjs from 'dayjs'
import { AiSummaryFormat } from '@/prompts/summarize/daily-summary-user'
import { UrlBodies } from '@/types/urls'
import { redis } from '@/utils/redis'
import { AiService } from '@/services/ai'
import { createOrUpdateFile } from '@/utils/github'
import { formatCalendarEvents, getDaysEvents } from '@/utils/calendar'

export async function processDailySummary(body: {
  urlsKey: string
  notesKey: string
  date: string
}) {
  const urlBodies: UrlBodies | null = await redis.hgetall(body.urlsKey)
  const notes: Record<string, string> | null = await redis.hgetall(body.notesKey)

  if (!notes || Object.keys(notes).length === 0) {
    return null
  }

  const [notesArray, urlsArray] = formatContent(notes, urlBodies)
  const aiResponse = await AiService.generateDailySummary(notesArray, urlsArray)
  const parsed = await parseAiResponse(aiResponse)
  
  const summaryContent = await generateSummaryContent({
    date: body.date,
    parsed,
    notes,
    urlBodies,
  })

  await saveSummaryToFile(summaryContent, body.date)
  
  return summaryContent
}

function formatContent(
  notes: Record<string, string>,
  urlBodies: UrlBodies | null
) {
  const notesArray = Object.entries(notes).map(([filename, note]) => ({
    title: filename,
    summary: note ?? '',
  }))

  const urlsArray = urlBodies 
    ? Object.entries(urlBodies).map(([url, content]) => ({
        title: content.title ?? '',
        summary: `${url}: ${content.summary ?? ''}`,
      }))
    : null

  return [notesArray, urlsArray]
}

async function parseAiResponse(response: TextBlock) {
  const responseString = response.text
  try {
    return AiSummaryFormat.parse(JSON.parse(responseString))
  } catch (error) {
    console.error('Error parsing response:', error)
    throw new Error('Failed to parse AI response')
  }
}

async function generateSummaryContent({
  date,
  parsed,
  notes,
  urlBodies,
}: {
  date: string
  parsed: any
  notes: Record<string, string>
  urlBodies: UrlBodies | null
}) {
  let eventsSection = ''
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    const events = await getDaysEvents()
    eventsSection = await formatCalendarEvents(events)
  }

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
    const notesList = Object.entries(notes)
      .map(([title, summary]) => {
        return `### [[${title.replace('.md', '')}]]\n${summary
          .replaceAll('<summary>', '')
          .replaceAll('</summary>', '')
          .trim()}`
      })
      .join('\n')
    content += `\n---\n## Notes\n${notesList}`
  }

  if (urlBodies) {
    const urlsList = Object.entries(urlBodies)
      .map(([url, content]) => {
        if (content) {
          const { title, summary } = content
          return `- [${title}](${url})${summary ? `: ${summary}` : ''}`
        }
        return ''
      })
      .join('\n')
    content += `\n---\n## Urls\n${urlsList}`
  }

  return content
}

async function saveSummaryToFile(content: string, date: string) {
  const filename = `${process.env.DAILY_SUMMARY_NAME} ${date}${
    process.env.NODE_ENV === 'development' ? `-DEV` : ''
  }.md`

  await createOrUpdateFile({
    filename,
    content,
    path: process.env.DAILY_SUMMARY_FOLDER,
    inbox: true,
  })
}
