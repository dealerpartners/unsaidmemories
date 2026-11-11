import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveStaff } from '@/lib/staffGate';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabaseConfig';

/**
 * Dashboard gate. Every page and API route requires a Supabase Auth
 * session (Google sign-in) held by a staff member (see staffGate for the
 * access model). Public: the login page and the OAuth callback only.
 *
 * - Signed out, page  -> redirect to /login?next=<path>
 * - Signed out, API   -> 401 JSON
 * - Signed in, not staff -> /login?error=staff (page) or 403 JSON (API)
 */
const PUBLIC_PREFIXES = ['/login', '/auth/callback'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const isApi = pathname.startsWith('/api/');

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  const staff = await resolveStaff(user.id, user.email ?? null);
  if (!staff) {
    if (isApi) {
      return NextResponse.json({ error: 'Staff access required.' }, { status: 403 });
    }
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    login.searchParams.set('error', 'staff');
    return NextResponse.redirect(login);
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
