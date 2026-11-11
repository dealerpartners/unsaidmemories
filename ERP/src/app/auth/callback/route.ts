import { NextResponse, type NextRequest } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/server';
import { resolveStaff } from '@/lib/staffGate';

/**
 * Google OAuth callback. Exchanges the code for a session, confirms the
 * account is staff (re-linking by email when the Google sign-in created a
 * fresh auth user for a known staff address), then sends the user to the
 * page they were headed for. Non-staff land back on /login with the
 * staff error.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=staff`);
  }

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=staff`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=staff`);
  }

  const staff = await resolveStaff(user.id, user.email ?? null);
  if (!staff) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=staff`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/'}`);
}
