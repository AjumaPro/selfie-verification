/**
 * Host attendance register export — PDF (jsPDF) and Word (.doc HTML).
 */
import { jsPDF } from 'jspdf';
import {
  ATTENDANCE_FILTERS,
  attendanceColumnDefs,
  attendanceRowCells,
  filterApprovedAttendance,
  meetingFileSlug,
  resolveAttendanceColumns,
} from './attendanceDownloadOptions';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function buildExportModel(meeting, attendance, options, filterKey) {
  const list = filterApprovedAttendance(attendance, filterKey);
  const columns = resolveAttendanceColumns(meeting, list, options);
  const defs = attendanceColumnDefs(columns);
  const headers = defs.map((d) => d.label);
  const rows = list.map((person, i) =>
    attendanceRowCells(person, i, columns)
  );
  const filterLabel =
    ATTENDANCE_FILTERS.find((f) => f.key === filterKey)?.label ||
    'All who approved to join';
  const { safeTitle, datePart } = meetingFileSlug(meeting);
  return {
    list,
    columns,
    defs,
    headers,
    rows,
    filterLabel,
    fileBase: `glico-attendance-${safeTitle}-${datePart}`,
    meetingTitle: String(meeting?.title || 'Untitled meeting'),
    meetingDate: String(meeting?.date || '—'),
    meetingTime: String(meeting?.time || '—'),
    location: String(meeting?.location || meeting?.googlePlace || ''),
  };
}

function wrapText(pdf, text, maxWidth) {
  const raw = String(text || '');
  if (!raw) return [''];
  return pdf.splitTextToSize(raw, maxWidth);
}

/**
 * @param {'pdf'|'word'} format
 */
export async function downloadAttendanceList(
  meeting,
  attendance,
  { options, filterKey = 'all', format = 'pdf' } = {}
) {
  const model = buildExportModel(meeting, attendance, options, filterKey);
  if (!model.defs.length) {
    throw new Error('Select at least one column to include.');
  }
  if (format === 'word') {
    downloadAttendanceWord(model);
    return { format: 'word', count: model.list.length };
  }
  downloadAttendancePdf(model);
  return { format: 'pdf', count: model.list.length };
}

export function downloadAttendancePdf(model) {
  const landscape = model.headers.length > 5;
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 10;
  const marginTop = 12;
  const marginBottom = 12;
  const usableWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const writeHeader = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(16, 48, 120);
    pdf.text('GLICO Pensions — Attendance list', marginX, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text(`Meeting: ${model.meetingTitle}`, marginX, y);
    y += 5;
    pdf.text(
      `Date: ${model.meetingDate}   Time: ${model.meetingTime}`,
      marginX,
      y
    );
    y += 5;
    if (model.location) {
      const locLines = wrapText(pdf, `Venue: ${model.location}`, usableWidth);
      locLines.forEach((line) => {
        pdf.text(line, marginX, y);
        y += 4.5;
      });
    }
    pdf.text(
      `Filter: ${model.filterLabel}   ·   People: ${model.list.length}`,
      marginX,
      y
    );
    y += 5;
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Generated ${new Date().toLocaleString()}`, marginX, y);
    y += 6;
    pdf.setDrawColor(208, 48, 56);
    pdf.setLineWidth(0.4);
    pdf.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  };

  writeHeader();

  const colCount = Math.max(model.headers.length, 1);
  const colWidth = usableWidth / colCount;
  const rowPad = 1.5;
  const fontSize = colCount > 7 ? 7 : 8;

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - marginBottom) return;
    pdf.addPage();
    y = marginTop;
    writeHeader();
  };

  const drawRow = (cells, isHeader) => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
    pdf.setTextColor(isHeader ? 16 : 30, isHeader ? 48 : 30, isHeader ? 120 : 30);

    const wrapped = cells.map((cell) =>
      wrapText(pdf, cell, Math.max(colWidth - 2, 8))
    );
    const lineCount = Math.max(1, ...wrapped.map((w) => w.length));
    const rowHeight = lineCount * 3.6 + rowPad * 2;
    ensureSpace(rowHeight + 1);

    if (isHeader) {
      pdf.setFillColor(240, 244, 250);
      pdf.rect(marginX, y - 1, usableWidth, rowHeight, 'F');
    }

    wrapped.forEach((lines, colIdx) => {
      const x = marginX + colIdx * colWidth + 1;
      lines.forEach((line, lineIdx) => {
        pdf.text(line, x, y + rowPad + 2.8 + lineIdx * 3.6);
      });
    });

    pdf.setDrawColor(210, 210, 210);
    pdf.setLineWidth(0.15);
    pdf.line(marginX, y + rowHeight, pageWidth - marginX, y + rowHeight);
    y += rowHeight;
  };

  drawRow(model.headers, true);

  if (!model.rows.length) {
    ensureSpace(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text('No attendants match this filter.', marginX, y + 4);
  } else {
    model.rows.forEach((row) => drawRow(row, false));
  }

  pdf.save(`${model.fileBase}.pdf`);
}

/** Microsoft Word–compatible HTML document (.doc). */
export function downloadAttendanceWord(model) {
  const rowsHtml = model.rows.length
    ? model.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td>${escapeHtml(cell)}</td>`)
              .join('')}</tr>`
        )
        .join('')
    : `<tr><td colspan="${Math.max(
        model.headers.length,
        1
      )}">No attendants match this filter.</td></tr>`;

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.meetingTitle)} — Attendance</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; }
  h1 { font-size: 16pt; color: #103078; margin: 0 0 8pt; }
  .meta { margin: 0 0 4pt; }
  .brand { color: #d03038; font-weight: bold; margin-bottom: 6pt; }
  table { border-collapse: collapse; width: 100%; margin-top: 12pt; }
  th, td { border: 1px solid #555; padding: 6pt; vertical-align: top; text-align: left; }
  th { background: #f0f4fa; color: #103078; }
</style>
</head>
<body>
  <p class="brand">GLICO Pensions</p>
  <h1>Attendance list</h1>
  <p class="meta"><strong>Meeting:</strong> ${escapeHtml(model.meetingTitle)}</p>
  <p class="meta"><strong>Date:</strong> ${escapeHtml(
    model.meetingDate
  )} &nbsp; <strong>Time:</strong> ${escapeHtml(model.meetingTime)}</p>
  ${
    model.location
      ? `<p class="meta"><strong>Venue:</strong> ${escapeHtml(
          model.location
        )}</p>`
      : ''
  }
  <p class="meta"><strong>Filter:</strong> ${escapeHtml(
    model.filterLabel
  )} &nbsp; · &nbsp; <strong>People:</strong> ${model.list.length}</p>
  <p class="meta"><strong>Generated:</strong> ${escapeHtml(
    new Date().toLocaleString()
  )}</p>
  <table>
    <thead>
      <tr>${model.headers
        .map((h) => `<th>${escapeHtml(h)}</th>`)
        .join('')}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([`\ufeff${html}`], {
    type: 'application/msword;charset=utf-8',
  });
  triggerDownload(blob, `${model.fileBase}.doc`);
}
