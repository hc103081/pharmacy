import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_TOKEN || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export const dynamic = 'force-dynamic'

async function processQueueItem(): Promise<boolean> {
  // Get the oldest unprocessed queue item
  const { data: queueItem, error: fetchError } = await supabase
    .from('nhi_refresh_queue')
    .select('id')
    .eq('processed', false)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    console.error('Error fetching queue item:', fetchError)
    return false
  }

  if (!queueItem) {
    // No items to process
    return false
  }

  try {
    // Reset the import state
    const { error: resetError } = await supabase
      .from('nhi_import_state')
      .upsert({ id: 1, last_row: 0 }, { onConflict: 'id' })

    if (resetError) {
      throw resetError
    }

    // Call the NHI refresh Edge Function
    const functionUrl = `${SUPABASE_URL}/functions/v1/refresh-nhi-lookup`
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Edge Function returned ${response.status}: ${errorText}`)
    }

    // Mark the queue item as processed
    const { error: updateError } = await supabase
      .from('nhi_refresh_queue')
      .update({ 
        processed: true, 
        processed_at: new Date().toISOString() 
      })
      .eq('id', queueItem.id)

    if (updateError) {
      throw updateError
    }

    return true
  } catch (error) {
    console.error('Error processing queue item:', error)
    // Optionally, you could update the queue item with an error message here
    return false
  }
}

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron or has the correct secret
  const expectedSecret = CRON_SECRET
  const providedSecret = request.headers.get('x-cron-secret') || ''
  const cronHeader = request.headers.get('x-vercel-cron')

  if (!cronHeader && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const processed = await processQueueItem()
    
    if (processed) {
      return NextResponse.json({ 
        success: true, 
        message: 'Processed one queue item' 
      })
    } else {
      return NextResponse.json({ 
        success: true, 
        message: 'No queue items to process' 
      })
    }
  } catch (error) {
    console.error('Cron job failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}