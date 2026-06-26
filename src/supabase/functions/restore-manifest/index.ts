import { createClient } from '@supabase/supabase-js';
// @ts-expect-error: Deno std module not typed
import { serve } from 'std/server';
// For reading ZIP stream
// @ts-expect-error: Cannot find module 'https://esm.run/@zipjs/zip.js'
import { ZIPReader } from 'https://esm.run/@zipjs/zip.js';

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_MANIFESTS_BUCKET = 'archived-manifests';
const DRUG_PHOTOS_BUCKET = 'drug-photos';
const LOCK_TIMEOUT_HOURS = 1;

// Helper to sleep
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create SSE formatted message
function sseMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let manifestId: string | null = null;

  try {
    const { manifestId: id } = await req.json();
    manifestId = id;
  } catch (e) {
    return new Response('manifestId required in JSON body', { status: 400 });
  }

  if (!manifestId) {
    return new Response('manifestId required', { status: 400 });
  }

  // Set up SSE response headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  headers.set('Access-Control-Allow-Origin', '*');

  // Create a transform stream for SSE
  const transformStream = new TransformStream();
  const writer = transformStream.writable.getWriter();

  // Function to send SSE message
  const send = async (data: object) => {
    const chunk = new TextEncoder().encode(sseMessage(data));
    await writer.write(chunk);
  };

  // Run the main logic in a background task so we can start streaming immediately
  (async () => {
    try {
      // Step 1: Acquire lock
      await send({ status: 'locking', message: 'Acquiring lock for restore...' });
      const { error: lockError } = await supabase
        .from('manifests')
        .update({
          archive_status: 'restoring',
          archive_locked_at: new Date().toISOString(),
        })
        .eq('id', manifestId)
        .eq('archive_status', 'archived')
        .or(
          `archive_locked_at.is.null,archive_locked_at.lt.${new Date(
            Date.now() - LOCK_TIMEOUT_HOURS * 60 * 60 * 1000,
          ).toISOString()}`
        );

      if (lockError) throw lockError;

      // Check if we actually acquired the lock
      const { data: lockCheck, error: lockCheckError } = await supabase
        .from('manifests')
        .select('archive_status, archive_locked_at')
        .eq('id', manifestId)
        .single();

      if (lockCheckError) throw lockCheckError;
      if (
        lockCheck.archive_status !== 'restoring' ||
        !lockCheck.archive_locked_at
      ) {
        // Another process got the lock or manifest is not in archived state
        await send({ status: 'skipped', message: 'Manifest is not available for restore' });
        writer.close();
        return;
      }

      // Step 2: Download ZIP from archived-manifests bucket
      await send({ status: 'downloading_zip', message: 'Downloading archive ZIP...' });
      const zipPath = `${manifestId}/archive.zip`;
      const { data: zipData, error: downloadError } = await supabase.storage
        .from(ARCHIVED_MANIFESTS_BUCKET)
        .download(zipPath);

      if (downloadError) throw downloadError;
      if (!zipData) {
        throw new Error('ZIP file not found in storage');
      }

      // Convert to ArrayBuffer for ZIPReader
      const zipArrayBuffer = await zipData.arrayBuffer();

      // Step 3: Extract data.json and restore drug_items (with ON CONFLICT DO UPDATE)
      await send({ status: 'restoring_items', message: 'Restoring drug items...' });
      const zipReader = new ZIPReader(zipArrayBuffer);
      const entries: any[] = await zipReader.getEntries();

      // Find data.json entry
       const dataJsonEntry = entries.find((entry) => entry.getFilename() === 'data.json');
      if (!dataJsonEntry) {
        throw new Error('data.json not found in archive');
      }

      const dataJsonBlob = await dataJsonEntry.getDataBlob({ type: 'application/json' });
      const dataJsonText = await dataJsonBlob.text();
      let dataJsonItems: any[] = [];
      try {
        dataJsonItems = JSON.parse(dataJsonText);
      } catch (e) {
        throw new Error('Failed to parse data.json');
      }

      // Insert or update drug_items in batches of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < dataJsonItems.length; i += BATCH_SIZE) {
        const batch = dataJsonItems.slice(i, i + BATCH_SIZE);
        const values = batch.map(item => 
          `('${item.id}', '${item.manifest_id}', ${item.page_number}, ${item.item_order}, '${item.barcode}', '${item.name.replace(/'/g, "''")}', ${item.expected_quantity}, ${item.bonus_quantity ?? 0}, ${item.actual_quantity}, '${item.counted_status}', NULL, ${item.storage_location ? `'${item.storage_location}'` : 'NULL'}, ${item.category ? `'${item.category}'` : 'NULL'}, '${item.created_at ?? new Date().toISOString()}', '${item.updated_at ?? new Date().toISOString()}')`
        ).join(', ');

        const sql = `
          INSERT INTO drug_items (id, manifest_id, page_number, item_order, barcode, name, expected_quantity, bonus_quantity, actual_quantity, counted_status, photo_url, storage_location, category, created_at, updated_at)
          VALUES ${values}
          ON CONFLICT (id) DO UPDATE SET
            manifest_id = EXCLUDED.manifest_id,
            page_number = EXCLUDED.page_number,
            item_order = EXCLUDED.item_order,
            barcode = EXCLUDED.barcode,
            name = EXCLUDED.name,
            expected_quantity = EXCLUDED.expected_quantity,
            bonus_quantity = EXCLUDED.bonus_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            counted_status = EXCLUDED.counted_status,
            photo_url = EXCLUDED.photo_url,
            storage_location = EXCLUDED.storage_location,
            category = EXCLUDED.category,
            updated_at = NOW();
        `;

        const { error: upsertError } = await supabase.rpc('exec_sql', { sql });
        if (upsertError) {
          // Fallback: try individual inserts if RPC not available
          console.warn('RPC exec_sql failed, trying individual inserts:', upsertError);
          for (const item of batch) {
            const { error: itemError } = await supabase
              .from('drug_items')
              .upsert({
                id: item.id,
                manifest_id: item.manifest_id,
                page_number: item.page_number,
                item_order: item.item_order,
                barcode: item.barcode,
                name: item.name,
                expected_quantity: item.expected_quantity,
                bonus_quantity: item.bonus_quantity ?? 0,
                actual_quantity: item.actual_quantity,
                counted_status: item.counted_status,
                storage_location: item.storage_location ?? null,
                category: item.category ?? null,
                photo_url: null, // Will be set later
                created_at: item.created_at ?? new Date().toISOString(),
                updated_at: item.updated_at ?? new Date().toISOString(),
              }, { onConflict: 'id' });
            if (itemError) throw itemError;
          }
        }
      }

      // Step 4: Extract photos and upload to drug-photos bucket, collecting updates
      await send({ status: 'uploading_photos', message: 'Uploading photos...' });
      const photoEntries = entries.filter((entry) => 
        entry.getFilename().startsWith('photos/') && entry.getFilename().endsWith('.jpg') ||
        entry.getFilename().startsWith('photos/') && entry.getFilename().endsWith('.jpeg') ||
        entry.getFilename().startsWith('photos/') && entry.getFilename().endsWith('.png') ||
        entry.getFilename().startsWith('photos/') && entry.getFilename().endsWith('.webp')
      );

      // Build a map of drug_item_id to new photo URL for batch update
      const photoUrlUpdates: { [drugItemId: string]: string } = {};

      for (const entry of photoEntries) {
        try {
          const filename = entry.getFilename(); // e.g., "photos/uuid.jpg"
          // Extract drug_item_id from filename: remove "photos/" and extension
          const basename = filename.split('/').pop(); // "uuid.jpg"
          const drugItemId = basename.split('.')[0];

          const photoBlob = await entry.getDataBlob();
          const photoArrayBuffer = await photoBlob.arrayBuffer();
          const photoFile = new File([photoArrayBuffer], filename.split('/').pop(), { type: 'image/jpeg' });

          // Upload to drug-photos bucket
          const photoPath = `${manifestId}/${drugItemId}.${filename.split('.').pop()}`;
          const { error: uploadError, data: uploadData } = await supabase.storage
            .from(DRUG_PHOTOS_BUCKET)
            .upload(photoPath, photoFile, {
              contentType: 'image/jpeg', // TODO: detect proper content type
              upsert: true,
            });

          if (uploadError) {
            console.warn(`Failed to upload photo for drug_item ${drugItemId}:`, uploadError);
            // Skip this photo; we'll continue with others
            continue;
          }

          // Get public URL
          const { data: publicUrlData } = await supabase.storage
            .from(DRUG_PHOTOS_BUCKET)
            .getPublicUrl(photoPath);
          const publicUrl = publicUrlData.publicUrl;

          // Record for batch update
          photoUrlUpdates[drugItemId] = publicUrl;
        } catch (err) {
          console.warn(`Failed to process photo entry ${entry.getFilename()}:`, err);
          // Continue with other photos
        }
      }

      // Step 5: Batch update photo_url for all successfully uploaded photos
      if (Object.keys(photoUrlUpdates).length > 0) {
        await send({ status: 'updating_photo_urls', message: 'Updating photo URLs in database...' });
        const values = Object.entries(photoUrlUpdates)
          .map(([id, url]) => `('${id}', '${url.replace(/'/g, "''")}')`)
          .join(', ');

        const sql = `
          UPDATE drug_items AS d
          SET photo_url = u.photo_url
          FROM (VALUES ${values}) AS u(id, photo_url)
          WHERE d.id = u.id;
        `;

        const { error: updateError } = await supabase.rpc('exec_sql', { sql });
        if (updateError) {
          // Fallback: individual updates
          console.warn('RPC exec_sql failed for photo update, trying individual updates:', updateError);
          for (const [drugItemId, photoUrl] of Object.entries(photoUrlUpdates)) {
            const { error: itemError } = await supabase
              .from('drug_items')
              .update({ photo_url: photoUrl })
              .eq('id', drugItemId);
            if (itemError) {
              console.warn(`Failed to update photo_url for drug_item ${drugItemId}:`, itemError);
              // Continue with others
            }
          }
        }
      }

      // Step 6: Update manifest to active and release lock
      await send({ status: 'finalizing', message: 'Finalizing restore...' });
      const { error: updateError } = await supabase
        .from('manifests')
        .update({
          status: 'active',
          archive_status: null,
          archived_zip_path: null,
          archive_locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 7: Delete ZIP from archived-manifests bucket (non-critical)
      await send({ status: 'cleaning_up', message: 'Cleaning up archive ZIP...' });
      const { error: deleteZipError } = await supabase.storage
        .from(ARCHIVED_MANIFESTS_BUCKET)
        .remove([zipPath]);
      if (deleteZipError) {
        console.warn('Failed to delete archive ZIP:', deleteZipError);
        // Log but don't fail
        await supabase.from('archive_logs').insert({
          manifest_id: manifestId,
          action: 'restore',
          trigger: 'manual',
          status: 'failed',
          message: `Failed to delete archive ZIP from storage: ${deleteZipError.message}`,
        });
      }

      // Step 8: Log success to archive_logs
      await supabase.from('archive_logs').insert({
        manifest_id: manifestId,
        action: 'restore',
        trigger: 'manual',
        status: 'success',
        message: `Successfully restored manifest with ${dataJsonItems.length} items and ${Object.keys(photoUrlUpdates).length} photos`,
      });

      // Step 9: Send completion message
      await send({ status: 'completed', message: 'Restore completed successfully' });
    } catch (error: any) {
      console.error('Restore manifest error:', error);
      // Release lock on error (set back to archived)
      try {
        await supabase
          .from('manifests')
          .update({ archive_status: 'archived', archive_locked_at: null })
          .eq('id', manifestId);
      } catch (lockErr) {
        console.error('Failed to release lock:', lockErr);
      }

      // Log failure
      try {
        await supabase.from('archive_logs').insert({
          manifest_id: manifestId,
          action: 'restore',
          trigger: 'manual',
          status: 'failed',
          message: error.message || 'Unknown error',
        });
      } catch (logErr) {
        console.error('Failed to log error:', logErr);
      }

      // Send error via SSE
      await send({ status: 'error', message: error.message || 'Internal server error' });
    } finally {
      writer.close();
    }
  })();

  // Return the streaming response
  return new Response(transformStream.readable, { headers });
});
