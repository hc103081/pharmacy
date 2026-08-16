import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
supabase_service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_service_key:
    print("ERROR: Missing Supabase credentials in .env.local")
    sys.exit(1)

bucket = 'models'
headers = {
    'Authorization': f'Bearer {supabase_service_key}',
    'apikey': supabase_service_key,
}

# First, check if bucket exists, create if not
print(f"Checking/creating bucket '{bucket}'...")
try:
    # Try to list bucket contents to see if it exists
    resp = requests.get(
        f'{supabase_url}/storage/v1/bucket/{bucket}',
        headers=headers
    )
    if resp.status_code == 404:
        # Create bucket
        print(f"Creating bucket '{bucket}'...")
        create_resp = requests.post(
            f'{supabase_url}/storage/v1/bucket',
            headers={**headers, 'Content-Type': 'application/json'},
            json={'name': bucket, 'public': True}
        )
        if create_resp.status_code not in (200, 201):
            print(f"Failed to create bucket: {create_resp.text}")
        else:
            print(f"Bucket '{bucket}' created")
    elif resp.status_code == 200:
        print(f"Bucket '{bucket}' already exists")
except Exception as e:
    print(f"Error checking bucket: {e}")

# Upload files
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
    
    try:
        with open(local_path, 'rb') as f:
            # Upload using multipart/form-data
            files = {'file': (remote_name, f, 'application/octet-stream')}
            data = {'upsert': 'true'}
            
            resp = requests.post(
                f'{supabase_url}/storage/v1/object/{bucket}/{remote_name}',
                headers=headers,
                files=files,
                data=data
            )
            
            if resp.status_code in (200, 201):
                print(f"  SUCCESS")
                # Get public URL
                public_url = f'{supabase_url}/storage/v1/object/public/{bucket}/{remote_name}'
                print(f"  Public URL: {public_url}")
            else:
                print(f"  ERROR: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"  EXCEPTION: {e}")

print("\nDone!")