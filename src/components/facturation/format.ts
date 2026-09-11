const currencyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyDecimalsFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('fr-FR');

export function dh(n: number, decimals = false): string {
  const formatted = decimals ? currencyDecimalsFormatter.format(n) : currencyFormatter.format(n);
  // Add narrow no-break space before DH per spec
  return `${formatted}\u202F\u200BDH`.replace(/\s/g, '\u202F');
}

export function num(n: number): string {
  return numberFormatter.format(n);
}

export function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

export function fmtPct(n: number): string {
  return pct(n);
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const MONTHS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

export function fmtDateLong(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtMonthShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const yy = String(d.getFullYear()).slice(-2);
  return `${MONTHS[d.getMonth()]} ${yy}`;
}

export function joursRetard(dateEcheance: string): number {
  if (!dateEcheance) return 0;
  const d = new Date(dateEcheance).getTime();
  const diff = Date.now() - d;
  return Math.max(0, Math.floor(diff / 86400000));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function amountInWords(n: number): string {
  if (n === 0) return 'zéro dirham';
  // Simplified conversion for receipt amounts, supporting up to 999,999.
  // We use this specifically for Moroccan Dirhams in Receipts
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];
  
  function convertBelow1000(num: number): string {
    let words = '';
    if (num > 99) {
      const h = Math.floor(num / 100);
      if (h === 1) words += 'cent ';
      else words += units[h] + ' cent' + (h > 1 && num % 100 === 0 ? 's ' : ' ');
      num %= 100;
    }
    if (num > 9 && num < 20) {
      words += teens[num - 10] + ' ';
    } else {
      const t = Math.floor(num / 10);
      const u = num % 10;
      
      if (t === 7 || t === 9) {
        words += tens[t - 1] + '-' + teens[u] + ' ';
      } else {
        if (t > 0) words += tens[t] + (u === 1 && t !== 8 ? ' et ' : (u > 0 ? '-' : ' '));
        if (u > 0 && t !== 7 && t !== 9) words += (t === 0 && u === 1 ? 'un ' : units[u] + ' ');
      }
    }
    return words.trim();
  }

  const intPart = Math.floor(n);
  const fracPart = Math.round((n - intPart) * 100);
  
  let result = '';
  if (intPart > 0) {
    if (intPart >= 1000) {
      const th = Math.floor(intPart / 1000);
      if (th === 1) result += 'mille ';
      else result += convertBelow1000(th) + ' mille ';
    }
    const rem = intPart % 1000;
    if (rem > 0) result += convertBelow1000(rem);
    
    result = result.trim() + (intPart > 1 ? ' dirhams' : ' dirham');
  } else {
    result = 'zéro dirham';
  }
  
  if (fracPart > 0) {
    result += ' et ' + convertBelow1000(fracPart) + (fracPart > 1 ? ' centimes' : ' centime');
  }
  
  return result.replace(/\s+/g, ' ').trim();
}
