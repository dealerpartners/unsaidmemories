'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Building2, MapPin, Phone, Plus, CheckCircle2, Trash2, Store, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

interface BranchLocation {
  id: string;
  name: string;
  address: string;
  phone: string;
  type: string;
  is_primary: boolean;
  is_active: boolean;
}

// tenant_locations.address is jsonb: older rows hold a plain string,
// newer rows hold { line1, line2, city, state, postal_code, phone }.
function composeAddress(addr: unknown): { text: string; phone: string } {
  if (!addr) return { text: '—', phone: '—' };
  if (typeof addr === 'string') return { text: addr, phone: '—' };
  const a = addr as Record<string, string>;
  const text = [a.line1, a.line2, a.city, a.state && a.postal_code ? `${a.state} ${a.postal_code}` : a.state || a.postal_code]
    .filter(Boolean)
    .join(', ');
  return { text: text || '—', phone: a.phone || '—' };
}

export const OrgMultiLocationScreen: React.FC<ScreenProps> = ({
  selectedLocation,
  onSelectLocation,
}) => {
  const [locations, setLocations] = useState<BranchLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newZip, setNewZip] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newType, setNewType] = useState('internal');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/locations?tenant_id=active', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Locations failed to load (${res.status})`);
      const data = await res.json();
      const rows: BranchLocation[] = (data.data || []).map((r: any) => {
        const { text, phone } = composeAddress(r.address);
        return {
          id: r.id,
          name: r.name,
          address: text,
          phone,
          type: r.tenant_type || 'internal',
          is_primary: r.is_primary === true,
          is_active: r.is_active !== false,
        };
      });
      setLocations(rows);
    } catch (err: any) {
      console.error('Failed to fetch locations:', err);
      setError(err?.message || 'Locations failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAddLocation = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          address_line1: newAddress.trim(),
          city: newCity.trim(),
          state: newState.trim(),
          postal_code: newZip.trim(),
          phone: newPhone.trim(),
          location_type: newType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Add failed (${res.status})`);
      setShowAddForm(false);
      setNewName('');
      setNewAddress('');
      setNewCity('');
      setNewState('');
      setNewZip('');
      setNewPhone('');
      await load();
      flashSaved();
    } catch (err: any) {
      setError(err?.message || 'Location could not be saved.');
    }
  };

  const handleSwitchLocation = (name: string) => {
    onSelectLocation?.(name);
    flashSaved();
  };

  const handleDeleteLocation = async (loc: BranchLocation) => {
    if (!confirm(`Delete location "${loc.name}"? This removes the location record.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/locations/${loc.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Delete failed (${res.status})`);
      await load();
      flashSaved();
    } catch (err: any) {
      setError(err?.message || 'Location could not be deleted.');
    }
  };

  return (
    <div className="p-6 space-y-6 font-bar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Locations & Branches</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Manage physical salon facilities, mobile vans, and branch operations.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors cursor-pointer"
        >
          <Plus className="size-4" />
          Add Location
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {/* Add Location Form */}
      {showAddForm && (
        <div className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
          <h3 className="text-[15px] font-semibold text-foreground">Add New Location</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Location Name *</label>
              <div className="relative">
                <Building2 className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Main Location"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Street Address</label>
              <div className="relative">
                <MapPin className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="699 Waring Rd"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">City</label>
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Memphis"
                  className="w-full px-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">State</label>
                <input
                  type="text"
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  placeholder="TN"
                  className="w-full px-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">ZIP</label>
                <input
                  type="text"
                  value={newZip}
                  onChange={(e) => setNewZip(e.target.value)}
                  placeholder="38122"
                  className="w-full px-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Phone</label>
              <div className="relative">
                <Phone className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(901) 555-0100"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Location Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="internal">Internal (own shop)</option>
                <option value="franchise">Franchise</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAddForm(false)} className="inline-flex items-center h-9 px-3.5 rounded-lg border border-border bg-background hover:bg-accent text-foreground text-[13px] font-medium cursor-pointer">Cancel</button>
            <button onClick={handleAddLocation} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium shadow-card cursor-pointer">
              <Plus className="size-4" /> Add Location
            </button>
          </div>
        </div>
      )}

      {/* Saved toast */}
      {saved && (
        <div className="fixed top-4 right-4 z-50 bg-card text-foreground border border-border rounded-lg shadow-popover px-4 py-2.5 text-[13px] font-medium flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" />
          Location updated
        </div>
      )}

      {/* Locations table */}
      <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-[13px]">Loading locations...</div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-[13px]">No locations on record for this tenant yet.</div>
        ) : (
          <table className="w-full text-left text-[13px] text-foreground">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="p-3 font-semibold">Location</th>
                <th className="p-3 font-semibold">Address</th>
                <th className="p-3 font-semibold">Phone</th>
                <th className="p-3 font-semibold">Type</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {locations.map((loc) => {
                const isSelected = selectedLocation === loc.name;
                return (
                  <tr key={loc.id} className="hover:bg-accent/50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Store className="size-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{loc.name}</span>
                        {loc.is_primary && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase">Primary</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{loc.address}</td>
                    <td className="p-3 text-muted-foreground tabular-nums">{loc.phone}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border capitalize">{loc.type}</span>
                    </td>
                    <td className="p-3">
                      <span className={cn(
                        'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                        loc.is_active ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'
                      )}>
                        {loc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!isSelected && (
                          <button
                            onClick={() => handleSwitchLocation(loc.name)}
                            className="inline-flex items-center justify-center size-7 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                            title="Set as the active branch in this session"
                          >
                            <CheckCircle2 className="size-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteLocation(loc)}
                          className="inline-flex items-center justify-center size-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                          title="Delete location"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Locations are this tenant's real records. Switching sets the active branch label for this session — admin data is not location-scoped yet.</p>
    </div>
  );
};
