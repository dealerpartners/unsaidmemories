import NextDynamic from 'next/dynamic';
const DesignStudio = NextDynamic(() => import('@/components/DesignStudio'), { ssr: false });
export const dynamic = 'force-dynamic';
export default function DesignsPage({ searchParams }: { searchParams?: { product?: string; variant?: string } }) {
  return (<><h1>Design studio</h1><DesignStudio product={searchParams?.product} variant={searchParams?.variant} /><p>Publish this design to tee, mug, cap via design_publications — one design, many products, every holiday.</p></>);
}
