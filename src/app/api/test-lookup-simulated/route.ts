import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.text().catch(() => '{}')
    const params = (() => {
      try { return JSON.parse(body) } catch { return {} }
    })()

    const delayMs = Number(params.delay ?? 400)
    const itemCode = String(params.itemCode ?? '').trim()

    await new Promise((resolve) => setTimeout(resolve, delayMs))

    const result = {
      ok: true,
      seen: `[${params.message ?? ''}]>>loop test done`,
      itemCode,
      item: itemCode ? drugLookupByCode(itemCode) : null,
      durationMs: delayMs,
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function drugLookupByCode(itemCode: string) {
  return {
    itemCode,
    chineseName: `模擬中文名_${itemCode}`,
    englishName: `mock-en-${itemCode}`,
    matched: true,
  }
}
