import React, { useRef, useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaFilePdf, FaImage, FaSpinner } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getCodeMessage } from '../services/thirdPartyVerification';
import './VerificationResultCard.css';

const labelize = (key) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const isVerified = (payload) => {
  const v = payload?.data?.verified ?? payload?.verified;
  return v === 'TRUE' || v === true || v === 'true';
};

const getPayload = (apiResult) => apiResult?.data || apiResult || {};

const Field = ({ label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="vrc-field">
      <span className="vrc-label">{label}</span>
      <span className="vrc-value">{String(value)}</span>
    </div>
  );
};

const AddressCard = ({ address, index }) => {
  if (!address || typeof address !== 'object') return null;
  const gps = address.gpsAddressDetails || {};
  return (
    <div className="vrc-address">
      <h5>{address.type || `Address ${index + 1}`}</h5>
      <Field label="Community" value={address.community} />
      <Field label="Town" value={address.town} />
      <Field label="District" value={address.districtName} />
      <Field label="Region" value={address.region} />
      <Field label="Country" value={address.countryName} />
      <Field label="Postal code" value={address.postalCode} />
      <Field label="Digital address" value={address.addressDigital || gps.gpsName} />
      {(gps.latitude || gps.longitude) && (
        <Field
          label="GPS"
          value={`${gps.latitude || '—'}, ${gps.longitude || '—'}`}
        />
      )}
    </div>
  );
};

const buildFileBaseName = (person, payload) => {
  const name = [person.forenames, person.surname].filter(Boolean).join('-') || 'verification';
  const id = person.nationalId || payload.transactionGuid || 'result';
  const safe = `${name}_${id}`.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 80);
  return `selfie-result_${safe}`;
};

/**
 * Human-readable API verification result with PDF / image download.
 */
const VerificationResultCard = ({ apiResult, title = 'Verification Result' }) => {
  const exportRef = useRef(null);
  const [exporting, setExporting] = useState(null); // 'pdf' | 'image' | null

  if (!apiResult) return null;

  const payload = getPayload(apiResult);
  const person = payload.person || {};
  const verified = isVerified(apiResult);
  const code = payload.code || apiResult.code;
  const phones = person.contact?.phoneNumbers || [];
  const addresses = Array.isArray(person.addresses) ? person.addresses : [];
  const fullName = [person.forenames, person.surname].filter(Boolean).join(' ');
  const fileBase = buildFileBaseName(person, payload);

  const captureCanvas = async () => {
    const node = exportRef.current;
    if (!node) throw new Error('Nothing to export');
    return html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      // Hide elements marked for exclusion
      ignoreElements: (el) => el.classList?.contains('vrc-no-export'),
    });
  };

  const downloadImage = async () => {
    setExporting('image');
    try {
      const canvas = await captureCanvas();
      const link = document.createElement('a');
      link.download = `${fileBase}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save image');
    } finally {
      setExporting(null);
    }
  };

  const downloadPdf = async () => {
    setExporting('pdf');
    try {
      const canvas = await captureCanvas();
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= usableHeight;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= usableHeight;
      }

      pdf.save(`${fileBase}.pdf`);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save PDF');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className={`vrc-card ${verified ? 'vrc-success' : 'vrc-error'}`}>
      <div className="vrc-toolbar vrc-no-export">
        <button
          type="button"
          className="vrc-download-btn"
          onClick={downloadPdf}
          disabled={!!exporting}
        >
          {exporting === 'pdf' ? <FaSpinner className="spin" /> : <FaFilePdf />}
          {exporting === 'pdf' ? 'Saving PDF…' : 'Save as PDF'}
        </button>
        <button
          type="button"
          className="vrc-download-btn secondary"
          onClick={downloadImage}
          disabled={!!exporting}
        >
          {exporting === 'image' ? <FaSpinner className="spin" /> : <FaImage />}
          {exporting === 'image' ? 'Saving image…' : 'Save as Image'}
        </button>
      </div>

      <div className="vrc-export-root" ref={exportRef}>
        <div className="vrc-status">
          {verified ? (
            <FaCheckCircle className="vrc-status-icon" />
          ) : (
            <FaTimesCircle className="vrc-status-icon" />
          )}
          <div>
            <h3>{title}</h3>
            <p className="vrc-status-text">
              {verified ? 'Verified' : 'Not verified'}
              {code ? ` · ${getCodeMessage(code)}` : ''}
            </p>
            <p className="vrc-export-meta">
              Saved {new Date().toLocaleString()}
            </p>
          </div>
        </div>

        {(fullName || person.nationalId) && (
          <section className="vrc-section">
            <h4>Personal information</h4>
            <div className="vrc-grid">
              <Field label="Full name" value={fullName} />
              <Field label="Ghana Card (National ID)" value={person.nationalId} />
              <Field label="Card ID" value={person.cardId} />
              <Field label="Gender" value={person.gender} />
              <Field label="Date of birth" value={person.birthDate} />
              <Field label="Nationality" value={person.nationality} />
              <Field label="Card valid from" value={person.cardValidFrom} />
              <Field label="Card valid to" value={person.cardValidTo} />
            </div>
          </section>
        )}

        {addresses.length > 0 && (
          <section className="vrc-section">
            <h4>Addresses</h4>
            <div className="vrc-addresses">
              {addresses.map((addr, i) => (
                <AddressCard key={i} address={addr} index={i} />
              ))}
            </div>
          </section>
        )}

        {(person.contact || phones.length > 0) && (
          <section className="vrc-section">
            <h4>Contact</h4>
            <div className="vrc-grid">
              <Field label="Email" value={person.contact?.email} />
              {phones.map((phone, i) => (
                <Field
                  key={i}
                  label={phone.type || `Phone ${i + 1}`}
                  value={phone.number || phone.phoneNumber || phone.value}
                />
              ))}
            </div>
          </section>
        )}

        <section className="vrc-section">
          <h4>Transaction</h4>
          <div className="vrc-grid">
            <Field label="User ID" value={payload.userID || payload.userId} />
            <Field label="Center" value={payload.center} />
            <Field label="Source" value={payload.source} />
            <Field label="Transaction GUID" value={payload.transactionGuid} />
            <Field label="Request time" value={payload.requestTimestamp} />
            <Field label="Response time" value={payload.responseTimestamp} />
          </div>
        </section>

        {Object.keys(person).length > 0 && (
          <section className="vrc-section vrc-extra vrc-no-export">
            <details>
              <summary>Other person fields</summary>
              <div className="vrc-grid">
                {Object.entries(person)
                  .filter(
                    ([key]) =>
                      ![
                        'nationalId',
                        'cardId',
                        'cardValidFrom',
                        'cardValidTo',
                        'surname',
                        'forenames',
                        'nationality',
                        'birthDate',
                        'gender',
                        'addresses',
                        'contact',
                      ].includes(key)
                  )
                  .map(([key, value]) =>
                    typeof value === 'object' ? null : (
                      <Field key={key} label={labelize(key)} value={value} />
                    )
                  )}
              </div>
            </details>
          </section>
        )}
      </div>

      <details className="vrc-raw vrc-no-export">
        <summary>View raw API response</summary>
        <pre>{JSON.stringify(apiResult, null, 2)}</pre>
      </details>
    </div>
  );
};

export default VerificationResultCard;
