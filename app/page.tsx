import Link from 'next/link';
export const revalidate = 3600;
export default function Home() {
  return (<><h1>Kin Keeper</h1><p>For the ones that show up. November&apos;s UnSaid Holiday.</p><p><Link href="/shop">Shop Kin Keeper →</Link></p><p><Link href="/collections/kin-keeper-month">Kin Keeper Month</Link> · <Link href="/collections/family-by-choice">Family by Choice</Link> · <Link href="/collections/all-unsaid-holidays">All UnSaid Holidays</Link></p></>);
}
