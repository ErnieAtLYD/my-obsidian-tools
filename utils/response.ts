import { NextResponse } from 'next/server'

interface ResponseData {
  [key: string]: unknown
}

export const successResponse = (data: ResponseData) => {
  return NextResponse.json({ data }, { status: 200 })
}

export const errorResponse = (error: string, status: number = 400) => {
  return NextResponse.json({ error }, { status })
}
