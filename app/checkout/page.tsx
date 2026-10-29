export const dynamic = 'force-dynamic';
import CheckoutForm from '@/components/CheckoutForm';

// Server wrapper: decides at request time whether payments are configured.
// The publishable key is public by design; the secret key never leaves the server.
export default function Checkout() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  return <CheckoutForm publishableKey={publishableKey} configured={Boolean(publishableKey)} />;
}
