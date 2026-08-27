const SETTINGS_KEY = 'meeting_departments';

/** Default GLICO department pick list for meeting check-in. */
const DEFAULT_MEETING_DEPARTMENTS = [
  'Micro Insurance',
  'Individual Life',
  'Finance',
  'Underwriting',
  'Claims',
  'Customer Experience',
  'Agency Support',
  'Group Business',
  'Actuarial',
  'Enterprise Risk',
  'Human Resource',
  'ICT',
  'Corporate Affairs',
  'Legal',
];

function normalizeDepartments(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const name = String(item || '').trim().slice(0, 80);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out.slice(0, 100);
}

function parseDepartmentsJson(raw) {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return normalizeDepartments(data);
  } catch {
    return [];
  }
}

async function getMeetingDepartments(query) {
  const result = await query(
    `SELECT value_json FROM platform_settings WHERE key = $1`,
    [SETTINGS_KEY]
  );
  if (!result.rowCount) return [...DEFAULT_MEETING_DEPARTMENTS];
  const parsed = parseDepartmentsJson(result.rows[0].value_json);
  return parsed.length ? parsed : [...DEFAULT_MEETING_DEPARTMENTS];
}

async function seedMeetingDepartments(query) {
  const existing = await query(
    `SELECT value_json FROM platform_settings WHERE key = $1`,
    [SETTINGS_KEY]
  );
  if (existing.rowCount > 0) {
    const current = parseDepartmentsJson(existing.rows[0].value_json);
    if (current.length > 0) return current;
  }
  return setMeetingDepartments(query, DEFAULT_MEETING_DEPARTMENTS);
}

async function setMeetingDepartments(query, rawList) {
  const departments = normalizeDepartments(rawList);
  const json = JSON.stringify(departments);
  const existing = await query(
    `SELECT key FROM platform_settings WHERE key = $1`,
    [SETTINGS_KEY]
  );
  if (existing.rowCount > 0) {
    await query(
      `UPDATE platform_settings
       SET value_json = $2, updated_at = NOW()
       WHERE key = $1`,
      [SETTINGS_KEY, json]
    );
  } else {
    await query(
      `INSERT INTO platform_settings (key, value_json, updated_at)
       VALUES ($1, $2, NOW())`,
      [SETTINGS_KEY, json]
    );
  }
  return departments;
}

function normalizeDepartmentName(value) {
  return String(value || '').trim().slice(0, 80);
}

function isValidDepartment(value) {
  return normalizeDepartmentName(value).length >= 2;
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_MEETING_DEPARTMENTS,
  normalizeDepartments,
  parseDepartmentsJson,
  getMeetingDepartments,
  setMeetingDepartments,
  seedMeetingDepartments,
  normalizeDepartmentName,
  isValidDepartment,
};
