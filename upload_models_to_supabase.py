import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

from supabase import create_client

supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
supabase_service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_service_key:
    print("ERROR: Missing Supabase credentials in .env.local")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_service_key)

# Bucket name
bucket = 'models'

files_to_upload = [
    ('public/models/mobile_sam_encoder.onnx', 'mobile_sam_encoder.onnx'),
    ('public/models/mobile_sam_decoder.onnx', 'mobile_sam_decoder.onnx'),
    ('public/models/mobile_sam_decoder.onnx.data', 'mobile_sam_decoder.onnx.data'),
]

for local_path, remote_name in files_to_upload:
    if not os.path.exists(local_path):
        print(f"SKIP (not found): {local_path}")
        continue
    
    file_size = os.path.getsize(local_path) / 1024 / 1024
    print(f"Uploading {remote_name} ({file_size:.1f} MB)...")
    
    with open(local_path, 'rb') as f:
        try:
            # Upload to Supabase Storage
            result = supabase.storage.from_(bucket).upload(
                remote_name,
                f,
                file_options={
                    'content-type': 'application/octet-stream',
                    'upsert': 'true'
                }
            )
            
            if hasattr(result, 'error') and result.error:
                print(f"  ERROR: {result.error}")
            else:
                print(f"  SUCCESS")
                
                # Get public URL
                public_url = supabase.storage.from_(bucket).get_public_url(remote_name)
                print(f"  Public URL: {public_url}")
        except Exception as e:
            print(f"  EXCEPTION: {e}")

print("\nDone!")