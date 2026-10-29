'use client';
import { useMemo, useState } from 'react';
import type { DbVariant } from '@/lib/catalog-db';

export default function VariantSelector({ variants }: { variants: DbVariant[] }) {
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size).filter(Boolean))], [variants]);
  const colors = useMemo(() => [...new Set(variants.map((v) => v.color).filter(Boolean))], [variants]);
  const [size, setSize] = useState<string | null>(sizes[0] ?? null);
  const [color, setColor] = useState<string | null>(colors[0] ?? null);
  const [quantity, setQuantity] = useState(1);

  const match = variants.find(
    (v) => (sizes.length === 0 || v.size === size) && (colors.length === 0 || v.color === color),
  ) ?? variants[0] ?? null;

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 'var(--radius)',
    border: active ? '2px solid var(--purple)' : '1px solid var(--line)',
    background: active ? 'var(--lav)' : 'var(--paper)',
    cursor: 'pointer',
    fontSize: 14,
  });

  if (!match) return <p style={{ color: 'var(--muted)' }}>No active variants for this product yet.</p>;

  return (
    <div>
      {sizes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Size</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sizes.map((s) => (
              <button key={s} type="button" style={chip(size === s)} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}
      {colors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Color</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {colors.map((c) => (
              <button key={c} type="button" style={chip(color === c)} onClick={() => setColor(c)}>{c}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '20px 0' }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>${match.price.toFixed(2)}</span>
        {match.compare_at_price != null && match.compare_at_price > match.price && (
          <span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>
            ${match.compare_at_price.toFixed(2)}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>SKU: {match.sku}</p>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Quantity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            style={{ ...chip(false), minWidth: 40, fontWeight: 700 }}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span style={{ fontSize: 18, fontWeight: 600, minWidth: 32, textAlign: 'center' }}>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            style={{ ...chip(false), minWidth: 40, fontWeight: 700 }}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>
      <a
        href={`/checkout?variant=${encodeURIComponent(match.sku)}&qty=${quantity}`}
        style={{
          display: 'inline-block', padding: '12px 28px', borderRadius: 'var(--radius)',
          background: 'var(--purple)', color: '#fff', fontWeight: 600, textDecoration: 'none',
        }}
      >
        Add to cart
      </a>
    </div>
  );
}
