const crypto = require('crypto');
const express = require('express');
const { query } = require('../db/pool');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const LIST_SELECT = `
  id, created_by, staff_id, school_name, district_region, union_affiliation,
  date_of_employment, first_deduction, surname, first_name, other_names,
  date_of_birth, gender, ghana_card, email, mobile, contribution_rate,
  contribution_other, basic_salary, ssnit_number, declaration_date,
  created_at, updated_at
`;

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

function isLiveSuperAdmin(userId, jwtRole) {
  return Promise.resolve().then(async () => {
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
  });
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
  const form = {
    id: row.id,
    createdBy: row.created_by || '',
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

    const id = newId();
    const snapshot = { ...parsed, id };
    await query(
      `INSERT INTO membership_forms (
        id, created_by, staff_id, school_name, district_region, union_affiliation,
        date_of_employment, first_deduction, surname, first_name, other_names,
        date_of_birth, gender, birth_town, birth_region, birth_country, ghana_card,
        residential_address, postal_address, email, mobile, contribution_rate,
        contribution_other, basic_salary, ssnit_number, beneficiaries_json,
        declaration_date, photo_data, signature_data, form_json
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30
      )`,
      [
        id,
        String(req.userId),
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
        JSON.stringify({ ...snapshot, photoData: parsed.photoData ? '1' : '', signatureData: parsed.signatureData ? '1' : '' }),
      ]
    );
    const again = await query(
      `SELECT ${LIST_SELECT} FROM membership_forms WHERE id = $1`,
      [id]
    );
    return res.status(201).json({
      form: rowToForm(again.rows[0]),
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
