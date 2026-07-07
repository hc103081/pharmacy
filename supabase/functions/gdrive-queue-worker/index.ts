import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_CONCURRENT_USERS = 3;
const USER_BATCH_DELAY_MS = 500;
const JOB_DELAY_MS = 500;

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function invokeGdriveMigrate(manifestId: string): Promise<void> {
  const functionsUrl = Deno.env.get('FUNCTIONS_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const response = await fetch(`${functionsUrl}/gdrive-migrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ manifestId, trigger: 'queue-worker' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`gdrive-migrate failed: ${response.status} ${errorText}`);
    // Attach status code for better error classification
    (error as any).statusCode = response.status;
    throw error;
  }
}

// Define error type with statusCode for error classification
interface MigrationError extends Error {
  statusCode?: number;
}

serve(async (_req: Request) => {
  try {
    console.log('[gdrive-queue-worker] Starting...');

    // Step 1: Get pending jobs + stuck processing jobs (>30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from('gdrive_migration_jobs')
      .select('id, manifest_id, user_id, retry_count')
      .or(
        `and(status.eq.pending),and(status.eq.processing,updated_at.lt.${thirtyMinAgo})`
      )
      .order('created_at')
      .limit(6);

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
      console.log('[gdrive-queue-worker] No jobs to process');
      return jsonResponse({ message: 'No jobs to process' });
    }

    console.log(`[gdrive-queue-worker] Processing ${jobs.length} jobs`);

    // Step 2: Mark as processing (prevent duplicate processing)
    const jobIds = jobs.map(j => j.id);
    await supabase
      .from('gdrive_migration_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .in('id', jobIds);

    // Step 3: Group by user_id for sequential processing per user
    const grouped = new Map<string, typeof jobs>();
    for (const job of jobs) {
      if (!grouped.has(job.user_id)) grouped.set(job.user_id, []);
      grouped.get(job.user_id)!.push(job);
    }

    const userBatches = chunk([...grouped.entries()], MAX_CONCURRENT_USERS);

    for (const batch of userBatches) {
      await Promise.all(
        batch.map(async ([userId, userJobs]) => {
          for (const job of userJobs) {
            try {
              await invokeGdriveMigrate(job.manifest_id);

              await supabase
                .from('gdrive_migration_jobs')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', job.id);
            } catch (err: MigrationError) {
              // Classify error for retry decision
              const statusCode = err?.statusCode;
              const message = err?.message || '';
              
              // Transient errors that should be retried:
              // - Rate limit (429)
              // - Server errors (5xx)
              // - Network/timeout errors
              // - Auth/token errors (401, 403) - may be temporary token refresh issues
              // - Gateway errors (502, 503, 504)
              const isRateLimit = statusCode === 429 || message.includes('429') || message.includes('Too Many Requests');
              const isServerError = statusCode >= 500 && statusCode < 600;
              const isAuthError = statusCode === 401 || statusCode === 403 || message.includes('invalid_grant') || message.includes('unauthorized') || message.includes('token');
              const isNetworkError = message.includes('timeout') || message.includes('network') || message.includes('connection') || message.includes('fetch failed');
              const isGatewayError = [502, 503, 504].includes(statusCode);
              
              const isTransientError = isRateLimit || isServerError || isAuthError || isNetworkError || isGatewayError;
              
              console.log(`[gdrive-queue-worker] Error classified: statusCode=${statusCode}, isTransient=${isTransientError}, message=${message.substring(0, 200)}`);

              const { data: jobData } = await supabase
                .from('gdrive_migration_jobs')
                .select('retry_count')
                .eq('id', job.id)
                .single();

              const newRetryCount = (jobData?.retry_count || 0) + 1;
              // Retry on transient errors up to 3 times
              // For rate limit, still retry but don't continue batch (to avoid hammering)
              const shouldRetry = newRetryCount < 3 && isTransientError;

              if (isRateLimit) {
                // Rate limit hit - mark for retry, stop this batch to back off
                await supabase
                  .from('gdrive_migration_jobs')
                  .update({
                    status: shouldRetry ? 'pending' : 'failed',
                    retry_count: newRetryCount,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', job.id);

                console.warn(`[gdrive-queue-worker] Rate limit hit (attempt ${newRetryCount}/3), stopping batch for user ${userId}`);
                break;
              }

              await supabase
                .from('gdrive_migration_jobs')
                .update({
                  status: shouldRetry ? 'pending' : 'failed',
                  retry_count: newRetryCount,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);
              
              if (!shouldRetry) {
                console.error(`[gdrive-queue-worker] Job ${job.id} failed permanently after ${newRetryCount} attempts: ${message}`);
              }
            }
            await sleep(JOB_DELAY_MS);
          }
        })
      );
      await sleep(USER_BATCH_DELAY_MS);
    }

    return jsonResponse({ message: 'Queue worker completed', processed: jobs.length });
  } catch (error: Error) {
    console.error('[gdrive-queue-worker] Error:', error);
    return jsonResponse({ error: error.message || 'Internal server error' }, 500);
  }
});