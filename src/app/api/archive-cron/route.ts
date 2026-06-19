import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Forward the request to the archive-cron Edge Function
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/archive-cron`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the service role key for server-to-server communication
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      // Forward the body (should be empty or contain any parameters)
      body: await request.text(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(`Edge function error: ${errorText}`, { status: response.status });
    }

    // Get the JSON response from the Edge Function
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Archive cron API error:', error);
    return new NextResponse(`Internal server error: ${error.message}`, { status: 500 });
  }
}