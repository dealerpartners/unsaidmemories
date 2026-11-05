'use client';

import React, { useEffect, useState } from 'react';
import { CustomerFullProfile, CustomerPetDetail, CustomerAppointmentItem } from '@/lib/types';
import { X, Pencil, Plus, Trash2, Calendar, Clock, Scissors, CheckCircle, AlertCircle, Camera, FileText, DollarSign, Download, CreditCard, ShieldCheck, Send, PawPrint, RefreshCw, Mail, MessageSquare, History, Tag, UserCheck, Printer, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { openPrintDocument, escapeHtmlClient as esc } from '@/lib/printing/client';

/* -------------------------------------------------------------
 * 1. EDIT PET MODAL
 * ----------------------------------------------------------- */
export const EditPetModal: React.FC<{
  pet: CustomerPetDetail;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedPet: CustomerPetDetail) => void;
}> = ({ pet, isOpen, onClose, onSave }) => {
  const [name, setName] = useState(pet.name);
  const [breed, setBreed] = useState(pet.breed);
  const [gender, setGender] = useState(pet.gender);
  const [birthDate, setBirthDate] = useState(pet.birthDate || '');
  const [weight, setWeight] = useState(pet.weight || '');
  const [medicalAlert, setMedicalAlert] = useState(pet.medicalAlert || '');
  const [vaccinationsStatus, setVaccinationsStatus] = useState<'Up to date' | 'Expiring Soon' | 'Expired'>(
    (pet.vaccinationsStatus as 'Up to date' | 'Expiring Soon' | 'Expired') || 'Up to date'
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...pet,
      name,
      breed,
      gender,
      birthDate,
      weight,
      medicalAlert,
      vaccinationsStatus,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Edit Pet Profile – {pet.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-semibold mb-1">Pet Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-foreground font-semibold mb-1">Breed</label>
              <input
                type="text"
                required
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-foreground font-semibold mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female')}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-foreground font-semibold mb-1">Birth Date</label>
              <input
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-foreground font-semibold mb-1">Weight</label>
              <input
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">Vaccination Status</label>
            <select
              value={vaccinationsStatus}
              onChange={(e) => setVaccinationsStatus(e.target.value as 'Up to date' | 'Expiring Soon' | 'Expired')}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
            >
              <option value="Up to date">Up to date</option>
              <option value="Expiring Soon">Expiring Soon (30 Days)</option>
              <option value="Expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">Health, Allergies &amp; Care Notes</label>
            <input
              type="text"
              value={medicalAlert}
              onChange={(e) => setMedicalAlert(e.target.value)}
              placeholder="e.g. Sensitive skin, hip dysplasia, no chicken treats"
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border text-muted-foreground hover:bg-muted/40 rounded-xl font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-xs cursor-pointer"
            >
              Save Pet Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 2. MANAGE VACCINES MODAL
 * ----------------------------------------------------------- */
export const ManageVaccinesModal: React.FC<{
  pet: CustomerPetDetail;
  isOpen: boolean;
  onClose: () => void;
  onSave: (records: { name: string; expiry: string; status: string }[]) => void;
}> = ({ pet, isOpen, onClose, onSave }) => {
  // Real vaccination rows from GET /api/admin/crm/pets/[crmPetId]/vaccinations
  // (crm_pet_vaccinations). The profile pet carries a shop dog id, so the
  // CRM pet id is resolved first (direct id, then the source_pet_id link).
  // Adds POST immediately — nothing is staged locally or fabricated
  // (the old modal invented rows with clinic "Self Reported").
  const [vaccines, setVaccines] = useState<{ id: string; name: string; expiry: string; status: string; clinic: string }[]>([]);
  const [crmPetId, setCrmPetId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'unlinked' | 'error'>('idle');
  const [newVacName, setNewVacName] = useState('');
  const [newVacExpiry, setNewVacExpiry] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      const rawId = String((pet as any)?.id || '');
      let resolved: string | null = null;
      try {
        const byId = await fetch(`/api/admin/crm/pets?id=${rawId}&limit=1`, { cache: 'no-store' });
        const bj = byId.ok ? await byId.json().catch(() => ({})) : {};
        if (Array.isArray(bj.data) && bj.data.length > 0) resolved = String(bj.data[0].id);
        if (!resolved) {
          const bySource = await fetch(`/api/admin/crm/pets?source_pet_id=${rawId}&limit=1`, { cache: 'no-store' });
          const sj = bySource.ok ? await bySource.json().catch(() => ({})) : {};
          if (Array.isArray(sj.data) && sj.data.length > 0) resolved = String(sj.data[0].id);
        }
      } catch { /* falls through to unlinked */ }
      if (cancelled) return;
      if (!resolved) {
        setLoadState('unlinked');
        return;
      }
      setCrmPetId(resolved);
      try {
        const res = await fetch(`/api/admin/crm/pets/${resolved}/vaccinations`, { cache: 'no-store' });
        const j = res.ok ? await res.json().catch(() => ({})) : {};
        if (cancelled) return;
        if (!res.ok) {
          setLoadState('error');
          return;
        }
        setVaccines((j.vaccinations || []).map((v: any) => ({
          id: String(v.id),
          name: v.vaccineName || 'Vaccine',
          expiry: v.expiresOn || '',
          status: v.status || 'current',
          clinic: v.veterinarianName || '',
        })));
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, pet]);

  if (!isOpen) return null;

  const handleAddVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVacName.trim() || !newVacExpiry || !crmPetId) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch(`/api/admin/crm/pets/${crmPetId}/vaccinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccineName: newVacName.trim(), expiresOn: newVacExpiry, status: 'current' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        setAddError(j?.error || 'Vaccine record could not be saved.');
        return;
      }
      const v = j.vaccination || {};
      setVaccines(prev => [
        { id: String(v.id || Date.now()), name: v.vaccineName || newVacName.trim(), expiry: v.expiresOn || newVacExpiry, status: v.status || 'current', clinic: '' },
        ...prev,
      ]);
      setNewVacName('');
      setNewVacExpiry('');
    } catch {
      setAddError('Vaccine record could not be saved — network error.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-success" />
            <h3 className="font-semibold text-foreground text-sm">Manage Vaccines – {pet.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          {loadState === 'loading' && <div className="text-muted-foreground">Loading vaccination records…</div>}
          {loadState === 'error' && <div className="text-destructive">Vaccination records could not be loaded.</div>}
          {loadState === 'unlinked' && (
            <div className="text-muted-foreground">
              {pet.name} has no CRM pet record yet, so vaccination records can&apos;t be attached. Add the pet to the CRM first.
            </div>
          )}
          {loadState === 'ready' && vaccines.length === 0 && (
            <div className="text-muted-foreground">No vaccination records on file for {pet.name} yet.</div>
          )}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {vaccines.map((v) => (
              <div key={v.id} className="p-3 bg-muted/40 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">{v.name}</div>
                  <div className="text-muted-foreground/70 text-[11px]">
                    {v.expiry ? `Expires: ${v.expiry}` : 'No expiry recorded'}{v.clinic ? ` • ${v.clinic}` : ''}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border capitalize ${
                  v.status === 'current'
                    ? 'bg-success/10 text-success border-success/20'
                    : v.status === 'expired'
                      ? 'bg-destructive/10 text-destructive border-destructive/20'
                      : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {v.status}
                </span>
              </div>
            ))}
          </div>

          {crmPetId && (
            <form onSubmit={handleAddVaccine} className="pt-3 border-t border-border space-y-3">
              <div className="font-semibold text-foreground text-[13px]">Add Vaccine Record</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Vaccine Name (e.g. Rabies)"
                  value={newVacName}
                  onChange={(e) => setNewVacName(e.target.value)}
                  className="px-3 py-2 bg-muted/40 border border-border rounded-xl text-[13px]"
                />
                <input
                  type="date"
                  value={newVacExpiry}
                  onChange={(e) => setNewVacExpiry(e.target.value)}
                  className="px-3 py-2 bg-muted/40 border border-border rounded-xl text-[13px]"
                />
              </div>
              {addError && <div className="text-destructive text-[12px]">{addError}</div>}
              <button
                type="submit"
                disabled={adding}
                className="w-full py-2 bg-muted/40 hover:bg-muted text-foreground font-semibold rounded-xl text-[13px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{adding ? 'Saving…' : 'Add Record'}</span>
              </button>
            </form>
          )}

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <button
              onClick={() => {
                onSave(vaccines.map(v => ({ name: v.name, expiry: v.expiry, status: v.status })));
                onClose();
              }}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 3. RESCHEDULE APPOINTMENT MODAL
 * ----------------------------------------------------------- */
export const RescheduleModal: React.FC<{
  appointment: any;
  isOpen: boolean;
  onClose: () => void;
  onReschedule: (startsAtIso: string) => void;
}> = ({ appointment, isOpen, onClose, onReschedule }) => {
  // Seeded from the appointment's own start time — never a hardcoded
  // date or invented groomer availability slots.
  const seed = appointment?.startsAt ? new Date(appointment.startsAt) : null;
  const seedDate = seed && !Number.isNaN(seed.getTime())
    ? `${seed.getFullYear()}-${String(seed.getMonth() + 1).padStart(2, '0')}-${String(seed.getDate()).padStart(2, '0')}`
    : '';
  const seedTime = seed && !Number.isNaN(seed.getTime())
    ? `${String(seed.getHours()).padStart(2, '0')}:${String(seed.getMinutes()).padStart(2, '0')}`
    : '09:00';
  const [date, setDate] = useState(seedDate);
  const [time, setTime] = useState(seedTime);

  if (!isOpen || !appointment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Reschedule – {appointment.pet}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div className="p-3 bg-primary/5/60 rounded-xl border border-primary/20 text-primary">
            <div className="font-semibold">{appointment.service}</div>
            <div className="text-[11px] text-primary">Current Slot: {appointment.date} at {appointment.time} ({appointment.groomer})</div>
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">Select New Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
            />
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">New Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-xl text-muted-foreground hover:bg-muted/40 font-medium"
            >
              Cancel
            </button>
            <button
              disabled={!date || !time}
              onClick={() => {
                const when = new Date(`${date}T${time}:00`);
                if (Number.isNaN(when.getTime())) return;
                onReschedule(when.toISOString());
                onClose();
              }}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
            >
              Confirm Reschedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 4. ADD-ON / SERVICE UPDATE MODAL
 * ----------------------------------------------------------- */
export const AddonServiceModal: React.FC<{
  appointment: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (serviceIds: string[]) => void;
}> = ({ appointment, isOpen, onClose, onUpdate }) => {
  // The catalog is the real crm_services list (GET /api/admin/crm/services)
  // filtered to add-ons — never a hardcoded menu with invented prices,
  // and nothing is pre-selected.
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [addonOptions, setAddonOptions] = useState<{ id: string; name: string; price: number }[]>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCatalogState('loading');
    fetch('/api/admin/crm/services?limit=200', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('services'))))
      .then(d => {
        if (cancelled) return;
        const addons = (d.services || [])
          .filter((s: any) => s.isAddOn)
          .map((s: any) => ({ id: String(s.id), name: s.name, price: Number(s.defaultPrice) || 0 }));
        setAddonOptions(addons);
        setCatalogState('ready');
      })
      .catch(() => { if (!cancelled) setCatalogState('error'); });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen || !appointment) return null;

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <PawPrint className="w-4 h-4 text-warning" />
            <h3 className="font-semibold text-foreground text-sm">Add-on / Service Update – {appointment.pet}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div className="font-semibold text-foreground">Select Add-on Upgrades for Grooming Session:</div>
          {catalogState === 'loading' && <div className="text-muted-foreground">Loading add-on services…</div>}
          {catalogState === 'error' && <div className="text-destructive">Add-on services could not be loaded.</div>}
          {catalogState === 'ready' && addonOptions.length === 0 && (
            <div className="text-muted-foreground">No add-on services are configured in the catalog.</div>
          )}
          <div className="space-y-2">
            {addonOptions.map((opt) => {
              const isChecked = selectedAddons.includes(opt.id);
              return (
                <div
                  key={opt.id}
                  onClick={() => toggleAddon(opt.id)}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                    isChecked
                      ? 'bg-primary/5 border-primary/20 text-primary font-semibold'
                      : 'bg-muted/40 border-border text-foreground hover:bg-muted/40'
                  }`}
                >
                  <span>{opt.name} (${opt.price.toFixed(2)})</span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="accent-brand-teal w-4 h-4"
                  />
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-xl text-muted-foreground hover:bg-muted/40 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onUpdate(selectedAddons);
                onClose();
              }}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
            >
              Apply Updates
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 5. VIEW APPOINTMENT DETAILS MODAL
 * ----------------------------------------------------------- */
export const AppointmentDetailsModal: React.FC<{
  appointment: any;
  isOpen: boolean;
  onClose: () => void;
}> = ({ appointment, isOpen, onClose }) => {
  if (!isOpen || !appointment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Appointment Details – #{appointment.id}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-xl border border-border">
            <div>
              <div className="text-base font-semibold text-foreground">{appointment.pet}</div>
              <div className="text-muted-foreground">{appointment.service}</div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[13px] font-semibold bg-primary/5 text-primary border border-primary/20">
              {appointment.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-foreground">
            <div className="p-3 border border-border rounded-xl bg-muted/40/50">
              <span className="text-muted-foreground/70 block text-[11px]">Date &amp; Time</span>
              <span className="font-semibold">{appointment.date} at {appointment.time}</span>
            </div>
            <div className="p-3 border border-border rounded-xl bg-muted/40/50">
              <span className="text-muted-foreground/70 block text-[11px]">Estimated Duration</span>
              <span className="font-semibold">{appointment.duration}</span>
            </div>
            <div className="p-3 border border-border rounded-xl bg-muted/40/50">
              <span className="text-muted-foreground/70 block text-[11px]">Assigned Groomer</span>
              <span className="font-semibold">{appointment.groomer}</span>
            </div>
            <div className="p-3 border border-border rounded-xl bg-muted/40/50">
              <span className="text-muted-foreground/70 block text-[11px]">Location</span>
              <span className="font-semibold">{appointment.location}</span>
            </div>
          </div>

          {appointment.internalNotes && (
            <div className="p-3 bg-warning/10 rounded-xl border border-warning/20 text-warning">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-warning" />
                <span>Internal Notes:</span>
              </div>
              <p className="text-[11px] mt-1 text-warning whitespace-pre-wrap">{appointment.internalNotes}</p>
            </div>
          )}

          {appointment.customerNotes && (
            <div className="p-3 bg-muted/40 rounded-xl border border-border">
              <div className="font-semibold text-foreground">Customer Notes:</div>
              <p className="text-[11px] mt-1 text-muted-foreground whitespace-pre-wrap">{appointment.customerNotes}</p>
            </div>
          )}

          {!appointment.internalNotes && !appointment.customerNotes && (
            <p className="text-[12px] text-muted-foreground">No notes were recorded for this appointment.</p>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 6. VIEW GROOMING RECORD MODAL
 * ----------------------------------------------------------- */
export const ViewGroomingRecordModal: React.FC<{
  record: any;
  isOpen: boolean;
  onClose: () => void;
}> = ({ record, isOpen, onClose }) => {
  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Grooming Record – {record.pet} ({record.date})</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-muted/40 border border-border rounded-xl">
              <div className="text-[10px] text-muted-foreground/70 font-medium uppercase">Service</div>
              <div className="font-semibold text-foreground mt-0.5">{record.service}</div>
            </div>
            <div className="p-3 bg-muted/40 border border-border rounded-xl">
              <div className="text-[10px] text-muted-foreground/70 font-medium uppercase">Groomer</div>
              <div className="font-semibold text-foreground mt-0.5">{record.groomer}</div>
            </div>
            <div className="p-3 bg-muted/40 border border-border rounded-xl">
              <div className="text-[10px] text-muted-foreground/70 font-medium uppercase">Duration</div>
              <div className="font-semibold text-foreground mt-0.5">{record.duration}</div>
            </div>
          </div>

          {(record.coatCondition || record.skinCondition || record.behaviorNotes) && (
            <div className="space-y-2 p-3.5 bg-muted/40 rounded-xl border border-border text-foreground">
              <div className="font-semibold text-foreground text-[13px]">Session Findings:</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {record.coatCondition && <div>• <strong>Coat:</strong> {record.coatCondition}</div>}
                {record.skinCondition && <div>• <strong>Skin:</strong> {record.skinCondition}</div>}
                {record.behaviorNotes && <div>• <strong>Behavior:</strong> {record.behaviorNotes}</div>}
              </div>
            </div>
          )}

          {record.service && (
            <div className="p-3 bg-muted/40 rounded-xl border border-border">
              <span className="font-semibold block text-foreground">Services Performed:</span>
              <p className="mt-1 text-muted-foreground text-[11px]">{record.service}</p>
            </div>
          )}

          <div className="p-3 bg-primary/5/60 rounded-xl border border-primary/20 text-primary">
            <span className="font-semibold block">Groomer Clinical Note:</span>
            <p className="mt-1 text-foreground text-[11px]">{record.notes || 'No notes recorded for this session.'}</p>
          </div>

          {record.customerVisibleNotes && (
            <div className="p-3 bg-muted/40 rounded-xl border border-border">
              <span className="font-semibold block text-foreground">Note Shared With Customer:</span>
              <p className="mt-1 text-muted-foreground text-[11px]">{record.customerVisibleNotes}</p>
            </div>
          )}

          {record.recommendNextVisit && (
            <div className="p-3 bg-muted/40 rounded-xl border border-border text-[11px] text-muted-foreground">
              Next visit recommended{record.recommendedNextVisitDate ? ` on ${record.recommendedNextVisitDate}` : ''}
              {record.recommendedNextService ? ` — ${record.recommendedNextService}` : ''}.
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer"
            >
              Close Record
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 7. VIEW PHOTOS MODAL
 * ----------------------------------------------------------- */
export const ViewPhotosModal: React.FC<{
  petName: string;
  photos?: { id?: string; url?: string | null; photoType?: string | null }[];
  recordDate?: string;
  isOpen: boolean;
  onClose: () => void;
}> = ({ petName, photos = [], recordDate, isOpen, onClose }) => {
  if (!isOpen) return null;

  // Only the record's real photos (signed grooming-photos URLs from the
  // grooming-records route) — never stock imagery.
  const withUrls = photos.filter((p) => p.url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-2xl w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Grooming Photos – {petName}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          {withUrls.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No photos were attached to this grooming session.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {withUrls.map((photo, i) => (
                <div key={photo.id || i} className="space-y-2">
                  <div className="text-[13px] font-semibold text-foreground capitalize">{photo.photoType || 'Session'} Photo</div>
                  <div className="relative h-56 rounded-xl overflow-hidden bg-muted/40 border border-border">
                    <Image
                      src={photo.url as string}
                      alt={`${photo.photoType || 'Grooming'} photo`}
                      fill
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-border flex justify-between items-center">
            <span className="text-muted-foreground text-[13px]">{recordDate ? `Session Date: ${recordDate}` : ''}</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 8. RECOMMEND NEXT VISIT MODAL
 * ----------------------------------------------------------- */
export const RecommendNextVisitModal: React.FC<{
  petName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (intervalLabel: string, dateIso: string) => void;
}> = ({ petName, isOpen, onClose, onSave }) => {
  // Intervals are real week counts; the recommended date is computed
  // from today — never a hardcoded calendar date.
  const INTERVALS = [
    { weeks: 4, label: '4 Weeks' },
    { weeks: 6, label: '6 Weeks' },
    { weeks: 8, label: '8 Weeks' },
  ];
  const [weeks, setWeeks] = useState(4);
  const target = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
  const targetIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  const targetLabel = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Recommend Next Visit – {petName}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div>
            <label className="block text-foreground font-semibold mb-1">Recommended Rebook Interval</label>
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
            >
              {INTERVALS.map((opt) => {
                const d = new Date(Date.now() + opt.weeks * 7 * 24 * 60 * 60 * 1000);
                return (
                  <option key={opt.weeks} value={opt.weeks}>
                    {opt.label} – {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 text-primary text-[11px]">
            Saving records a rebooking recommendation for {petName} on {targetLabel}. The customer is contacted through the
            rebooking flow — no reminder is sent automatically by this action.
          </div>

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-xl text-muted-foreground">Cancel</button>
            <button
              onClick={() => {
                onSave(`${weeks} weeks`, targetIso);
                onClose();
              }}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer"
            >
              Set Recommendation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 9. INVOICE MODAL
 * ----------------------------------------------------------- */
export const InvoiceModal: React.FC<{
  payment: any;
  isOpen: boolean;
  onClose: () => void;
}> = ({ payment, isOpen, onClose }) => {
  if (!isOpen || !payment) return null;

  // Render only what the record actually carries. When the payment is backed
  // by a real invoice (items / subtotal / total from /api/admin/invoices),
  // those stored figures are shown as-is. Otherwise the modal receives a
  // payment summary — description + amount — and shows exactly that: no
  // invented tax/gratuity splits, no fabricated invoice number, card, or
  // auth code.
  const items: any[] = Array.isArray(payment.items) ? payment.items : [];
  const hasItems = items.length > 0;
  const total = Number(payment.total ?? payment.amount ?? 0);
  const subtotal = payment.subtotal != null ? Number(payment.subtotal) : null;
  const taxAmount =
    payment.taxAmount != null ? Number(payment.taxAmount)
    : payment.tax != null ? Number(payment.tax)
    : null;
  const amountPaid = payment.amountPaid != null ? Number(payment.amountPaid) : null;
  const depositPaid = payment.depositPaid != null ? Number(payment.depositPaid) : null;
  const balanceDue = payment.balanceDue != null ? Number(payment.balanceDue) : null;
  const invoiceNumber = payment.invoiceNumber || payment.number || null;
  const statusText = String(payment.status || '').trim();
  const isPaid = /paid|succeeded|captured|settled/i.test(statusText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">
              {invoiceNumber ? `Invoice ${invoiceNumber}` : 'Payment Details'}
            </h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div className="flex justify-between items-start border-b border-border pb-3">
            <div>
              <div className="font-semibold text-foreground text-base">UnSaid Memories Grooming</div>
              <div className="text-muted-foreground/70 text-[11px]">699 Waring Rd, Memphis, TN</div>
            </div>
            <div className="text-right">
              {statusText && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  isPaid
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-muted/40 text-muted-foreground border-border'
                }`}>
                  {statusText.toUpperCase()}
                </span>
              )}
              <div className="text-muted-foreground/70 text-[11px] mt-1">{payment.date}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-foreground">Line Items:</div>
            <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-2">
              {hasItems ? (
                items.map((it: any, i: number) => (
                  <div key={it.id ?? i} className="flex justify-between">
                    <span>
                      {it.description}
                      {Number(it.quantity ?? 1) !== 1 && (
                        <span className="text-muted-foreground"> × {Number(it.quantity)}</span>
                      )}
                    </span>
                    <span className="font-semibold">
                      ${(it.totalPrice != null
                        ? Number(it.totalPrice)
                        : Number(it.unitPrice ?? 0) * Number(it.quantity ?? 1)
                      ).toFixed(2)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between">
                  <span>{payment.description}</span>
                  <span className="font-semibold">${total.toFixed(2)}</span>
                </div>
              )}
              {subtotal != null && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              )}
              {taxAmount != null && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Sales Tax</span>
                  <span>${taxAmount.toFixed(2)}</span>
                </div>
              )}
              {depositPaid != null && depositPaid > 0 && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Deposit Applied</span>
                  <span>-${depositPaid.toFixed(2)}</span>
                </div>
              )}
              {amountPaid != null && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Amount Paid</span>
                  <span>${amountPaid.toFixed(2)}</span>
                </div>
              )}
              {balanceDue != null && balanceDue > 0 && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Balance Due</span>
                  <span>${balanceDue.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between font-semibold text-foreground text-sm">
                <span>{hasItems ? 'Total' : 'Total Paid'}</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {payment.method && (
            <div className="text-muted-foreground/70 text-[11px]">
              Paid via {payment.method}
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={async () => {
                // Print a standalone receipt document on this device's
                // printer — the same figures this modal shows, nothing
                // invented — instead of printing the admin screen.
                const row = (l: string, v: string, strong = false) =>
                  `<div style="display:flex;justify-content:space-between;font-size:13px;${strong ? 'font-weight:700;font-size:15px;border-top:2px solid #111;padding-top:6px;' : 'padding:2px 0;'}"><span>${l}</span><span>${v}</span></div>`;
                const itemRows = hasItems
                  ? items.map((it: any) => row(
                      `${esc(it.description)}${Number(it.quantity ?? 1) !== 1 ? ` × ${Number(it.quantity)}` : ''}`,
                      `$${(it.totalPrice != null ? Number(it.totalPrice) : Number(it.unitPrice ?? 0) * Number(it.quantity ?? 1)).toFixed(2)}`,
                    )).join('')
                  : row(esc(payment.description || 'Payment'), `$${total.toFixed(2)}`);
                const ok = await openPrintDocument({
                  docType: 'receipt',
                  title: invoiceNumber ? `Invoice ${invoiceNumber}` : 'Payment Receipt',
                  bodyHtml: `
                    <h1 style="font-size:17px;margin:0;">UnSaid Memories Grooming</h1>
                    <p style="margin:2px 0 10px;color:#666;font-size:11px;">699 Waring Rd, Memphis, TN${payment.date ? ` &bull; ${esc(payment.date)}` : ''}${statusText ? ` &bull; ${esc(statusText.toUpperCase())}` : ''}</p>
                    ${itemRows}
                    ${subtotal != null ? row('Subtotal', `$${subtotal.toFixed(2)}`) : ''}
                    ${taxAmount != null ? row('Sales Tax', `$${taxAmount.toFixed(2)}`) : ''}
                    ${depositPaid != null && depositPaid > 0 ? row('Deposit Applied', `-$${depositPaid.toFixed(2)}`) : ''}
                    ${amountPaid != null ? row('Amount Paid', `$${amountPaid.toFixed(2)}`) : ''}
                    ${balanceDue != null && balanceDue > 0 ? row('Balance Due', `$${balanceDue.toFixed(2)}`) : ''}
                    ${row(hasItems ? 'Total' : 'Total Paid', `$${total.toFixed(2)}`, true)}
                    ${payment.method ? `<p style="color:#666;font-size:11px;margin-top:10px;">Paid via ${esc(payment.method)}</p>` : ''}`,
                });
                if (!ok) alert('Pop-ups are blocked — allow pop-ups for this site to print.');
              }}
              className="px-4 py-2 border rounded-xl font-medium text-foreground hover:bg-muted/40 flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 10. REFUND MODAL
 * ----------------------------------------------------------- */
export const RefundModal: React.FC<{
  payment: any;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRefund: (amount: number, reason: string) => void;
}> = ({ payment, isOpen, onClose, onConfirmRefund }) => {
  const [refundAmount, setRefundAmount] = useState(payment ? payment.amount : 0);
  const [reason, setReason] = useState('Customer Request / Satisfaction Guarantee');

  if (!isOpen || !payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-destructive" />
            <h3 className="font-semibold text-foreground text-sm">Issue Refund</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div className="p-3 bg-destructive/5 rounded-xl border border-destructive/20 text-destructive">
            Original Transaction: <strong>${payment.amount.toFixed(2)}</strong> ({payment.description}) on {payment.date}
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">Refund Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl font-semibold text-foreground"
            />
          </div>

          <div>
            <label className="block text-foreground font-semibold mb-1">Reason for Refund</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
            >
              <option>Customer Request / Satisfaction Guarantee</option>
              <option>Appointment Rescheduled / Cancelled</option>
              <option>Overcharge Correction</option>
              <option>Service Discount Adjustment</option>
            </select>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-xl text-muted-foreground">Cancel</button>
            <button
              onClick={() => {
                onConfirmRefund(refundAmount, reason);
                onClose();
              }}
              className="px-4 py-2 bg-destructive hover:bg-destructive text-white font-semibold rounded-xl cursor-pointer shadow-xs"
            >
              Process ${refundAmount.toFixed(2)} Refund
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 11. AUDIT LOG MODAL
 * ----------------------------------------------------------- */
export const AuditLogModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  entries?: { id?: string; timestamp?: string; actor?: string | null; description?: string }[];
}> = ({ isOpen, onClose, entries = [] }) => {
  if (!isOpen) return null;

  // Real crm_audit_log entries for this customer (from the activity
  // endpoint) — an empty list is an honest empty state, never sample rows.
  const logs = entries.map((e) => ({
    timestamp: e.timestamp ? new Date(e.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
    actor: e.actor || 'System',
    action: e.description || '',
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Customer Record Audit Log</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 text-[13px] max-h-80 overflow-y-auto">
          {logs.length === 0 && (
            <p className="text-muted-foreground text-center py-4">No audit entries recorded for this customer yet.</p>
          )}
          {logs.map((log, i) => (
            <div key={i} className="p-3 bg-muted/40 rounded-xl border border-border space-y-1">
              <div className="flex items-center justify-between text-muted-foreground/70 text-[11px]">
                <span>{log.timestamp}</span>
                <span className="font-semibold text-primary">{log.actor}</span>
              </div>
              <div className="font-medium text-foreground">{log.action}</div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 12. CAMPAIGN / MARKETING MODAL
 * ----------------------------------------------------------- */
export const CampaignModal: React.FC<{
  customerName: string;
  campaigns?: { id: string; name: string; status?: string | null }[];
  isOpen: boolean;
  onClose: () => void;
  onAssign: (campaignId: string) => void;
}> = ({ customerName, campaigns = [], isOpen, onClose, onAssign }) => {
  // Options are the tenant's real crm_campaigns (id values) — never a
  // hardcoded list of campaign names.
  const [campaign, setCampaign] = useState('');

  useEffect(() => {
    if (isOpen && !campaign && campaigns.length > 0) setCampaign(campaigns[0].id);
  }, [isOpen, campaigns, campaign]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Add to Marketing Campaign</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-[13px]">
          <div>
            <label className="block text-foreground font-semibold mb-1">Select Marketing Segment / Campaign</label>
            {campaigns.length === 0 ? (
              <p className="text-muted-foreground">No campaigns exist for this business yet — create one in Marketing first.</p>
            ) : (
              <select
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.status ? ` (${c.status})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-xl text-muted-foreground">Cancel</button>
            <button
              disabled={!campaign}
              onClick={() => {
                onAssign(campaign);
              }}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer disabled:opacity-50"
            >
              Add {customerName}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 13. OPT IN/OUT COMMUNICATION PREFERENCES MODAL
 * ----------------------------------------------------------- */
export const OptInOutModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialPrefs?: { sms: boolean; email: boolean; marketing: boolean; marketingSms: boolean } | null;
  onSave: (prefs: { sms: boolean; email: boolean; marketing: boolean; marketingSms: boolean }) => boolean | Promise<boolean>;
}> = ({ isOpen, onClose, initialPrefs, onSave }) => {
  // Toggles seed from the customer's STORED opt-in columns (loaded by
  // the parent when the modal opens) — the old all-true defaults
  // misrepresented consent that was never given. Unloaded → all off
  // with a loading note, never invented consent. All four flags the
  // customer can set in their portal are here (transactional SMS/email
  // + marketing email/SMS) — marketing SMS was previously missing, so
  // a consent the customer had set was invisible to staff.
  const [sms, setSms] = useState(false);
  const [email, setEmail] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [marketingSms, setMarketingSms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && initialPrefs) {
      setSms(initialPrefs.sms);
      setEmail(initialPrefs.email);
      setMarketing(initialPrefs.marketing);
      setMarketingSms(initialPrefs.marketingSms);
    }
  }, [isOpen, initialPrefs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-muted/40">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Communication Preferences</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 text-[13px]">
          <label className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border cursor-pointer">
            <div>
              <div className="font-semibold text-foreground">SMS Appointment Reminders</div>
              <div className="text-muted-foreground/70 text-[11px]">Automated 24h &amp; 2h text messages</div>
            </div>
            <input
              type="checkbox"
              checked={sms}
              onChange={(e) => setSms(e.target.checked)}
              className="accent-brand-teal w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border cursor-pointer">
            <div>
              <div className="font-semibold text-foreground">Email Invoices &amp; Receipts</div>
              <div className="text-muted-foreground/70 text-[11px]">Digital copy sent upon checkout</div>
            </div>
            <input
              type="checkbox"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
              className="accent-brand-teal w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border cursor-pointer">
            <div>
              <div className="font-semibold text-foreground">Promotions &amp; Seasonal Offers</div>
              <div className="text-muted-foreground/70 text-[11px]">Monthly newsletters and holiday discounts</div>
            </div>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="accent-brand-teal w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border cursor-pointer">
            <div>
              <div className="font-semibold text-foreground">Promotions by Text</div>
              <div className="text-muted-foreground/70 text-[11px]">Occasional offers by SMS</div>
            </div>
            <input
              type="checkbox"
              checked={marketingSms}
              onChange={(e) => setMarketingSms(e.target.checked)}
              className="accent-brand-teal w-4 h-4"
            />
          </label>

          {!initialPrefs && (
            <p className="text-muted-foreground text-[12px]">Stored preferences could not be loaded — toggles start off. Saving writes the values shown.</p>
          )}

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 border rounded-xl text-muted-foreground">Cancel</button>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const ok = await onSave({ sms, email, marketing, marketingSms });
                setSaving(false);
                if (ok) onClose();
              }}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
