import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function validateAuthToken() {
  const headersList = headers()
  const apiKey = headersList.get('x-api-key')

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return null
}
