'use client';

import React, { useState } from 'react';
import { Globe, PawPrint, ExternalLink, Image as ImageIcon, CheckCircle2, Megaphone, Search } from 'lucide-react';

export const WebsiteTab: React.FC = () => {
  const [bannerActive, setBannerActive] = useState(true);
  const [bannerText, setBannerText] = useState('Spring Spa Special: $15 Off All Full Grooms Booked for Tuesdays & Wednesdays!');
  const [seoTitle, setSeoTitle] = useState('UnSaid Memories - Premier Pet Grooming & Spa in Frisco, TX');
  const [seoDesc, setSeoDesc] = useState('Luxury dog styling, blueberry facials, gentle de-shedding, and breed cuts with cage-free care.');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary uppercase tracking-wider mb-1">
            <Globe className="w-4 h-4" />
            <span>Public Website &amp; Content</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Website &amp; CMS Management</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage your customer-facing promotional announcements, SEO meta tags, and hero image assets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://www.unsaidmemories.com"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 bg-muted/40 hover:bg-muted text-foreground font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <span>Live Site</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="submit"
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <span>Save Website Content</span>
          </button>
        </div>
      </div>

      {saved && (
        <div className="p-3 bg-success/10 border border-success/20 text-success text-[13px] font-medium rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Website content and promotional banners updated!</span>
        </div>
      )}

      {/* Promotional Banner Box */}
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Top Promotional Announcement Banner</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={bannerActive}
              onChange={(e) => setBannerActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>

        <div>
          <label className="block text-foreground font-semibold mb-1">Banner Text</label>
          <input
            type="text"
            value={bannerText}
            onChange={(e) => setBannerText(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
          />
        </div>

        {bannerActive && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20/80 text-primary text-[11px] flex items-center gap-2">
            <PawPrint className="w-4 h-4 text-primary shrink-0" />
            <span><strong>Live Preview:</strong> {bannerText}</span>
          </div>
        )}
      </div>

      {/* SEO Box */}
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">Search Engine Optimization (SEO)</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-foreground font-semibold mb-1">Meta Page Title</label>
            <input
              type="text"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
            />
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">Meta Description</label>
            <textarea
              rows={2}
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card resize-none"
            />
          </div>
        </div>
      </div>
    </form>
  );
};
