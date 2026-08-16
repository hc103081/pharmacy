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

headers = {
    'Authorization': f'Bearer {supabase_service_key}',
    'apikey': supabase_service_key,
    'Content-Type': 'application/json',
}

bucket = 'models'

# Create bucket using the correct API
print(f"Creating bucket '{bucket}'...")
resp = requests.post(
    f'{supabase_url}/storage/v1/bucket',
    headers=headers,
    json={'name': bucket, 'public': True}
)

print(f"Status: {resp.status_code}")
print(f"Response: {resp.text}")

if resp.status_code in (200, 201):
    print("Bucket created successfully!")
else:
    print("Failed to create bucket. You may need to create it manually in Supabase Dashboard.")
    print("Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/storage")
    print("Click 'New bucket', name: 'models', make it public")