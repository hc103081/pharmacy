import { NextResponse } from 'next/server';

export const config = {
  // Set to false to allow streaming responses
  api: {
    bodyParser: false,
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation') as 'archive' | 'restore';
    const manifestId = searchParams.get('manifestId');

    if (!operation || !manifestId) {
      return new NextResponse('Missing operation or manifestId parameter', { status: 400 });
    }

    // Determine which Edge Function to call
    let edgeFunctionPath: string;
    if (operation === 'archive') {
      edgeFunctionPath = 'archive-manifest';
    } else if (operation === 'restore') {
      edgeFunctionPath = 'restore-manifest';
    } else {
      return new NextResponse('Invalid operation', { status: 400 });
    }

    // Forward the request to the Edge Function
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edgeFunctionPath}`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the service role key for server-to-server communication
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        manifestId,
        trigger: 'manual', // User-initiated operation
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(`Edge function error: ${errorText}`, { status: response.status });
    }

    // Create a readable stream from the Edge Function's response and pipe it to the client
    const readableStream = response.body;
    if (!readableStream) {
      return new NextResponse('No response body', { status: 502 });
    }

    // Return the streaming response with appropriate headers for SSE
    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('Manifest operation API error:', error);
    return new NextResponse(`Internal server error: ${error.message}`, { status: 500 });
  }
}