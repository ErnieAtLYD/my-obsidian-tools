import { Client, Receiver } from '@upstash/qstash'
import type { NextRequest } from 'next/server'
import pako from 'pako'
import getByteLength from 'string-byte-length'

import type { RouteMessageMap, UpstashRoute } from '@/types/upstash'

export { getByteLength, pako }

export const gzip = async (input: string): Promise<Buffer> => {
  return Buffer.from(pako.gzip(input))
}
const token = process.env.QSTASH_TOKEN
if (!token) {

const client = new Client({ token })

const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY
const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY

if (!currentKey || !nextKey) {
  throw new Error('Missing QStash signing keys')
}

const r = new Receiver({
  currentSigningKey: currentKey,
  nextSigningKey: nextKey,
})

type UpstashHeaders = {
  'Content-Type': string
  'Authorization': string
  'Upstash-Delay'?: string
  'Upstash-Not-Before'?: string
  'Upstash-Method'?: string
  'Content-Encoding'?: string
  'Upstash-Forward-Delay-Applied'?: string
}
export const upstashHeaders: UpstashHeaders = {
  'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
  'Content-Type': 'application/json',
}

export async function verifyUpstashSignature(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('Upstash-Signature') ?? ''
  let isValid = false
  try {
    isValid = await r.verify({ body, signature })
    if (!isValid) {
      console.log('Invalid signature')
      throw new Error('Invalid signature')
    }
  } catch (err) {
    console.log('Caught Error: ', err)
    throw new Error('Invalid signature')
  }
  return JSON.parse(body)
}

export async function getUpstashQueue(queueName: string) {
  const queue = client.queue({ queueName })
  return await queue.get();

}

// Add token validation helper
const validateQStashToken = () => {
  if (!process.env.QSTASH_TOKEN) {
    throw new Error('QSTASH_TOKEN is not defined')
  }
  if (process.env.QSTASH_TOKEN.trim() === '') {
    throw new Error('QSTASH_TOKEN is empty')
  }
}

export async function publishToUpstash<Route extends UpstashRoute>(
  url: Route,
  message: RouteMessageMap[Route],
  options?: {
    queue?: string
    queueParallelism?: number
    delay?: number
    absoluteDelay?: string
    upstashMethod?: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH'
  },
) {
  console.log('Starting publishToUpstash function')

  validateQStashToken()

  const urlPath = `${process.env.NEXT_PUBLIC_SITE_URL}${url}`

  try {
    const headers = {
      ...upstashHeaders,
      ...(options?.delay && { 'Upstash-Delay': options.delay.toString() }),
      ...(options?.absoluteDelay && {
        'Upstash-Not-Before': options.absoluteDelay,
      }),
      ...(options?.upstashMethod && {
        'Upstash-Method': options.upstashMethod,
      }),
    }

    const messageToSend = JSON.stringify(message)

    const response = await fetch(`${process.env.QSTASH_URL}${urlPath}`, {
      method: 'POST',
      headers,
      body: messageToSend,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Upstash API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
      })
      throw new Error(`Upstash API Error (${response.status}): ${errorText}`)
    }

    const responseData = await response.json()
    console.log('Successfully published to Upstash')
    return responseData
  } catch (error) {
    console.error('Error in publishToUpstash:', {
      error,
      token: process.env.QSTASH_TOKEN ? 'Present' : 'Missing',
      url: urlPath,
    })
    throw error
  }
}
