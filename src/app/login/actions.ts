'use server';

import { createClient } from '@/lib/supabase/server';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get('email') as string;

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (await headers()).get('origin') ??
    'http://localhost:3000';

  const callbackUrl = `${origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?sent=true&email=${encodeURIComponent(email)}`);
}
