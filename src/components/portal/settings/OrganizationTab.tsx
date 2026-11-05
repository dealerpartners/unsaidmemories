'use client';

import React, { useState } from 'react';
import { LocationItem } from '@/lib/types';
import { Building2, MapPin, Plus, Phone, Mail, Clock, User, Trash2, Store, Truck, CheckCircle2, Globe, PawPrint, Calendar, X } from 'lucide-react';

interface OrganizationTabProps {
  locations: LocationItem[];
  selectedLocation: string;
  onSelectLocation: (locName: string) => void;
  onAddLocation: (newLoc: Partial<LocationItem>) => void;
  onDeleteLocation?: (id: string) => void;
}

export const OrganizationTab: React.FC<OrganizationTabProps> = ({
  locations,
  selectedLocation,
  onSelectLocation,
  onAddLocation,
  onDeleteLocation,
}) => {
  const [subSection, setSubSection] = useState<'profile' | 'locations' | 'brand' | 'hours' | 'holidays'>('profile');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Business Profile Form State
  const [businessName, setBusinessName] = useState('UnSaid Memories');
  const [tagline, setTagline] = useState('Luxury pet grooming with love and care.');
  const [phone, setPhone] = useState('(901) 722-1114');
  const [email, setEmail] = useState('info@unsaidmemories.com');
  const [website, setWebsite] = useState('https://www.unsaidmemories.com');
  const [address, setAddress] = useState('699 Waring Rd, Memphis, TN');
  const [taxEin, setTaxEin] = useState('XX-XXXX789');
  const [timezone, setTimezone] = useState('America/Chicago (Central Time)');
  const [isSaved, setIsSaved] = useState(false);

  // Location Form State
  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState<LocationItem['type']>('Main Location');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [newLocCity, setNewLocCity] = useState('Frisco, TX 75034');
  const [newLocPhone, setNewLocPhone] = useState('');
  const [newLocManager, setNewLocManager] = useState('Lead Groomer');
  const [newLocStations, setNewLocStations] = useState(4);
  const [newLocHours, setNewLocHours] = useState('Mon-Sat: 8:00 AM – 6:00 PM');

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleCreateLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) return;

    onAddLocation({
      name: newLocName.startsWith('UnSaid Memories') ? newLocName : `UnSaid Memories – ${newLocName}`,
      type: newLocType,
      address: newLocAddress || '100 Main St',
      cityStateZip: newLocCity,
      phone: newLocPhone,
      email: 'contact@unsaidmemories.com',
      manager: newLocManager,
      stationCount: Number(newLocStations) || 4,
      operatingHours: newLocHours,
      status: 'Active',
      isDefault: locations.length === 0,
    });

    setIsAddModalOpen(false);
    setNewLocName('');
    setNewLocAddress('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <span className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground font-semibold">Enterprise &amp; Infrastructure</span>
          <h2 className="text-xl font-semibold uppercase tracking-tight text-foreground mt-0.5">Organization Settings</h2>
          <p className="text-[13px] text-muted-foreground mt-1 tabular-nums">
            Manage company profile, multi-unit salon locations, operating hours, and brand identity.
          </p>
        </div>

        {subSection === 'locations' && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Location</span>
          </button>
        )}
      </div>

      {isSaved && (
        <div className="p-3 bg-card text-white text-[13px] tabular-nums flex items-center gap-2 border border-border">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Organization settings saved successfully!</span>
        </div>
      )}

      {/* Sub navigation */}
      <div className="flex border-b border-border gap-6 text-[13px] font-semibold uppercase tracking-wider overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setSubSection('profile')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            subSection === 'profile'
              ? 'border-border text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Business Profile</span>
        </button>

        <button
          onClick={() => setSubSection('locations')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            subSection === 'locations'
              ? 'border-border text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Locations &amp; Branches ({locations.length})</span>
        </button>

        <button
          onClick={() => setSubSection('brand')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            subSection === 'brand'
              ? 'border-border text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <PawPrint className="w-4 h-4" />
          <span>Brand &amp; Identity</span>
        </button>

        <button
          onClick={() => setSubSection('hours')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            subSection === 'hours'
              ? 'border-border text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Opening Hours</span>
        </button>

        <button
          onClick={() => setSubSection('holidays')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            subSection === 'holidays'
              ? 'border-border text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Holiday Blackouts</span>
        </button>
      </div>

      {/* Sub Section 1: Business Profile */}
      {subSection === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-card p-6 border border-border shadow-2xs space-y-5 text-[13px]">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-10 h-10 bg-primary text-primary-foreground font-semibold flex items-center justify-center text-sm tabular-nums">
              AD
            </div>
            <div>
              <h3 className="font-semibold uppercase tracking-tight text-foreground text-sm">Legal Business Profile</h3>
              <p className="text-muted-foreground text-[11px] tabular-nums">Official contact details, primary business entity, and tax information.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Company / Brand Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              />
            </div>

            <div>
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Tagline / Motto</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              />
            </div>

            <div>
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Central Phone Line</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              />
            </div>

            <div>
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Official Business Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Primary Headquarters Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              />
            </div>

            <div>
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Website URL</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              />
            </div>

            <div>
              <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Operating Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border text-foreground font-medium focus:bg-card focus:outline-none focus:border-border"
              >
                <option>America/Chicago (Central Time)</option>
                <option>America/New_York (Eastern Time)</option>
                <option>America/Denver (Mountain Time)</option>
                <option>America/Los_Angeles (Pacific Time)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold uppercase tracking-wider cursor-pointer transition-colors"
            >
              Save Profile Changes
            </button>
          </div>
        </form>
      )}

      {/* Sub Section 2: Locations & Branches */}
      {subSection === 'locations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {locations.map((loc) => {
              const isSelected = selectedLocation === loc.name;
              return (
                <div
                  key={loc.id}
                  className={`bg-card p-5 border transition-all shadow-2xs flex flex-col justify-between relative ${
                    isSelected ? 'border-border ring-2 ring-black' : 'border-border hover:border-border'
                  }`}
                >
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 flex items-center justify-center text-white shrink-0 ${
                            loc.type === 'Mobile Van'
                              ? 'bg-muted'
                              : loc.type === 'Luxury Spa'
                              ? 'bg-black'
                              : 'bg-card'
                          }`}
                        >
                          {loc.type === 'Mobile Van' ? <Truck className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                        </div>
                        <div>
                          <h3 className="font-semibold uppercase tracking-tight text-foreground text-sm leading-tight">{loc.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5 tabular-nums text-[10px]">
                            <span className="bg-muted/40 text-foreground px-2 py-0.5 border border-border">
                              {loc.type}
                            </span>
                            <span className="px-2 py-0.5 bg-primary text-primary-foreground">
                              {loc.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <span className="bg-primary text-primary-foreground text-[10px] tabular-nums uppercase tracking-wider px-2 py-0.5">
                          Active Branch
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-[13px] text-muted-foreground border-t border-border pt-3 tabular-nums">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">{loc.address}</p>
                          <p className="text-muted-foreground text-[11px]">{loc.cityStateZip}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                        <span className="text-foreground">{loc.phone}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <span>Manager: <strong className="text-foreground">{loc.manager}</strong></span>
                        </span>
                        <span className="font-semibold text-foreground">{loc.stationCount} Stations</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSelectLocation(loc.name)}
                      className={`text-[13px] font-semibold uppercase tracking-wider px-3 py-1.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/40 hover:bg-muted text-foreground border border-border'
                      }`}
                    >
                      {isSelected ? 'Current Active Workspace' : 'Switch Workspace'}
                    </button>

                    {onDeleteLocation && locations.length > 1 && (
                      <button
                        onClick={() => onDeleteLocation(loc.id)}
                        className="p-1.5 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
                        title="Delete Location"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add Location Card */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-muted/40 border-2 border-dashed border-border hover:border-border hover:bg-muted/40 p-6 flex flex-col items-center justify-center text-center gap-3 transition-all cursor-pointer min-h-[220px]"
            >
              <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-semibold uppercase tracking-tight text-foreground text-sm">Add Salon or Mobile Van</h4>
                <p className="text-[13px] text-muted-foreground mt-1 max-w-[220px] tabular-nums">
                  Scale operations with new salon locations or mobile grooming vehicles.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Sub Section 3: Brand & Identity */}
      {subSection === 'brand' && (
        <div className="bg-card p-6 border border-border shadow-2xs space-y-5 text-[13px]">
          <h3 className="font-semibold uppercase tracking-tight text-foreground text-sm">Visual Identity &amp; System Palette</h3>
          <p className="text-muted-foreground text-[11px] tabular-nums">Colors used on the public booking page, customer portal, and email notifications.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 border border-border space-y-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">Primary Monolith</span>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-black border border-border" />
                <span className="tabular-nums text-foreground">#000000</span>
              </div>
            </div>

            <div className="p-4 border border-border space-y-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">Neutral Tone</span>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-muted-foreground border border-border" />
                <span className="tabular-nums text-foreground">#52525b</span>
              </div>
            </div>

            <div className="p-4 border border-border space-y-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">Canvas Surface</span>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#fafafa] border border-border" />
                <span className="tabular-nums text-foreground">#fafafa</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub Section 4: Opening Hours */}
      {subSection === 'hours' && (
        <div className="bg-card p-6 border border-border shadow-2xs space-y-4 text-[13px]">
          <h3 className="font-semibold uppercase tracking-tight text-foreground text-sm">Weekly Salon Operating Hours</h3>
          <p className="text-muted-foreground text-[11px] tabular-nums">Define standard appointment booking windows for groomers and bathers.</p>

          <div className="divide-y divide-border border border-border overflow-hidden tabular-nums">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
              <div key={day} className="flex items-center justify-between p-3 hover:bg-muted/40">
                <span className="font-semibold text-foreground w-28 uppercase">{day}</span>
                <div className="flex items-center gap-3">
                  {day === 'Sunday' ? (
                    <span className="px-3 py-1 bg-muted/40 text-muted-foreground border border-border font-semibold text-[11px]">
                      Closed for Deep Cleaning
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-primary text-primary-foreground font-semibold text-[11px]">
                      8:00 AM – 6:00 PM
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub Section 5: Holiday Blackouts */}
      {subSection === 'holidays' && (
        <div className="bg-card p-6 border border-border shadow-2xs space-y-4 text-[13px]">
          <h3 className="font-semibold uppercase tracking-tight text-foreground text-sm">Holiday Blackout Calendar</h3>
          <p className="text-muted-foreground text-[11px] tabular-nums">Automatic closure dates where the online scheduler prevents bookings.</p>

          <div className="space-y-2 tabular-nums">
            {[
              { name: 'Memorial Day', date: 'May 26, 2025', status: 'Closed' },
              { name: 'Independence Day', date: 'July 4, 2025', status: 'Closed' },
              { name: 'Labor Day', date: 'September 1, 2025', status: 'Closed' },
              { name: 'Thanksgiving Day', date: 'November 27, 2025', status: 'Closed' },
              { name: 'Christmas Day', date: 'December 25, 2025', status: 'Closed' },
            ].map((hol) => (
              <div key={hol.name} className="flex items-center justify-between p-3 bg-muted/40 border border-border">
                <div>
                  <p className="font-semibold text-foreground uppercase">{hol.name}</p>
                  <p className="text-muted-foreground text-[11px]">{hol.date}</p>
                </div>
                <span className="px-2.5 py-1 bg-primary text-primary-foreground font-semibold text-[10px]">
                  {hol.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add Location */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-foreground/[0-9]0 flex items-center justify-center p-4">
          <div className="bg-card max-w-md w-full p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold uppercase tracking-tight text-foreground text-sm">Add Salon Location / Van</h3>
                  <p className="text-[11px] text-muted-foreground tabular-nums">Configure a new grooming facility or mobile van</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLocation} className="space-y-3.5 text-[13px] tabular-nums">
              <div>
                <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Branch Name</label>
                <input
                  type="text"
                  required
                  value={newLocName}
                  onChange={(e) => setNewLocName(e.target.value)}
                  placeholder="e.g. Westside Spa or Mobile Van #2"
                  className="w-full px-3 py-2 border border-border bg-muted/40 text-foreground font-sans focus:outline-none focus:border-border"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Location Type</label>
                <select
                  value={newLocType}
                  onChange={(e) => setNewLocType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-border bg-card text-foreground font-sans focus:outline-none focus:border-border"
                >
                  <option value="Main Location">Main Salon Location</option>
                  <option value="Luxury Spa">Luxury Boutique Spa</option>
                  <option value="Mobile Van">Mobile Grooming Van</option>
                  <option value="Express Station">Express Bath Station</option>
                </select>
              </div>

              <div>
                <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Street Address</label>
                <input
                  type="text"
                  value={newLocAddress}
                  onChange={(e) => setNewLocAddress(e.target.value)}
                  placeholder="e.g. 8800 Park Boulevard"
                  className="w-full px-3 py-2 border border-border bg-muted/40 text-foreground font-sans focus:outline-none focus:border-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Lead Manager</label>
                  <input
                    type="text"
                    value={newLocManager}
                    onChange={(e) => setNewLocManager(e.target.value)}
                    placeholder="e.g. Marcus V."
                    className="w-full px-3 py-2 border border-border bg-muted/40 text-foreground font-sans focus:outline-none focus:border-border"
                  />
                </div>
                <div>
                  <label className="block text-foreground font-semibold uppercase tracking-wider text-[11px] mb-1">Grooming Stations</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newLocStations}
                    onChange={(e) => setNewLocStations(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border bg-muted/40 text-foreground font-sans focus:outline-none focus:border-border"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 border border-border text-foreground font-semibold uppercase tracking-wider hover:bg-muted/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Create Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
