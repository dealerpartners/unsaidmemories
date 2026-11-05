'use client';

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => Promise<boolean>;
}

// Social Links & Directory Listings — the org's public social profiles
// and review destinations, stored as the typed social_* keys in
// SystemSettings (cms_global_content via /api/admin/settings), the same
// store every other settings screen writes. All five fields save;
// "Saved" paints only when the settings API confirmed the write.
export const OrgSocialDirectoriesScreen: React.FC<ScreenProps> = ({
  systemSettings,
  saveSettingsToDb,
}) => {
  const [form, setForm] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (systemSettings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(systemSettings as any);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
  }, [systemSettings]);

  const update = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // "Saved!" shows only when the settings API confirmed the write.
  const handleSave = async () => {
    setSaveError(false);
    const updates: Partial<SystemSettings> = {
      social_instagram_handle: form.social_instagram_handle ?? '',
      social_facebook_page: form.social_facebook_page ?? '',
      social_tiktok_handle: form.social_tiktok_handle ?? '',
      social_yelp_url: form.social_yelp_url ?? '',
      social_google_business_id: form.social_google_business_id ?? '',
    };
    const ok = saveSettingsToDb ? await saveSettingsToDb(updates) : false;
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError(true);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground text-[13px]">
        Loading social &amp; directory settings from database...
      </div>
    );
  }

  const socialFields = [
    { key: 'social_instagram_handle', label: 'Instagram Handle / URL', placeholder: 'unsaidmemories' },
    { key: 'social_facebook_page', label: 'Facebook Page', placeholder: 'unsaidmemoriesfb' },
    { key: 'social_tiktok_handle', label: 'TikTok Handle', placeholder: '@unsaidmemories' },
  ];
  const directoryFields = [
    { key: 'social_google_business_id', label: 'Google Business ID / Place ID', placeholder: 'Google Business profile identifier' },
    { key: 'social_yelp_url', label: 'Yelp for Business URL', placeholder: 'https://yelp.com/biz/...' },
  ];

  return (
    <div className="p-6 space-y-6 font-bar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Social Links &amp; Directory Listings</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            Social media profiles and local review destinations included in client confirmations, receipts, and portal footers.
          </p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 text-[12px] font-medium rounded-lg border cursor-pointer transition-colors',
            saved
              ? 'bg-success/10 text-success border-success/30'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground border-border'
          )}
        >
          {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 rounded-lg text-[13px]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Save failed — the settings API did not confirm the write. Your changes are not stored yet.
        </div>
      )}

      {/* Primary social networks */}
      <div className="border border-border bg-card rounded-xl p-5 space-y-4">
        <div className="border-b border-border pb-2">
          <span className="font-semibold text-foreground">Primary Social Networks</span>
        </div>
        <div className="space-y-3 max-w-2xl">
          {socialFields.map((f) => (
            <div key={f.key}>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">{f.label}</label>
              <input
                value={form[f.key] ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-border p-2 font-medium bg-muted/30 focus:bg-card focus:outline-none rounded-lg text-[13px]"
                type="text"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Local directories */}
      <div className="border border-border bg-card rounded-xl p-5 space-y-4">
        <div className="border-b border-border pb-2">
          <span className="font-semibold text-foreground">Local Directories &amp; Review Destinations</span>
        </div>
        <div className="space-y-3 max-w-2xl">
          {directoryFields.map((f) => (
            <div key={f.key}>
              <label className="text-muted-foreground uppercase text-[10px] block mb-1">{f.label}</label>
              <input
                value={form[f.key] ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-border p-2 font-medium bg-muted/30 focus:bg-card focus:outline-none rounded-lg text-[13px]"
                type="text"
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Post-appointment review invitations target the Google Business listing above; keep it current so
            invitations land on the right profile.
          </p>
        </div>
      </div>
    </div>
  );
};
