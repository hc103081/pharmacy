import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// NHI Drug Lookup API endpoint
const NHI_API_URL = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset'
const NHI_DATASET_ID = 'A21030000I-E41001-001'

serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Get the last update time from the database (optional)
    const { data: lastUpdate } = await supabase
      .from('nhi_drug_lookup')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    // For now, we'll always fetch the full data
    // In production, you might want to check if we need to update based on last_update
    
    // Fetch the CSV data from NHi
    const response = await fetch(`${NHI_API_URL}?rId=${NHI_DATASET_ID}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch NHI data: ${response.status}`)
    }
    
    // Get the CSV text
    const csvText = await response.text()
    
    // Parse CSV
    const lines = csvText.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim())
    
    // Find the indices of the columns we need
    const drugCodeIndex = headers.indexOf('藥品代號')
    const chineseNameIndex = headers.indexOf('藥品中文名稱')
    const englishNameIndex = headers.indexOf('藥品英文名稱')
    
    if (drugCodeIndex === -1 || chineseNameIndex === -1) {
      throw new Error('Required columns not found in NHI data')
    }
    
    // Process each row
    const records = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim())
      if (cols.length <= Math.max(drugCodeIndex, chineseNameIndex)) continue
      
      const drugCode = cols[drugCodeIndex]
      const chineseName = cols[chineseNameIndex]
      const englishName = englishNameIndex !== -1 ? cols[englishNameIndex] : null
      
      if (drugCode && chineseName) {
        records.push({
          drug_code: drugCode,
          chinese_name: chineseName,
          english_name: englishName || null,
          updated_at: new Date().toISOString()
        })
      }
    }
    
    // Upsert records in batches
    const batchSize = 1000
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      
      const { error } = await supabase
        .from('nhi_drug_lookup')
        .upsert(batch, { onConflict: ['drug_code'] })
        
      if (error) {
        throw new Error(`Failed to upsert batch: ${error.message}`)
      }
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Successfully updated ${records.length} NHI drug records`,
      count: records.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in NHI lookup function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})