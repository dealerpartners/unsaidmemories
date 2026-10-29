import NextDynamic from 'next/dynamic';
const DesignStudio = NextDynamic(() => import('@/components/DesignStudio'), { ssr: false });
export const dynamic = 'force-dynamic';
export default function DesignsPage() { return (<><h1>Design studio</h1><DesignStudio /><p>Publish this design to tee, mug, cap via design_publications — one design, many products.</p></>); }
