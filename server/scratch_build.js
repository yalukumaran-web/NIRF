'use strict';
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { parsePdf } = require('./dist/services/pdfParser.js');

const RESULTS_JSON = 'C:/Users/LAKSHMI YALINI K/.gemini/antigravity-ide/brain/e6addc0f-2ef8-4e03-b234-880bf3a8166e/scratch/complete_100_results.json';
const PDFS_DIR = path.join(__dirname, 'nirf_pdfs');
const OUT_XLSX = path.join(__dirname, '..', 'new_comparison.xlsx');

const round2 = (v) => Math.round(v * 100) / 100;

function computeFsr(F, N) {
  if (!F || !N || F <= 0 || N <= 0) return 'Unable';
  const ratio = (15 * F) / N;
  return round2(Math.min(30 * ratio, 30));
}

function computeFqe(F, fPhD, e1, e2, e3) {
  if (!F || F <= 0) return 'Unable';
  let fq = null;
  if (typeof fPhD === 'number' && fPhD >= 0) {
    const phdPct = fPhD / F;
    fq = phdPct >= 0.95 ? 10 : 10 * (phdPct / 0.95);
  }
  let fe = null;
  if (typeof e1 === 'number' && typeof e2 === 'number' && typeof e3 === 'number') {
    const total = e1 + e2 + e3;
    if (total > 0) {
      const f1 = e1 / F, f2 = e2 / F, f3 = e3 / F;
      const t1 = Math.min(3 * f1, 1), t2 = Math.min(3 * f2, 1), t3 = Math.min(3 * f3, 1);
      fe = 3 * t1 + 3 * t2 + 4 * t3;
    } else { fe = 0; }
  }
  if (fq === null && fe === null) return 'Unable';
  return round2(Math.min((fq ?? 0) + (fe ?? 0), 20));
}

const NAVY = 'FF1F2D4E', WHITE = 'FFFFFFFF', ODD = 'FFEDF2FA', EVN = 'FFFFFFFF';

function applyHdr(cell, text) {
  cell.value = text;
  cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  cell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

function applyDataCell(cell, value, isOdd) {
  const bg = isOdd ? ODD : EVN;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
  if (typeof value === 'number') {
    cell.value = round2(value);
    cell.numFmt = '0.00';
  } else {
    cell.value = value;
  }
}

async function main() {
  console.log('Reading complete_100_results.json...');
  const data = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));
  console.log('Loaded', data.length, 'institutes.');

  const SUBS = [
    { key: 'fsr', label: 'FSR Faculty-Student Ratio', max: 30 },
    { key: 'gue', label: 'GUE Graduation in Stipulated Time', max: 15 },
    { key: 'pcs', label: 'PCS Physically Challenged Facilities', max: 20 },
    { key: 'fqe', label: 'FQE Faculty Quality & Experience', max: 20 },
    { key: 'wd', label: 'WD Women Diversity', max: 30 },
    { key: 'rd', label: 'RD Region Diversity', max: 30 },
  ];

  console.log('\nExtracting PDF data for FSR & FQE...');
  const computed = {};
  let fsrCount = 0, fqeCount = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const pdfPath = path.join(PDFS_DIR, item.instituteId + '.pdf');
    const entry = { fsrPred: 'Unable', fqePred: 'Unable', fsrDetail: 'PDF not found', fqeDetail: 'PDF not found' };

    if (fs.existsSync(pdfPath)) {
      try {
        const parsed = await parsePdf(pdfPath);
        const ex = parsed.extracted;
        const F = ex.permanentFaculty ?? null;
        const NT = ex.enrolledStudents ?? null;
        const Np = ex.phdStudents ?? 0;
        const N = NT !== null ? NT + Np : null;
        const fPhD = ex.facultyWithPhD ?? null;
        const e1 = ex.facultyExp0to8 ?? null;
        const e2 = ex.facultyExp8to15 ?? null;
        const e3 = ex.facultyExp15plus ?? null;

        entry.fsrPred = computeFsr(F, N);
        entry.fsrDetail = F && N ? 'F=' + F + ', N=NT(' + NT + ')+Np(' + Np + ')=' + N + ' => FSR=' + entry.fsrPred : 'Missing F or N';
        if (entry.fsrPred !== 'Unable') fsrCount++;

        entry.fqePred = computeFqe(F, fPhD, e1, e2, e3);
        entry.fqeDetail = entry.fqePred !== 'Unable'
          ? 'F=' + F + ', PhD=' + fPhD + ', exp0-8=' + e1 + ', exp8-15=' + e2 + ', exp15+=' + e3
          : 'fPhD=' + fPhD + ', e1=' + e1 + ', e2=' + e2 + ', e3=' + e3 + ' (unable to compute)';
        if (entry.fqePred !== 'Unable') fqeCount++;
      } catch (err) {
        entry.fsrDetail = 'PDF error: ' + err.message;
        entry.fqeDetail = 'PDF error: ' + err.message;
      }
    }
    computed[item.instituteId] = entry;
    process.stdout.write('  [' + (i+1) + '/100] ' + item.instituteId + ': FSR=' + entry.fsrPred + ', FQE=' + entry.fqePred + '\n');
  }

  console.log('\nFSR computed for', fsrCount, '/ FQE computed for', fqeCount);

  console.log('\nBuilding Excel...');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NIRF Comparison Tool';
  wb.created = new Date();

  const ws = wb.addWorksheet('Comparison', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 38;
  for (let c = 3; c <= 20; c++) ws.getColumn(c).width = 12;
  ws.getColumn(21).width = 55;

  ws.getRow(1).height = 50;
  ws.getRow(2).height = 50;

  applyHdr(ws.getCell(1, 1), 'Rank');
  ws.mergeCells(1, 1, 2, 1);
  applyHdr(ws.getCell(1, 2), 'College Name');
  ws.mergeCells(1, 2, 2, 2);

  SUBS.forEach((sub, si) => {
    const c = 3 + si * 3;
    applyHdr(ws.getCell(1, c), sub.label);
    ws.mergeCells(1, c, 1, c + 2);
  });

  applyHdr(ws.getCell(1, 21), 'Notes');
  ws.mergeCells(1, 21, 2, 21);

  SUBS.forEach((sub, si) => {
    const c = 3 + si * 3;
    applyHdr(ws.getCell(2, c),     'actual_data_by_NIRF(2025)\n(score /' + sub.max + ')');
    applyHdr(ws.getCell(2, c + 1), 'value_by_my_prediction_model\n(score /' + sub.max + ')');
    applyHdr(ws.getCell(2, c + 2), 'delta');
  });

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const isOdd = i % 2 === 0;
    const r = i + 3;
    const comp = computed[item.instituteId] || { fsrPred: 'Unable', fqePred: 'Unable' };
    const pred = { ...item.predictionScores, fsr: comp.fsrPred, fqe: comp.fqePred };

    const rankCell = ws.getCell(r, 1);
    rankCell.value = item.rank;
    rankCell.font = { bold: true, size: 10 };
    rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? ODD : EVN } };
    rankCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const nameCell = ws.getCell(r, 2);
    nameCell.value = item.name;
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? ODD : EVN } };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    nameCell.font = { size: 10 };

    SUBS.forEach((sub, si) => {
      const c = 3 + si * 3;
      const actual = item.actualScores[sub.key];
      const pVal = pred[sub.key];
      let delta = typeof actual === 'number' && typeof pVal === 'number' ? round2(actual - pVal) : 'N/A';

      applyDataCell(ws.getCell(r, c),     actual, isOdd);
      applyDataCell(ws.getCell(r, c + 1), pVal,   isOdd);
      applyDataCell(ws.getCell(r, c + 2), delta,  isOdd);

      if (typeof delta === 'number') {
        ws.getCell(r, c + 2).font = {
          color: { argb: delta > 0.01 ? 'FF27AE60' : delta < -0.01 ? 'FFC0392B' : 'FF000000' },
          bold: Math.abs(delta) >= 2,
          size: 10,
        };
      }
    });

    const noteParts = [];
    if (pred.fsr === 'Unable') noteParts.push('FSR: unable (only summary faculty count in PDF, no roster)');
    if (pred.fqe === 'Unable') noteParts.push('FQE: unable (PhD/exp bands unavailable in PDF)');
    const noteCell = ws.getCell(r, 21);
    noteCell.value = noteParts.join('; ');
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? ODD : EVN } };
    noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    noteCell.font = { italic: true, size: 9 };

    ws.getRow(r).height = 22;
  }

  const ws2 = wb.addWorksheet('Summary & Notes');
  ws2.getColumn(1).width = 32; ws2.getColumn(2).width = 72;
  const noteRows = [
    ['File', 'new_comparison.xlsx — NIRF 2025 Engineering Top 100'],
    ['Generated', new Date().toLocaleString()],
    ['Actual scores source', 'Official NIRF 2025 graphs (OCR via Tesseract.js+Jimp)'],
    ['GUE/PCS/WD/RD predicted', 'API /absolute/score with DCS PDF via existing engine'],
    ['FSR predicted formula', 'FSR = 30 x min(15 x F/N, 1); F=permanentFaculty, N=enrolledStudents+phdStudents'],
    ['FQE predicted formula', 'FQE = FQ+FE; FQ=10xmin(phdFaculty/F/0.95,1); FE=3xmin(3e1/F,1)+3xmin(3e2/F,1)+4xmin(3e3/F,1)'],
    ['FSR note', 'All 100 DCS PDFs lack row-level faculty roster; "Number of faculty members entered" summary used for F'],
    ['FQE note', 'facultyWithPhD & exp bands derived from DCS summary by nirfExtractor; if missing = Unable'],
    ['Delta', 'delta = actual_NIRF - predicted_model. Positive = NIRF awarded more. N/A when either is Unable.'],
    ['Codebase', 'Zero server/ or client/ files modified. Built by standalone scratch script only.'],
  ];
  noteRows.forEach(([k, v], i) => {
    ws2.getRow(i + 1).getCell(1).value = k;
    ws2.getRow(i + 1).getCell(1).font = { bold: true };
    ws2.getRow(i + 1).getCell(2).value = v;
    ws2.getRow(i + 1).height = 18;
  });

  const ws3 = wb.addWorksheet('FSR & FQE Details');
  [6, 36, 12, 12, 55, 55].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });
  ['Rank','College Name','FSR_pred','FQE_pred','FSR computation','FQE computation'].forEach((t, ci) => {
    applyHdr(ws3.getCell(1, ci + 1), t);
  });
  ws3.getRow(1).height = 28;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const comp = computed[item.instituteId] || {};
    const r = ws3.getRow(i + 2);
    r.getCell(1).value = item.rank;
    r.getCell(2).value = item.name;
    r.getCell(3).value = comp.fsrPred ?? 'Unable';
    r.getCell(4).value = comp.fqePred ?? 'Unable';
    r.getCell(5).value = comp.fsrDetail ?? '';
    r.getCell(6).value = comp.fqeDetail ?? '';
    r.height = 18;
    r.getCell(5).alignment = { wrapText: true };
    r.getCell(6).alignment = { wrapText: true };
  }

  await wb.xlsx.writeFile(OUT_XLSX);
  console.log('\nSaved:', OUT_XLSX);
  console.log(data.length, 'rows written.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
