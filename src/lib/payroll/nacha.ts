// NACHA ACH file generator for payroll direct deposits.
// Implements the standard NACHA fixed-width format: every record is exactly
// 94 characters. Record sequence: 1 (file header) → 5 (batch header) →
// 6 (entry detail) per employee → 8 (batch control) → 9 (file control),
// padded with "9" records to a multiple of 10.

export interface AchEmployee {
  name: string; // max 22 chars
  routingNumber: string; // 9 digits (8 + check digit)
  accountNumber: string; // max 17 chars
  accountType: "checking" | "savings";
  amountCents: number; // integer cents
  employeeId: string; // max 15 chars
}

export interface AchCompany {
  name: string; // max 16 chars (batch header)
  companyId: string; // max 10 chars (typically EIN)
  originRouting: string; // 9-digit ODFI routing
  originName: string; // max 23 chars (file header)
  destinationName: string; // max 23 chars (usually bank name)
}

function padRight(s: string, len: number): string {
  const clean = String(s ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, len);
  return clean.padEnd(len, " ");
}

function padLeftZero(n: number | string, len: number): string {
  const digits = String(n).replace(/\D/g, "").slice(-len);
  return digits.padStart(len, "0");
}

function yymmdd(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function hhmm(d: Date): string {
  return String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
}

function assert94(line: string, label: string): string {
  if (line.length !== 94) throw new Error(`NACHA ${label}: expected 94 chars, got ${line.length}`);
  return line;
}

export function generateNachaFile(
  company: AchCompany,
  employees: AchEmployee[],
  effectiveDate: Date = new Date(),
): string {
  const now = new Date();
  const originRouting8 = company.originRouting.replace(/\D/g, "").slice(0, 8).padStart(8, "0");
  const batchNumber = 1;

  const lines: string[] = [];

  // --- File Header (1) ---
  lines.push(assert94(
    "1" +
    "01" +
    " " + padLeftZero(company.originRouting.replace(/\D/g, "").slice(0, 9), 9) +
    padRight(company.companyId, 10).slice(0, 9).padStart(9, " ").padEnd(10, " ").slice(0, 10) +
    yymmdd(now) +
    hhmm(now) +
    "A" +
    "094" +
    "10" +
    "1" +
    padRight(company.destinationName, 23) +
    padRight(company.originName, 23) +
    " ".repeat(8),
    "file header",
  ));

  // --- Batch Header (5) ---
  const effDate = yymmdd(effectiveDate);
  lines.push(assert94(
    "5" +
    "225" + // credits only
    padRight(company.name, 16) +
    " ".repeat(20) +
    padRight(company.companyId, 10) +
    "PPD" +
    padRight("PAYROLL", 10) +
    " ".repeat(6) +
    effDate +
    "   " +
    "1" +
    originRouting8 +
    padLeftZero(batchNumber, 7),
    "batch header",
  ));

  // --- Entry Detail (6) per employee ---
  let entryHash = 0;
  let totalCents = 0;
  employees.forEach((e, i) => {
    const routing9 = e.routingNumber.replace(/\D/g, "");
    if (routing9.length !== 9) throw new Error(`Invalid routing number for ${e.name}`);
    const rdfi8 = routing9.slice(0, 8);
    const checkDigit = routing9.slice(8, 9);
    entryHash += parseInt(rdfi8, 10);
    totalCents += Math.round(e.amountCents);
    const trace = originRouting8 + padLeftZero(i + 1, 7);
    lines.push(assert94(
      "6" +
      (e.accountType === "savings" ? "32" : "22") +
      rdfi8 +
      checkDigit +
      padRight(e.accountNumber, 17) +
      padLeftZero(Math.round(e.amountCents), 10) +
      padRight(e.employeeId, 15) +
      padRight(e.name, 22) +
      "  " +
      "0" +
      trace,
      `entry detail ${i}`,
    ));
  });

  const entryCount = employees.length;
  const hash10 = padLeftZero(entryHash % 10000000000, 10);

  // --- Batch Control (8) ---
  lines.push(assert94(
    "8" +
    "225" +
    padLeftZero(entryCount, 6) +
    hash10 +
    padLeftZero(0, 12) + // total debits
    padLeftZero(totalCents, 12) + // total credits
    padRight(company.companyId, 10) +
    " ".repeat(19) +
    " ".repeat(6) +
    originRouting8 +
    padLeftZero(batchNumber, 7),
    "batch control",
  ));

  // --- File Control (9) ---
  const blockCount = Math.ceil((lines.length + 1) / 10);
  lines.push(assert94(
    "9" +
    padLeftZero(1, 6) + // batch count
    padLeftZero(blockCount, 6) +
    padLeftZero(entryCount, 8) +
    hash10 +
    padLeftZero(0, 12) +
    padLeftZero(totalCents, 12) +
    " ".repeat(39),
    "file control",
  ));

  // Pad to multiple of 10 with "9" records
  while (lines.length % 10 !== 0) {
    lines.push("9".repeat(94));
  }

  return lines.join("\n") + "\n";
}
