'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// PortalSectionPlaceholder — consistent "this section is part of the new
// portal layout" surface for sub-pages whose dedicated UI ships in a later
// phase. Keeps the sidebar nav from 404ing while the portal identity is
// already distinct (its own sidebar, its own brand subtitle).
// ============================================================================
export function PortalSectionPlaceholder({
  portal,
  section,
  title,
  description,
  icon: Icon,
  ctaLabel,
  onCta,
}: {
  portal: 'Seller' | 'Learning Center' | 'Customer' | 'Groomer';
  section: string;
  title: string;
  description: string;
  icon: LucideIcon;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 text-muted-foreground"
        onClick={() => router.back()}
      >
        <ArrowLeft className="size-3.5 mr-1" /> Back
      </Button>
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-muted">
              <Icon className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title}
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                  {portal} · {section}
                </span>
              </CardTitle>
              <CardDescription className="text-sm mt-1 max-w-xl">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This section is part of the {portal} portal&rsquo;s new layout. The dedicated
              interactive surface ships in the next phase — the sidebar identity, branding,
              and auth gate are already in place.
            </p>
            {ctaLabel && onCta && (
              <Button size="sm" className="mt-4" onClick={onCta}>
                {ctaLabel}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
