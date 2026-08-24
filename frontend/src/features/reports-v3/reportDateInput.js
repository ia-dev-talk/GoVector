import { civilDateFromKey } from './operationalTime.js';

const FRENCH_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function formatFrenchCivilDate(value) {
  const normalized = String(value ?? '').trim();
  const date = civilDateFromKey(normalized);

  if (!date) return '';

  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

export function parseFrenchCivilDate(value) {
  const match = String(value ?? '').trim().match(FRENCH_DATE_PATTERN);
  if (!match) return null;

  const [, day, month, year] = match;
  const civilKey = `${year}-${month}-${day}`;
  return civilDateFromKey(civilKey) ? civilKey : null;
}

export function sanitizeFrenchDateDraft(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
