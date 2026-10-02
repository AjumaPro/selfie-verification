import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaFileAlt,
  FaPlus,
  FaPrint,
  FaTrash,
  FaIdCard,
  FaSync,
} from 'react-icons/fa';
import GlicoLifeLogo from './GlicoLifeLogo';
import {
  deleteMembershipForm,
  fetchMembershipForm,
  listMembershipForms,
  submitMembershipForm,
} from '../services/membershipApi';
import { fetchVerifyDashboard } from '../services/verifyApi';
import { compressImageFile } from '../utils/compressImage';
import './MembershipForm.css';

const GHANA_REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
];

const UNIONS = ['GNAT', 'NAGRAT', 'CCT-GH', 'TEWU', 'OTHER'];

const emptyBeneficiary = () => ({
  name: '',
  birthDate: '',
  relationship: '',
  contact: '',
  percent: '',
});

function normalizeGender(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw.startsWith('F')) return 'FEMALE';
  if (raw.startsWith('M')) return 'MALE';
  return '';
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (raw.length >= 10) return raw.slice(0, 10);
  return '';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    staffId: '',
    schoolName: '',
    districtRegion: '',
    unionAffiliation: '',
    dateOfEmployment: '',
    firstDeduction: '',
    surname: '',
    firstName: '',
    otherNames: '',
    dateOfBirth: '',
    gender: '',
    birthTown: '',
    birthRegion: '',
    birthCountry: 'GHANA',
    ghanaCard: '',
    residentialAddress: '',
    postalAddress: '',
    email: '',
    mobile: '',
    contributionRate: '',
    contributionOther: '',
    basicSalary: '',
    ssnitNumber: '',
    beneficiaries: [emptyBeneficiary(), emptyBeneficiary(), emptyBeneficiary()],
    declarationDate: todayIso(),
    photoData: '',
    signatureData: '',
  };
}

function fullName(form) {
  return [form.surname, form.firstName, form.otherNames]
    .filter(Boolean)
    .join(' ');
}

function allocationTotal(beneficiaries) {
  return (beneficiaries || []).reduce(
    (sum, row) => sum + (Number(row.percent) || 0),
    0
  );
}

function SignaturePad({ value, onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const loaded = useRef('');

  const point = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = event.touches ? event.touches[0] : event;
    return {
      x: ((src.clientX - rect.left) * canvas.width) / rect.width,
      y: ((src.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const start = (event) => {
    if (disabled) return;
    event.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event) => {
    if (!drawing.current || disabled) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const next = canvasRef.current.toDataURL('image/png');
    loaded.current = next;
    onChange(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#103078';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!value) {
      if (loaded.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        loaded.current = '';
      }
      return;
    }
    if (value === loaded.current) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      loaded.current = value;
    };
    img.src = value;
  }, [value]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    loaded.current = '';
    onChange('');
  };

  return (
    <div className="tpfs-sign">
      <canvas
        ref={canvasRef}
        width={560}
        height={140}
        className="tpfs-sign-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      {!disabled && (
        <button type="button" className="tpfs-link-btn" onClick={clear}>
          Clear signature
        </button>
      )}
    </div>
  );
}

const MembershipForm = () => {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saved, setSaved] = useState([]);
  const [scope, setScope] = useState('mine');
  const [viewing, setViewing] = useState(false);
  const photoInputRef = useRef(null);

  const total = useMemo(
    () => allocationTotal(form.beneficiaries),
    [form.beneficiaries]
  );

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setUpper = (key, value) => {
    setField(key, String(value || '').toUpperCase());
  };

  const loadList = useCallback(async () => {
    try {
      const data = await listMembershipForms();
      setSaved(data.forms || []);
      setScope(data.scope || 'mine');
    } catch (err) {
      setError(err.message || 'Could not load saved forms.');
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const onPhoto = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const data = await compressImageFile(file);
      setField('photoData', data);
    } catch (err) {
      setError(err.message || 'Could not attach passport picture.');
    }
  };

  const fillFromKyc = async () => {
    setError('');
    try {
      const data = await fetchVerifyDashboard({ status: 'approved', limit: 1 });
      const row = (data.results || [])[0];
      if (!row) {
        setError('No approved Ghana Card check found to copy from.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        surname: String(row.surname || '').toUpperCase(),
        firstName: String(row.forenames || '').toUpperCase(),
        dateOfBirth:
          normalizeDate(row.birthDate) || prev.dateOfBirth,
        gender: normalizeGender(row.gender) || prev.gender,
        ghanaCard: String(row.ghanaCard || row.nationalId || '').toUpperCase(),
      }));
      setInfo('Personal details filled from the latest approved Ghana Card check.');
    } catch (err) {
      setError(err.message || 'Could not load KYC details.');
    }
  };

  const updateBeneficiary = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.beneficiaries];
      next[index] = {
        ...next[index],
        [key]: key === 'percent' ? value : String(value || '').toUpperCase(),
      };
      return { ...prev, beneficiaries: next };
    });
  };

  const addBeneficiary = () => {
    setForm((prev) => ({
      ...prev,
      beneficiaries: [...prev.beneficiaries, emptyBeneficiary()].slice(0, 8),
    }));
  };

  const removeBeneficiary = (index) => {
    setForm((prev) => ({
      ...prev,
      beneficiaries:
        prev.beneficiaries.length <= 1
          ? prev.beneficiaries
          : prev.beneficiaries.filter((_, i) => i !== index),
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (Math.round(total) !== 100) {
      setError('Beneficiary allocation must total 100%.');
      return;
    }
    if (!form.photoData) {
      setError('Passport picture is required.');
      return;
    }
    if (!form.signatureData) {
      setError('Signature or thumb print is required.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        beneficiaries: form.beneficiaries.filter((row) => String(row.name || '').trim()),
      };
      const result = await submitMembershipForm(payload);
      setInfo(result.message || 'Membership registration saved.');
      setForm(emptyForm());
      setViewing(false);
      await loadList();
    } catch (err) {
      setError(err.message || 'Could not save the form.');
    } finally {
      setBusy(false);
    }
  };

  const openSaved = async (id) => {
    setError('');
    setBusy(true);
    try {
      const data = await fetchMembershipForm(id);
      const next = data.form || {};
      setForm({
        ...emptyForm(),
        ...next,
        beneficiaries:
          next.beneficiaries && next.beneficiaries.length
            ? next.beneficiaries
            : [emptyBeneficiary()],
      });
      setViewing(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Could not open that form.');
    } finally {
      setBusy(false);
    }
  };

  const dropSaved = async (row) => {
    const name = fullName(row) || row.staffId || 'this form';
    if (!window.confirm(`Delete membership form for ${name}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteMembershipForm(row.id);
      setSaved((list) => list.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err.message || 'Could not delete the form.');
    }
  };

  const startNew = () => {
    setForm(emptyForm());
    setViewing(false);
    setError('');
    setInfo('');
  };

  const rate = form.contributionRate;

  return (
    <section className="tpfs" aria-label="TPFS membership registration">
      <form className="tpfs-sheet" onSubmit={onSubmit}>
        <header className="tpfs-head">
          <div className="tpfs-head-brand">
            <GlicoLifeLogo markClassName="tpfs-logo" />
            <div>
              <p className="tpfs-kicker">GLICO Pensions Trustee Ltd</p>
              <h2>Teachers’ Provident Fund Scheme (Tier-3)</h2>
              <p className="tpfs-meta">
                P.O. Box 4251, Accra · Tel: +233 302 246140/2 or +233 20 2222113
                <br />
                E-mail: Info@glicopensions.com
              </p>
            </div>
          </div>
          <div className="tpfs-photo-box">
            {form.photoData ? (
              <img src={form.photoData} alt="Passport" />
            ) : (
              <span>Passport picture</span>
            )}
            {!viewing && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onPhoto}
                />
                <button
                  type="button"
                  className="tpfs-photo-btn"
                  onClick={() => photoInputRef.current && photoInputRef.current.click()}
                >
                  {form.photoData ? 'Replace photo' : 'Upload photo'}
                </button>
              </>
            )}
            <p className="tpfs-photo-note">
              Write name, staff number and date of birth behind the photo
            </p>
          </div>
        </header>

        <div className="tpfs-title-row">
          <h3>Membership Registration Form</h3>
          <label className="tpfs-staff">
            Staff ID
            <input
              className="form-input"
              value={form.staffId}
              onChange={(e) => setUpper('staffId', e.target.value)}
              required
              disabled={viewing}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="tpfs-toolbar no-print">
          <button type="button" className="btn btn-secondary" onClick={fillFromKyc}>
            <FaIdCard aria-hidden /> Fill from last approved KYC
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <FaPrint aria-hidden /> Print / save PDF
          </button>
          {viewing && (
            <button type="button" className="btn btn-secondary" onClick={startNew}>
              New form
            </button>
          )}
        </div>

        <fieldset className="tpfs-part" disabled={viewing}>
          <legend>Part I — School / office (capital letters)</legend>
          <div className="tpfs-grid">
            <label className="span-2">
              Name of school/office
              <input
                className="form-input"
                value={form.schoolName}
                onChange={(e) => setUpper('schoolName', e.target.value)}
                required
              />
            </label>
            <label>
              District &amp; region
              <input
                className="form-input"
                value={form.districtRegion}
                onChange={(e) => setUpper('districtRegion', e.target.value)}
                required
              />
            </label>
            <label>
              Union affiliation
              <input
                className="form-input"
                list="tpfs-unions"
                value={form.unionAffiliation}
                onChange={(e) => setUpper('unionAffiliation', e.target.value)}
              />
              <datalist id="tpfs-unions">
                {UNIONS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
            <label>
              Date of employment
              <input
                className="form-input"
                type="date"
                value={form.dateOfEmployment}
                onChange={(e) => setField('dateOfEmployment', e.target.value)}
                required
              />
            </label>
            <label>
              First deduction
              <input
                className="form-input"
                type="date"
                value={form.firstDeduction}
                onChange={(e) => setField('firstDeduction', e.target.value)}
              />
            </label>
            <label>
              Basic salary
              <input
                className="form-input"
                inputMode="decimal"
                value={form.basicSalary}
                onChange={(e) => setField('basicSalary', e.target.value)}
              />
            </label>
            <label>
              SSNIT number
              <input
                className="form-input"
                value={form.ssnitNumber}
                onChange={(e) => setUpper('ssnitNumber', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="tpfs-part" disabled={viewing}>
          <legend>Part II — Member’s personal details (capital letters)</legend>
          <div className="tpfs-grid">
            <label>
              Surname
              <input
                className="form-input"
                value={form.surname}
                onChange={(e) => setUpper('surname', e.target.value)}
                required
              />
            </label>
            <label>
              First name
              <input
                className="form-input"
                value={form.firstName}
                onChange={(e) => setUpper('firstName', e.target.value)}
                required
              />
            </label>
            <label>
              Other name(s)
              <input
                className="form-input"
                value={form.otherNames}
                onChange={(e) => setUpper('otherNames', e.target.value)}
              />
            </label>
            <label>
              Date of birth
              <input
                className="form-input"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
                required
              />
            </label>
            <fieldset className="tpfs-inline">
              <legend>Gender</legend>
              {['Male', 'Female'].map((g) => (
                <label key={g} className="tpfs-check">
                  <input
                    type="radio"
                    name="tpfs-gender"
                    checked={form.gender === g.toUpperCase()}
                    onChange={() => setField('gender', g.toUpperCase())}
                    required
                  />
                  {g}
                </label>
              ))}
            </fieldset>
            <label>
              Place of birth — town
              <input
                className="form-input"
                value={form.birthTown}
                onChange={(e) => setUpper('birthTown', e.target.value)}
              />
            </label>
            <label>
              Region
              <select
                className="form-input"
                value={form.birthRegion}
                onChange={(e) => setUpper('birthRegion', e.target.value)}
              >
                <option value="">Select</option>
                {GHANA_REGIONS.map((r) => (
                  <option key={r} value={r.toUpperCase()}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Country
              <input
                className="form-input"
                value={form.birthCountry}
                onChange={(e) => setUpper('birthCountry', e.target.value)}
              />
            </label>
            <label className="span-2">
              Ghana Card number
              <input
                className="form-input"
                value={form.ghanaCard}
                onChange={(e) => setUpper('ghanaCard', e.target.value)}
                placeholder="GHA-XXXXXXXXX-X"
                required
              />
            </label>
            <label className="span-2">
              Residential address
              <textarea
                className="form-input"
                rows={2}
                value={form.residentialAddress}
                onChange={(e) => setUpper('residentialAddress', e.target.value)}
              />
            </label>
            <label className="span-2">
              Postal address
              <textarea
                className="form-input"
                rows={2}
                value={form.postalAddress}
                onChange={(e) => setUpper('postalAddress', e.target.value)}
              />
            </label>
            <label>
              Email address (if any)
              <input
                className="form-input"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </label>
            <label>
              Mobile phone no. (if any)
              <input
                className="form-input"
                type="tel"
                value={form.mobile}
                onChange={(e) => setField('mobile', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="tpfs-part" disabled={viewing}>
          <legend>Part III — Member contribution rate</legend>
          <div className="tpfs-rates">
            {['5', '10', 'other'].map((opt) => (
              <label key={opt} className="tpfs-check">
                <input
                  type="radio"
                  name="tpfs-rate"
                  checked={rate === opt}
                  onChange={() => setField('contributionRate', opt)}
                  required
                />
                {opt === 'other' ? 'Other, please specify (%)' : `${opt}%`}
              </label>
            ))}
            {rate === 'other' && (
              <input
                className="form-input tpfs-other-rate"
                inputMode="decimal"
                value={form.contributionOther}
                onChange={(e) => setField('contributionOther', e.target.value)}
                placeholder="%"
                required
              />
            )}
          </div>
        </fieldset>

        <fieldset className="tpfs-part" disabled={viewing}>
          <legend>Part IV — Next of kin / beneficiaries</legend>
          <p className="tpfs-note">
            I hereby declare that the person(s) whose names are indicated below
            are to receive any benefit due me in the event of my death.
          </p>
          <div className="tpfs-ben-wrap">
            <table className="tpfs-ben">
              <thead>
                <tr>
                  <th>Name of beneficiary</th>
                  <th>Date of birth / age</th>
                  <th>Relationship</th>
                  <th>Contact number / address</th>
                  <th>% allocation</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {form.beneficiaries.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        className="form-input"
                        value={row.name}
                        onChange={(e) =>
                          updateBeneficiary(index, 'name', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="form-input"
                        value={row.birthDate}
                        onChange={(e) =>
                          updateBeneficiary(index, 'birthDate', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="form-input"
                        value={row.relationship}
                        onChange={(e) =>
                          updateBeneficiary(index, 'relationship', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="form-input"
                        value={row.contact}
                        onChange={(e) =>
                          updateBeneficiary(index, 'contact', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="form-input"
                        inputMode="decimal"
                        value={row.percent}
                        onChange={(e) =>
                          updateBeneficiary(index, 'percent', e.target.value)
                        }
                      />
                    </td>
                    <td className="no-print">
                      <button
                        type="button"
                        className="tpfs-icon-btn"
                        onClick={() => removeBeneficiary(index)}
                        aria-label="Remove beneficiary"
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tpfs-ben-foot">
            {!viewing && (
              <button type="button" className="tpfs-link-btn" onClick={addBeneficiary}>
                <FaPlus aria-hidden /> Add beneficiary
              </button>
            )}
            <strong className={Math.round(total) === 100 ? 'ok' : 'bad'}>
              Total {total || 0}% {Math.round(total) === 100 ? '' : '(must be 100%)'}
            </strong>
          </div>
        </fieldset>

        <fieldset className="tpfs-part">
          <legend>Declaration by contributor</legend>
          <p className="tpfs-note">
            I declare that the information provided above is ACCURATE AND COMPLETE.
          </p>
          <div className="tpfs-grid">
            <label>
              Date
              <input
                className="form-input"
                type="date"
                value={form.declarationDate}
                onChange={(e) => setField('declarationDate', e.target.value)}
                required
                disabled={viewing}
              />
            </label>
            <div className="span-2">
              <span className="tpfs-label">Signature of applicant / thumb print</span>
              {viewing && form.signatureData ? (
                <img className="tpfs-sign-img" src={form.signatureData} alt="Signature" />
              ) : (
                <SignaturePad
                  value={form.signatureData}
                  onChange={(value) => setField('signatureData', value)}
                  disabled={viewing}
                />
              )}
            </div>
          </div>
        </fieldset>

        {error && (
          <p className="tpfs-error no-print" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="tpfs-info no-print" role="status">
            {info}
          </p>
        )}

        {!viewing && (
          <div className="tpfs-actions no-print">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Submit membership form'}
            </button>
          </div>
        )}
      </form>

      <div className="tpfs-saved no-print">
        <div className="tpfs-saved-head">
          <h3>
            <FaFileAlt aria-hidden /> Saved registrations
          </h3>
          <button type="button" className="btn btn-secondary" onClick={loadList}>
            <FaSync aria-hidden /> Refresh
          </button>
        </div>
        <p>
          {scope === 'all'
            ? 'All submitted TPFS membership forms.'
            : 'Forms you have submitted from this account.'}
        </p>
        {saved.length === 0 ? (
          <p className="tpfs-empty">No membership forms saved yet.</p>
        ) : (
          <div className="tpfs-saved-wrap">
            <table className="tpfs-saved-table">
              <thead>
                <tr>
                  <th>Staff ID</th>
                  <th>Name</th>
                  <th>Ghana Card</th>
                  <th>School / office</th>
                  <th>Rate</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saved.map((row) => (
                  <tr key={row.id}>
                    <td>{row.staffId || '—'}</td>
                    <td>{fullName(row) || '—'}</td>
                    <td>{row.ghanaCard || '—'}</td>
                    <td>{row.schoolName || '—'}</td>
                    <td>
                      {row.contributionRate === 'other'
                        ? `${row.contributionOther || '—'}%`
                        : row.contributionRate
                          ? `${row.contributionRate}%`
                          : '—'}
                    </td>
                    <td>
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <div className="tpfs-saved-actions">
                        <button
                          type="button"
                          className="vdash-details"
                          onClick={() => openSaved(row.id)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="vdash-delete"
                          onClick={() => dropSaved(row)}
                        >
                          <FaTrash aria-hidden /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default MembershipForm;
