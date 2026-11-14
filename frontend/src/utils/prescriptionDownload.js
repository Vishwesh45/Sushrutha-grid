/**
 * Branded Sushrutha Grid digital prescription — HTML preview + real PDF download.
 * Hospital name/address come from the visit's hospital tenant on the Rx payload.
 */

const BRAND_SEAL_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="56" fill="none" stroke="#0f766e" stroke-width="3"/>
  <circle cx="60" cy="60" r="48" fill="none" stroke="#0f766e" stroke-width="1.5"/>
  <path d="M60 28 L68 52 L94 52 L72 68 L80 92 L60 76 L40 92 L48 68 L26 52 L52 52 Z" fill="#0f766e" opacity="0.9"/>
  <text x="60" y="108" text-anchor="middle" font-family="Georgia, serif" font-size="7" fill="#0f766e" font-weight="700">SUSHRUTHA GRID</text>
</svg>
`);

export function buildPrescriptionHtml(rx) {
  if (!rx) return '';
  const meds = (rx.medications || [])
    .map(
      (m) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">${esc(m.medicine_name)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(m.dosage)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(m.frequency)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(m.timing || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(m.duration)}</td>
    </tr>`
    )
    .join('');

  const issued = formatStamp(rx.issued_at);
  const inv = (rx.investigations_advised || []).join(', ');
  const hospitalName = rx.hospital_name || 'Sushrutha Grid Hospital';
  const hospitalAddress = rx.hospital_address || '';
  const hospitalPhone = rx.hospital_phone || '';
  const sealUrl = `data:image/svg+xml;charset=utf-8,${BRAND_SEAL_SVG}`;
  const signature = rx.digital_signature
    || `Digitally signed by ${rx.doctor_name || 'Medical Officer'} via Sushrutha Grid`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(rx.prescription_id || 'Prescription')}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; margin: 20px; line-height: 1.45; }
    .sheet { border: 2px solid #0f172a; padding: 22px; position: relative; }
    .letterhead { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 14px; }
    .muted { color: #64748b; font-size: 12px; }
    h1 { font-size: 20px; margin: 4px 0 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    th { text-align: left; background: #f1f5f9; padding: 8px; }
    .badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 2px 10px; font-weight: 700; border-radius: 4px; }
    .seal { width: 88px; height: 88px; flex-shrink: 0; }
    .sign-block { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
    .sign-line { border-top: 1px solid #94a3b8; padding-top: 6px; min-width: 220px; text-align: right; }
    .digital { font-family: 'Segoe Script', 'Brush Script MT', cursive; color: #0f766e; font-size: 18px; }
    @media print { body { margin: 8mm; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="sheet" id="rx-sheet">
    <div class="letterhead">
      <div>
        <div class="muted">Government of Karnataka · Health &amp; Family Welfare · Sushrutha Grid Digital OPD</div>
        <h1>${esc(hospitalName)}</h1>
        <div class="muted">${esc(hospitalAddress)}</div>
        ${hospitalPhone ? `<div class="muted">Phone: ${esc(hospitalPhone)}</div>` : ''}
        ${rx.hospital_locality ? `<div class="muted">${esc(rx.hospital_locality)}</div>` : ''}
        <p style="margin:10px 0 0"><span class="badge">${esc(rx.prescription_id || 'Rx')}</span>
          <span class="muted" style="margin-left:8px">${esc(issued)}</span></p>
      </div>
      <img class="seal" src="${sealUrl}" alt="Sushrutha Grid official seal" />
    </div>
    <p><strong>Patient:</strong> ${esc(rx.patient_name)}
      ${rx.patient_uhid ? ` · UHID ${esc(rx.patient_uhid)}` : ''}
      · Token <strong>${esc(rx.token_number || '—')}</strong></p>
    <p><strong>Doctor:</strong> ${esc(rx.doctor_name)}
      ${rx.doctor_qualification ? ` · ${esc(rx.doctor_qualification)}` : ''}
      · ${esc(rx.department || '')}
      ${rx.room_number ? ` (${esc(rx.room_number)})` : ''}
      ${rx.doctor_registration_no ? `<br/><span class="muted">Reg. No: ${esc(rx.doctor_registration_no)}</span>` : ''}
    </p>
    <h2 style="font-size:15px;margin:16px 0 6px">Diagnosis</h2>
    <p>${esc(rx.clinical_diagnosis || '—')}
      ${rx.icd10_code ? ` (ICD-10: ${esc(rx.icd10_code)})` : ''}</p>
    ${rx.clinical_notes ? `<p class="muted">“${esc(rx.clinical_notes)}”</p>` : ''}
    <h2 style="font-size:15px;margin:16px 0 6px">Medications</h2>
    <table>
      <thead><tr>
        <th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Timing</th><th>Duration</th>
      </tr></thead>
      <tbody>${meds || '<tr><td colspan="5" style="padding:8px">No medicines listed</td></tr>'}</tbody>
    </table>
    ${inv ? `<p style="margin-top:12px"><strong>Investigations:</strong> ${esc(inv)}</p>` : ''}
    ${rx.diet_lifestyle_advice ? `<p><strong>Advice:</strong> ${esc(rx.diet_lifestyle_advice)}</p>` : ''}
    ${rx.follow_up_date ? `<p><strong>Follow-up:</strong> ${esc(rx.follow_up_date)}</p>` : ''}
    <div class="sign-block">
      <img class="seal" src="${sealUrl}" alt="seal" style="width:72px;height:72px;opacity:0.85" />
      <div class="sign-line">
        <div class="digital">${esc(rx.doctor_name || 'Medical Officer')}</div>
        <div class="muted">${esc(signature)}</div>
        <div class="muted">Sushrutha Grid brand seal — common across all grid hospitals</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStamp(dateStr) {
  if (!dateStr) return '—';
  const utcStr = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
  const d = new Date(utcStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/** Trigger a file download of the prescription HTML (fallback). */
export function downloadPrescriptionFile(rx) {
  if (!rx) return false;
  const html = buildPrescriptionHtml(rx);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const id = (rx.prescription_id || 'prescription').replace(/[^\w.-]+/g, '_');
  a.href = url;
  a.download = `${id}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function openPrescriptionInNewTab(rx) {
  if (!rx) return false;
  const html = buildPrescriptionHtml(rx);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Real PDF download using html2canvas + jsPDF. */
export async function downloadPrescriptionPdf(rx) {
  if (!rx) return false;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = buildPrescriptionHtml(rx);
  document.body.appendChild(host);
  const sheet = host.querySelector('#rx-sheet') || host;

  try {
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableW = pageW - margin * 2;
    const imgH = (canvas.height * usableW) / canvas.width;
    let y = margin;
    let remaining = imgH;
    let srcY = 0;
    const pageImgH = pageH - margin * 2;

    // Single page if it fits; otherwise slice vertically
    if (imgH <= pageImgH) {
      pdf.addImage(img, 'PNG', margin, margin, usableW, imgH);
    } else {
      const ratio = usableW / canvas.width;
      while (remaining > 0) {
        const sliceHpx = Math.min(pageImgH / ratio, canvas.height - srcY);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHpx;
        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
        const sliceImg = sliceCanvas.toDataURL('image/png');
        const sliceHmm = sliceHpx * ratio;
        if (srcY > 0) pdf.addPage();
        pdf.addImage(sliceImg, 'PNG', margin, margin, usableW, sliceHmm);
        srcY += sliceHpx;
        remaining -= sliceHmm;
        y += sliceHmm;
      }
    }

    const id = (rx.prescription_id || 'prescription').replace(/[^\w.-]+/g, '_');
    pdf.save(`${id}.pdf`);
    return true;
  } finally {
    host.remove();
  }
}
