import { NextResponse } from 'next/server'

export function createSuccessResponse(data?: any) {
  return NextResponse.json({ status: 'success', data }, { status: 200 })
}

export function createErrorResponse(error: Error) {
  console.error('Error:', error)
  return NextResponse.json(
    { 
      status: 'error', 
      message: error.message 
    }, 
    { status: error.message === 'Unauthorized' ? 401 : 500 }
  )
}
