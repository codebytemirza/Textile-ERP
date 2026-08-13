import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const KG_PER_LBS = 2.2046226218;

export function kgToLbs(kg: number): number {
  return kg * KG_PER_LBS;
}

export function lbsToKg(lbs: number): number {
  return lbs / KG_PER_LBS;
}

export function round(n: number, dp = 2): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '₨ 0';
  const hasDecimals = amount % 1 !== 0;
  return '₨ ' + amount.toLocaleString('en-PK', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function formatWeight(kg: number, lbs: number, unit: 'kg' | 'lbs'): string {
  return unit === 'lbs' ? `${round(lbs)} lbs` : `${round(kg)} kg`;
}

export function formatDate(ts: number | null | undefined, withTime = false): string {
  if (ts == null) return 'N/A';
  const d = new Date(ts);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) +
    (withTime ? ` ${d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}` : '');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}
