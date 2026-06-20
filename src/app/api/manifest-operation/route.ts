import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { operation, manifestId } = body as {
      operation: 'archive' | 'restore';
      manifestId: string;
    };

    if (!operation || !manifestId) {
      return NextResponse.json(
        { status: 'error', message: 'Missing operation or manifestId' },
        { status: 400 }
      );
    }

    // Determine which Edge Function to call
    let edgeFunctionPath: string;
    if (operation === 'archive') {
      edgeFunctionPath = 'archive-manifest';
    } else if (operation === 'restore') {
      edgeFunctionPath = 'restore-manifest';
    } else {
      return NextResponse.json(
        { status: 'error', message: 'Invalid operation' },
        { status: 400 }
      );
    }

    // Forward the request to the Edge Function
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edgeFunctionPath}`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        manifestId,
        trigger: 'manual',
      }),
    });

    // Read the full response body (Edge Function returns SSE stream or JSON)
    const responseText = await response.text();

    // Try to parse the SSE stream to find the final status
    // SSE format: "data: {...}\n\n"
    let finalStatus = 'completed';
    let finalMessage = '封存完成';
    let lastPayload: any = null;

    const lines = responseText.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          lastPayload = JSON.parse(line.slice(6));
        } catch {
          // skip malformed lines
        }
      }
    }

    if (lastPayload) {
      finalStatus = lastPayload.status || 'completed';
      finalMessage = lastPayload.message || '封存完成';
    }

    // If the Edge Function itself returned an error status
    if (!response.ok && !lastPayload) {
      return NextResponse.json(
        { status: 'error', message: responseText || 'Edge function error' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: finalStatus,
      message: finalMessage,
    });
  } catch (error: any) {
    console.error('Manifest operation API error:', error);
    return NextResponse.json(
      { status: 'error', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
