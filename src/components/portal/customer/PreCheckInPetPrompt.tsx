'use client';

// ============================================================================
// PreCheckInPetPrompt — after a customer books, if the pet on the booking
// is missing profile details (breed, weight, birthday), this prompt asks
// them to complete the pet's profile before check-in (Sunny's pre-check-in
// intent; the breed field is the breeds-table autocomplete). It reads the
// real booking + pet records, saves through PATCH /api/customer/pets
// (the same registry the salon reads), and stays out of the way: it opens
// at most once per booking per browser session, and "Later" is a real
// answer. The visit questionnaire (vaccinations, handling) is a separate
// flow and is not duplicated here.
// ============================================================================

import { useEffect, useState } from 'react';
import { Loader2, PawPrint } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BreedAutocomplete } from '@/components/portal/customer/BreedAutocomplete';

interface BookingLite {
  id: string;
  date: string;
  time: string | null;
  dogId: string | null;
  dogName: string | null;
}

interface PetLite {
  id: string;
  name: string;
  breed: string | null;
  breedId: string | null;
  birthDate: string | null;
  weightLbs: number | string | null;
}

const missingFields = (pet: PetLite): string[] => {
  const missing: string[] = [];
  if (!pet.breed || !String(pet.breed).trim()) missing.push('breed');
  if (pet.weightLbs == null || String(pet.weightLbs).trim() === '') missing.push('weight');
  if (!pet.birthDate) missing.push('birthday');
  return missing;
};

export function PreCheckInPetPrompt() {
  const [target, setTarget] = useState<{ booking: BookingLite; pet: PetLite } | null>(null);
  const [open, setOpen] = useState(false);
  const [breedName, setBreedName] = useState('');
  const [breedId, setBreedId] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/customer/appointments').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/customer/pets').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([appt, petsData]) => {
      if (cancelled || !appt || !petsData) return;
      const upcoming = (appt.upcoming ?? []) as BookingLite[];
      const pets = (petsData.pets ?? []) as PetLite[];
      for (const booking of upcoming) {
        if (!booking.dogId) continue;
        const pet = pets.find((p) => p.id === booking.dogId);
        if (!pet) continue;
        if (missingFields(pet).length === 0) continue;
        const flag = `unsaid-precheckin-${pet.id}-${booking.id}`;
        try {
          if (sessionStorage.getItem(flag)) continue;
        } catch {
          /* storage unavailable — show the prompt */
        }
        setTarget({ booking, pet });
        setBreedName(pet.breed ?? '');
        setBreedId(pet.breedId ?? null);
        setWeight(pet.weightLbs != null ? String(pet.weightLbs) : '');
        setBirthDate(pet.birthDate ?? '');
        setOpen(true);
        return;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) return null;
  const { booking, pet } = target;
  const missing = missingFields(pet);

  const dismiss = () => {
    try {
      sessionStorage.setItem(`unsaid-precheckin-${pet.id}-${booking.id}`, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const save = async () => {
    const weightNum = parseFloat(weight);
    if (missing.includes('breed') && !breedName.trim()) {
      setError('Add a breed — start typing and pick a match, or write it in.');
      return;
    }
    if (missing.includes('weight') && (!Number.isFinite(weightNum) || weightNum <= 0 || weightNum > 300)) {
      setError('Enter a weight in pounds (1–300).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/pets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pet.id,
          name: pet.name,
          breedName: breedName.trim() || pet.breed || undefined,
          breedId,
          weightLbs: Number.isFinite(weightNum) ? weightNum : undefined,
          birthDate: birthDate || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Could not save those details — please try again.');
        return;
      }
      toast.success(`${pet.name}'s profile is ready for check-in.`);
      dismiss();
    } catch {
      setError('Network problem — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[19px]">
            <PawPrint className="size-5 text-primary" />
            Before {pet.name} comes in
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {pet.name} has an appointment on {booking.date}
            {booking.time ? ` at ${booking.time}` : ''}, and we&apos;re missing{' '}
            {missing.join(', ')} on their profile. Adding it now makes
            check-in faster and helps us care for them properly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="precheckin-breed" className="text-[11px] font-bold uppercase tracking-[0.1em]">
              Breed
            </Label>
            <BreedAutocomplete
              id="precheckin-breed"
              value={breedName}
              breedId={breedId}
              onChange={(name, id) => {
                setBreedName(name);
                setBreedId(id);
              }}
              placeholder="Start typing — Goldendoodle, Lab, rescue mix…"
              className="h-11 rounded-lg text-[13.5px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="precheckin-weight" className="text-[11px] font-bold uppercase tracking-[0.1em]">
                Weight (lbs)
              </Label>
              <Input
                id="precheckin-weight"
                type="number"
                min={1}
                max={300}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="30"
                className="h-11 rounded-lg text-[13.5px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precheckin-birthday" className="text-[11px] font-bold uppercase tracking-[0.1em]">
                Birthday
              </Label>
              <Input
                id="precheckin-birthday"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="h-11 rounded-lg text-[13.5px]"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-[12.5px] font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={dismiss} disabled={saving} className="h-10 rounded-lg text-[12px] font-semibold">
            Later
          </Button>
          <Button onClick={save} disabled={saving} className="h-10 rounded-lg px-5 text-[12px] font-bold uppercase tracking-[0.12em]">
            {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save details'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
