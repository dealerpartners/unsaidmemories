import { AuthShell, DoorDivider, DoorHint } from '@/components/portal/auth/AuthShell';
import { GoogleButton } from '@/components/portal/auth/GoogleButton';
import { EmailPasswordForm } from '@/components/portal/auth/EmailPasswordForm';

// ============================================================================
// THE EMPLOYEE DOOR — rendered by src/app/employee/page.tsx at the flat
// /employee entry when the visitor is not signed in (the access-* door
// scheme is retired for employees; the old door URL permanently redirects
// here). Its own identity: EMPLOYEE PORTAL.
// Groomer/employee accounts exist ONLY by admin provision. Google sign-in
// links to the existing invited account by exact email; unknown emails are
// rejected ("No employee account found — contact your admin").
// ============================================================================

export function EmployeeDoorPage({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const err = typeof params.error === 'string' ? params.error : undefined;
  const email = typeof params.email === 'string' ? params.email : undefined;
  const redirect = typeof params.redirect === 'string' ? params.redirect : undefined;

  const initialError =
    err === 'not_authorized'
      ? email
        ? `No employee account found for ${email}. Employee accounts are created by an administrator — please contact your admin to be provisioned.`
        : 'No employee account found. Employee accounts are created by an administrator.'
      : undefined;

  return (
    <AuthShell
      badge="Salon Team"
      title="Employee Portal"
      subtitle="Station access — assigned appointments, shifts & style records."
    >
      {initialError ? null : <GoogleButton portal="groomer" />}
      <DoorHint>
        Employee accounts are provisioned by an administrator.
        <br />
        Google sign-in links to your existing invited account.
      </DoorHint>
      <DoorDivider />
      <EmailPasswordForm
        portal="groomer"
        submitLabel="SIGN IN"
        redirectTo={redirect}
        initialError={initialError}
        emailLabel="Staff Email"
        placeholder="you@unsaidmemories.com"
      />
    </AuthShell>
  );
}
