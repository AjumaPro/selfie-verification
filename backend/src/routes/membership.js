const crypto = require('crypto');
const express = require('express');
const { query } = require('../db/pool');
const { authRequired } = require('../middleware/auth');
const { createRateLimiter, clientIp } = require('../middleware/rateLimit');

const router = express.Router();

const LIST_SELECT = `
  id, created_by, staff_id, school_name, district_region, union_affiliation,
  date_of_employment, first_deduction, surname, first_name, other_names,
  date_of_birth, gender, ghana_card, email, mobile, contribution_rate,
  contribution_other, basic_salary, ssnit_number, declaration_date,
  session_id, source, kyc_verified, created_at, updated_at
`;

const publicSubmitLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `mform:${clientIp(req)}`,
  message: 'Too many form submissions. Please wait 15 minutes and try again.',
});

function newId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

function upperClip(value, max) {
  return clip(value, max).toUpperCase();
}

function parseBeneficiaries(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw || '[]');
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 8)
    .map((row) => ({
      name: upperClip(row?.name, 160),
      birthDate: clip(row?.birthDate || row?.age, 40),
      relationship: upperClip(row?.relationship, 80),
      contact: clip(row?.contact, 200),
      percent: Number(row?.percent) || 0,
    }))
    .filter((row) => row.name);
}

function parseDataUrl(raw, maxChars) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) {
    return '';
  }
  return value.slice(0, maxChars);
}

function isApprovedKyc(value) {
  return (
    value === true ||
    value === 1 ||
    String(value || '').toUpperCase() === 'TRUE'
  );
}

async function isLiveSuperAdmin(userId, jwtRole) {
  if (String(jwtRole || '') !== 'superadmin' || !userId) return false;
  const result = await query(`SELECT role, status FROM users WHERE id = $1`, [
    userId,
  ]);
  if (!result.rowCount) return false;
  const row = result.rows[0];
  return (
    String(row.role || '') === 'superadmin' &&
    String(row.status || '') === 'approved'
  );
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || 'TPFS membership form',
    status: row.status || 'open',
    note: row.note || '',
    hostUserId: row.host_user_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseBody(body) {
  const contributionRateRaw = String(body?.contributionRate || '')
    .trim()
    .toLowerCase();
  const contributionRate =
    contributionRateRaw === '5' || contributionRateRaw === '10'
      ? contributionRateRaw
      : contributionRateRaw === 'other'
        ? 'other'
        : '';
  const beneficiaries = parseBeneficiaries(body?.beneficiaries);
  let kycSnapshot = {};
  if (body?.kycSnapshot && typeof body.kycSnapshot === 'object') {
    kycSnapshot = body.kycSnapshot;
  }
  return {
    staffId: upperClip(body?.staffId, 40),
    schoolName: upperClip(body?.schoolName, 160),
    districtRegion: upperClip(body?.districtRegion, 160),
    unionAffiliation: upperClip(body?.unionAffiliation, 80),
    dateOfEmployment: clip(body?.dateOfEmployment, 20),
    firstDeduction: clip(body?.firstDeduction, 20),
    surname: upperClip(body?.surname, 80),
    firstName: upperClip(body?.firstName, 80),
    otherNames: upperClip(body?.otherNames, 120),
    dateOfBirth: clip(body?.dateOfBirth, 20),
    gender: upperClip(body?.gender, 16),
    birthTown: upperClip(body?.birthTown, 80),
    birthRegion: upperClip(body?.birthRegion, 80),
    birthCountry: upperClip(body?.birthCountry, 80) || 'GHANA',
    ghanaCard: upperClip(body?.ghanaCard, 40),
    residentialAddress: upperClip(body?.residentialAddress, 240),
    postalAddress: upperClip(body?.postalAddress, 240),
    email: clip(body?.email, 120).toLowerCase(),
    mobile: clip(body?.mobile, 40),
    contributionRate,
    contributionOther: clip(body?.contributionOther, 10),
    basicSalary: clip(body?.basicSalary, 40),
    ssnitNumber: upperClip(body?.ssnitNumber, 40),
    beneficiaries,
    declarationDate: clip(body?.declarationDate, 20),
    photoData: parseDataUrl(body?.photoData, 900000),
    signatureData: parseDataUrl(body?.signatureData, 400000),
    kycVerified: isApprovedKyc(body?.kycVerified),
    kycSnapshot,
  };
}

function validateForm(parsed) {
  if (parsed.staffId.length < 2) return 'Staff ID is required.';
  if (parsed.schoolName.length < 2) return 'Name of school/office is required.';
  if (parsed.districtRegion.length < 2) return 'District & region is required.';
  if (!parsed.dateOfEmployment) return 'Date of employment is required.';
  if (parsed.surname.length < 2) return 'Surname is required.';
  if (parsed.firstName.length < 2) return 'First name is required.';
  if (!parsed.dateOfBirth) return 'Date of birth is required.';
  if (!['MALE', 'FEMALE'].includes(parsed.gender)) {
    return 'Select gender.';
  }
  if (parsed.ghanaCard.length < 8) return 'Ghana Card number is required.';
  if (!parsed.kycVerified) {
    return 'Complete Ghana Card self-verification before submitting.';
  }
  if (!parsed.contributionRate) return 'Select a contribution rate.';
  if (parsed.contributionRate === 'other') {
    const n = Number(parsed.contributionOther);
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      return 'Enter a valid other contribution rate (%).';
    }
  }
  if (!parsed.beneficiaries.length) {
    return 'Add at least one next of kin / beneficiary.';
  }
  const total = parsed.beneficiaries.reduce(
    (sum, row) => sum + (Number(row.percent) || 0),
    0
  );
  if (Math.round(total) !== 100) {
    return 'Beneficiary allocation must total 100%.';
  }
  if (!parsed.declarationDate) return 'Declaration date is required.';
  if (!parsed.photoData) return 'Passport picture is required.';
  if (!parsed.signatureData) {
    return 'Applicant signature or thumb print is required.';
  }
  return null;
}

function rowToForm(row, { includeMedia = false } = {}) {
  if (!row) return null;
  let beneficiaries = [];
  try {
    beneficiaries = parseBeneficiaries(row.beneficiaries_json);
  } catch {
    beneficiaries = [];
  }
  let kycSnapshot = {};
  try {
    kycSnapshot = JSON.parse(row.kyc_json || '{}') || {};
  } catch {
    kycSnapshot = {};
  }
  const form = {
    id: row.id,
    createdBy: row.created_by || '',
    sessionId: row.session_id || '',
    source: row.source || 'staff',
    kycVerified: isApprovedKyc(row.kyc_verified),
    kycSnapshot,
    staffId: row.staff_id || '',
    schoolName: row.school_name || '',
    districtRegion: row.district_region || '',
    unionAffiliation: row.union_affiliation || '',
    dateOfEmployment: row.date_of_employment || '',
    firstDeduction: row.first_deduction || '',
    surname: row.surname || '',
    firstName: row.first_name || '',
    otherNames: row.other_names || '',
    dateOfBirth: row.date_of_birth || '',
    gender: row.gender || '',
    birthTown: row.birth_town || '',
    birthRegion: row.birth_region || '',
    birthCountry: row.birth_country || '',
    ghanaCard: row.ghana_card || '',
    residentialAddress: row.residential_address || '',
    postalAddress: row.postal_address || '',
    email: row.email || '',
    mobile: row.mobile || '',
    contributionRate: row.contribution_rate || '',
    contributionOther: row.contribution_other || '',
    basicSalary: row.basic_salary || '',
    ssnitNumber: row.ssnit_number || '',
    beneficiaries,
    declarationDate: row.declaration_date || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasPhoto: Boolean(row.photo_data),
    hasSignature: Boolean(row.signature_data),
  };
  if (includeMedia) {
    form.photoData = row.photo_data || '';
    form.signatureData = row.signature_data || '';
  }
  return form;
}

async function insertForm(parsed, { createdBy, sessionId, source }) {
  const id = newId();
  const snapshot = {
    ...parsed,
    id,
    photoData: parsed.photoData ? '1' : '',
    signatureData: parsed.signatureData ? '1' : '',
  };
  await query(
    `INSERT INTO membership_forms (
      id, created_by, staff_id, school_name, district_region, union_affiliation,
      date_of_employment, first_deduction, surname, first_name, other_names,
      date_of_birth, gender, birth_town, birth_region, birth_country, ghana_card,
      residential_address, postal_address, email, mobile, contribution_rate,
      contribution_other, basic_salary, ssnit_number, beneficiaries_json,
      declaration_date, photo_data, signature_data, form_json,
      session_id, source, kyc_verified, kyc_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
    )`,
    [
      id,
      String(createdBy || ''),
      parsed.staffId,
      parsed.schoolName,
      parsed.districtRegion,
      parsed.unionAffiliation,
      parsed.dateOfEmployment,
      parsed.firstDeduction,
      parsed.surname,
      parsed.firstName,
      parsed.otherNames,
      parsed.dateOfBirth,
      parsed.gender,
      parsed.birthTown,
      parsed.birthRegion,
      parsed.birthCountry,
      parsed.ghanaCard,
      parsed.residentialAddress,
      parsed.postalAddress,
      parsed.email,
      parsed.mobile,
      parsed.contributionRate,
      parsed.contributionOther,
      parsed.basicSalary,
      parsed.ssnitNumber,
      JSON.stringify(parsed.beneficiaries),
      parsed.declarationDate,
      parsed.photoData,
      parsed.signatureData,
      JSON.stringify(snapshot),
      String(sessionId || ''),
      source === 'share' ? 'share' : 'staff',
      parsed.kycVerified ? 'TRUE' : 'FALSE',
      JSON.stringify(parsed.kycSnapshot || {}),
    ]
  );
  const again = await query(
    `SELECT ${LIST_SELECT} FROM membership_forms WHERE id = $1`,
    [id]
  );
  return rowToForm(again.rows[0]);
}

router.get('/sessions/mine', authRequired, async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM membership_sessions
       WHERE host_user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [String(req.userId)]
    );
    return res.json({ sessions: (r.rows || []).map(rowToSession) });
  } catch (err) {
    console.error('membership sessions mine:', err);
    return res.status(500).json({ error: 'Could not list form links.' });
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const r = await query(`SELECT * FROM membership_sessions WHERE id = $1`, [
      id,
    ]);
    if (!r.rowCount) {
      return res.status(404).json({
        error:
          'This membership form link was not found. Ask GLICO Pensions staff for a new QR or link.',
      });
    }
    const session = rowToSession(r.rows[0]);
    if (session.status === 'closed') {
      return res.status(403).json({
        error: 'This membership form link is closed. Ask staff for a new link.',
        session: { id: session.id, title: session.title, status: 'closed' },
      });
    }
    return res.json({
      session: {
        id: session.id,
        title: session.title,
        note: session.note,
        status: session.status,
      },
    });
  } catch (err) {
    console.error('membership get session:', err);
    return res.status(500).json({ error: 'Could not load membership form link.' });
  }
});

router.put('/sessions/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 80) {
      return res.status(400).json({ error: 'Invalid session id.' });
    }
    const title =
      String(req.body?.title || '').trim() || 'TPFS membership form';
    const note = String(req.body?.note || '').trim().slice(0, 500);
    const statusRaw = String(req.body?.status || 'open').toLowerCase();
    const status = statusRaw === 'closed' ? 'closed' : 'open';

    const existing = await query(
      `SELECT * FROM membership_sessions WHERE id = $1`,
      [id]
    );
    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      if (String(row.host_user_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Not your form link.' });
      }
      await query(
        `UPDATE membership_sessions
         SET title = $2, note = $3, status = $4, updated_at = NOW()
         WHERE id = $1`,
        [id, title, note, status]
      );
    } else {
      await query(
        `INSERT INTO membership_sessions (id, title, host_user_id, status, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, title, String(req.userId), status, note]
      );
    }
    const again = await query(
      `SELECT * FROM membership_sessions WHERE id = $1`,
      [id]
    );
    return res.json({ session: rowToSession(again.rows[0]) });
  } catch (err) {
    console.error('membership put session:', err);
    return res.status(500).json({ error: 'Could not save form link.' });
  }
});

router.delete('/sessions/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const r = await query(
      `SELECT * FROM membership_sessions WHERE id = $1`,
      [id]
    );
    if (!r.rowCount) {
      return res.status(404).json({ error: 'Form link not found.' });
    }
    if (String(r.rows[0].host_user_id) !== String(req.userId)) {
      const admin = await isLiveSuperAdmin(req.userId, req.userRole);
      if (!admin) {
        return res.status(403).json({ error: 'Not your form link.' });
      }
    }
    await query(`DELETE FROM membership_sessions WHERE id = $1`, [id]);
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('membership delete session:', err);
    return res.status(500).json({ error: 'Could not delete form link.' });
  }
});

router.post(
  '/sessions/:id/submit',
  publicSubmitLimiter,
  async (req, res) => {
    try {
      const sessionId = String(req.params.id || '').trim();
      const r = await query(
        `SELECT * FROM membership_sessions WHERE id = $1`,
        [sessionId]
      );
      if (!r.rowCount) {
        return res.status(404).json({ error: 'Membership form link not found.' });
      }
      if (String(r.rows[0].status || '') === 'closed') {
        return res.status(403).json({
          error: 'This membership form link is closed.',
        });
      }
      const parsed = parseBody(req.body || {});
      const err = validateForm(parsed);
      if (err) return res.status(400).json({ error: err });
      const form = await insertForm(parsed, {
        createdBy: r.rows[0].host_user_id,
        sessionId,
        source: 'share',
      });
      return res.status(201).json({
        form,
        message:
          'Registration submitted. GLICO Pensions has received your membership form.',
      });
    } catch (err) {
      console.error('membership public submit:', err);
      return res.status(500).json({ error: 'Could not submit membership form.' });
    }
  }
);

router.get('/', authRequired, async (req, res) => {
  try {
    const admin = await isLiveSuperAdmin(req.userId, req.userRole);
    const params = admin ? [] : [String(req.userId)];
    const where = admin ? '' : 'WHERE created_by = $1';
    const r = await query(
      `SELECT ${LIST_SELECT}
       FROM membership_forms
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    );
    return res.json({
      scope: admin ? 'all' : 'mine',
      forms: (r.rows || []).map((row) => rowToForm(row)),
    });
  } catch (err) {
    console.error('membership list:', err);
    return res.status(500).json({ error: 'Could not load membership forms.' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const r = await query(`SELECT * FROM membership_forms WHERE id = $1`, [id]);
    if (!r.rowCount) {
      return res.status(404).json({ error: 'Membership form not found.' });
    }
    const row = r.rows[0];
    const admin = await isLiveSuperAdmin(req.userId, req.userRole);
    if (!admin && String(row.created_by || '') !== String(req.userId)) {
      return res.status(403).json({ error: 'Not your membership form.' });
    }
    return res.json({ form: rowToForm(row, { includeMedia: true }) });
  } catch (err) {
    console.error('membership get:', err);
    return res.status(500).json({ error: 'Could not load membership form.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const parsed = parseBody(req.body || {});
    const err = validateForm(parsed);
    if (err) return res.status(400).json({ error: err });
    const form = await insertForm(parsed, {
      createdBy: req.userId,
      sessionId: '',
      source: 'staff',
    });
    return res.status(201).json({
      form,
      message: 'Membership registration saved.',
    });
  } catch (err) {
    console.error('membership create:', err);
    return res.status(500).json({ error: 'Could not save membership form.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const r = await query(
      `SELECT id, created_by FROM membership_forms WHERE id = $1`,
      [id]
    );
    if (!r.rowCount) {
      return res.status(404).json({ error: 'Membership form not found.' });
    }
    const row = r.rows[0];
    const admin = await isLiveSuperAdmin(req.userId, req.userRole);
    if (!admin && String(row.created_by || '') !== String(req.userId)) {
      return res.status(403).json({ error: 'You can only delete your own forms.' });
    }
    await query(`DELETE FROM membership_forms WHERE id = $1`, [id]);
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('membership delete:', err);
    return res.status(500).json({ error: 'Could not delete membership form.' });
  }
});

module.exports = router;
