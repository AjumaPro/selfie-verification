const express = require('express');
const crypto = require('crypto');
const { query } = require('../db/pool');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function newId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || 'Identity verification',
    status: row.status || 'open',
    note: row.note || '',
    hostUserId: row.host_user_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isApprovedValue(verified) {
  return (
    String(verified || '').toUpperCase() === 'TRUE' ||
    verified === true ||
    verified === 1
  );
}

function stripHeavyFields(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => stripHeavyFields(item, depth + 1));
  }
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 4000) return '';
    return value;
  }
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/image|photo|base64|portrait|selfie|faceData|biometric/i.test(key)) {
      continue;
    }
    out[key] = stripHeavyFields(nested, depth + 1);
  }
  return out;
}

function parseSnapshot(row) {
  try {
    const raw = JSON.parse(row.result_json || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function rowToResult(row) {
  if (!row) return null;
  const snapshot = parseSnapshot(row);
  const person = stripHeavyFields(snapshot.person || null);
  const approved = isApprovedValue(row.verified);
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionTitle: row.session_title || snapshot.sessionTitle || '',
    source: row.source || snapshot.source || 'share',
    hostUserId: row.host_user_id || row.owner_id || '',
    hostName: row.host_name || '',
    hostEmail: row.host_email || '',
    ghanaCard: row.ghana_card || '',
    verified: approved,
    approved,
    status: approved ? 'approved' : 'attempted',
    forenames: row.forenames || '',
    surname: row.surname || '',
    nationalId: row.national_id || '',
    gender: row.gender || '',
    birthDate: row.birth_date || '',
    code: row.code || '',
    message: row.message || '',
    errorText: row.error_text || snapshot.error || '',
    transactionGuid: row.transaction_guid || '',
    localFaceOk: !!(row.local_face_ok === 1 || row.local_face_ok === true),
    person,
    snapshot,
    createdAt: row.created_at,
  };
}

function parseAttemptBody(body) {
  const ghanaCard = String(body.ghanaCard || body.pinNumber || '')
    .trim()
    .slice(0, 40);
  const verifiedRaw = body.verified;
  const verified = isApprovedValue(verifiedRaw) ? 'TRUE' : 'FALSE';
  const personIn =
    body.person && typeof body.person === 'object' ? body.person : {};
  const person = stripHeavyFields(personIn) || {};
  const forenames = String(body.forenames || person.forenames || '')
    .trim()
    .slice(0, 120);
  const surname = String(body.surname || person.surname || '')
    .trim()
    .slice(0, 120);
  const nationalId = String(body.nationalId || person.nationalId || ghanaCard)
    .trim()
    .slice(0, 40);
  const gender = String(body.gender || person.gender || '')
    .trim()
    .slice(0, 40);
  const birthDate = String(body.birthDate || person.birthDate || '')
    .trim()
    .slice(0, 40);
  const code = String(body.code || '').trim().slice(0, 20);
  const message = String(body.message || '').trim().slice(0, 400);
  const errorText = String(body.error || body.errorText || '')
    .trim()
    .slice(0, 400);
  const transactionGuid = String(
    body.transactionGuid || body.transaction_guid || ''
  )
    .trim()
    .slice(0, 80);
  const localFaceOk = body.localFaceOk ? 1 : 0;
  const source = String(body.source || 'share').toLowerCase() === 'device'
    ? 'device'
    : 'share';
  const snapshot = {
    verified,
    code,
    message,
    error: errorText,
    transactionGuid,
    httpStatus: body.httpStatus || null,
    source,
    person: {
      ...person,
      forenames: forenames || person.forenames || '',
      surname: surname || person.surname || '',
      nationalId: nationalId || person.nationalId || '',
      gender: gender || person.gender || '',
      birthDate: birthDate || person.birthDate || '',
    },
  };
  return {
    ghanaCard,
    verified,
    forenames,
    surname,
    nationalId,
    gender,
    birthDate,
    code,
    message,
    errorText,
    transactionGuid,
    localFaceOk,
    source,
    snapshot,
  };
}

async function insertAttempt({
  sessionId,
  hostUserId,
  parsed,
}) {
  const id = newId();
  await query(
    `INSERT INTO verify_results (
      id, session_id, ghana_card, verified,
      forenames, surname, national_id, gender, birth_date,
      code, message, transaction_guid, local_face_ok, result_json,
      source, host_user_id, error_text
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      sessionId,
      parsed.ghanaCard,
      parsed.verified,
      parsed.forenames,
      parsed.surname,
      parsed.nationalId,
      parsed.gender,
      parsed.birthDate,
      parsed.code,
      parsed.message,
      parsed.transactionGuid,
      parsed.localFaceOk,
      JSON.stringify(parsed.snapshot),
      parsed.source,
      String(hostUserId || ''),
      parsed.errorText,
    ]
  );
  const again = await query(`SELECT * FROM verify_results WHERE id = $1`, [id]);
  return rowToResult(again.rows[0]);
}

async function ensureDeviceSession(userId) {
  const id = `device-${String(userId || '')}`.slice(0, 80);
  const existing = await query(`SELECT * FROM verify_sessions WHERE id = $1`, [
    id,
  ]);
  if (!existing.rowCount) {
    await query(
      `INSERT INTO verify_sessions (
        id, title, host_user_id, host_key, status, note
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        'On-device KYC',
        String(userId),
        '',
        'open',
        'Workstation Ghana Card checks',
      ]
    );
  }
  return id;
}

async function isLiveSuperAdmin(userId, jwtRole) {
  if (String(jwtRole || '') !== 'superadmin' || !userId) return false;
  const result = await query(
    `SELECT role, status FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rowCount) return false;
  const row = result.rows[0];
  return (
    String(row.role || '') === 'superadmin' &&
    String(row.status || '') === 'approved'
  );
}

async function getOwnedSession(sessionId, userId) {
  const r = await query(`SELECT * FROM verify_sessions WHERE id = $1`, [
    String(sessionId || '').trim(),
  ]);
  if (!r.rowCount) return null;
  const row = r.rows[0];
  if (String(row.host_user_id || '') !== String(userId || '')) return null;
  return row;
}

/**
 * PUT /api/verify/sessions/:id — create or update a shareable verification session (host).
 */
router.put('/sessions/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 80) {
      return res.status(400).json({ error: 'Invalid session id.' });
    }
    const title =
      String(req.body?.title || '').trim() || 'Identity verification';
    const note = String(req.body?.note || '').trim().slice(0, 500);
    const statusRaw = String(req.body?.status || 'open').toLowerCase();
    const status = statusRaw === 'closed' ? 'closed' : 'open';

    const existing = await query(`SELECT * FROM verify_sessions WHERE id = $1`, [
      id,
    ]);
    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      if (String(row.host_user_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Not your verification session.' });
      }
      await query(
        `UPDATE verify_sessions
         SET title = $2, note = $3, status = $4, updated_at = NOW()
         WHERE id = $1`,
        [id, title, note, status]
      );
    } else {
      await query(
        `INSERT INTO verify_sessions (
          id, title, host_user_id, host_key, status, note
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, title, String(req.userId), '', status, note]
      );
    }

    const again = await query(`SELECT * FROM verify_sessions WHERE id = $1`, [
      id,
    ]);
    return res.json({ session: rowToSession(again.rows[0]) });
  } catch (err) {
    console.error('verify put session:', err);
    return res.status(500).json({ error: 'Could not save verification session.' });
  }
});

/**
 * GET /api/verify/mine — list host sessions.
 */
router.get('/mine', authRequired, async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM verify_sessions
       WHERE host_user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [String(req.userId)]
    );
    return res.json({ sessions: (r.rows || []).map(rowToSession) });
  } catch (err) {
    console.error('verify mine:', err);
    return res.status(500).json({ error: 'Could not list sessions.' });
  }
});

/**
 * POST /api/verify/attempts — staff on-device KYC (approved or failed attempt).
 */
router.post('/attempts', authRequired, async (req, res) => {
  try {
    const parsed = parseAttemptBody({ ...(req.body || {}), source: 'device' });
    if (parsed.ghanaCard.length < 5) {
      return res.status(400).json({ error: 'Ghana Card number is required.' });
    }
    const sessionId = await ensureDeviceSession(req.userId);
    const result = await insertAttempt({
      sessionId,
      hostUserId: req.userId,
      parsed,
    });
    return res.status(201).json({
      result,
      message: result.approved
        ? 'Approved. Full details are on the dashboard.'
        : 'Attempt saved to the dashboard.',
    });
  } catch (err) {
    console.error('verify post attempt:', err);
    return res.status(500).json({ error: 'Could not save verification attempt.' });
  }
});

/**
 * GET /api/verify/dashboard — staff see own attempts; superadmin sees all.
 * Query: status=all|approved|attempted
 */
router.get('/dashboard', authRequired, async (req, res) => {
  try {
    const admin = await isLiveSuperAdmin(req.userId, req.userRole);
    const statusRaw = String(req.query.status || 'all').toLowerCase();
    const status =
      statusRaw === 'approved' || statusRaw === 'attempted' ? statusRaw : 'all';
    const limit = Math.min(
      300,
      Math.max(1, Number(req.query.limit) || 150)
    );

    const ownerClause = admin
      ? ''
      : `WHERE COALESCE(NULLIF(r.host_user_id, ''), s.host_user_id, '') = $1`;
    const countParams = admin ? [] : [String(req.userId)];
    const countsRow = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE UPPER(COALESCE(r.verified, '')) = 'TRUE')::int AS approved
       FROM verify_results r
       LEFT JOIN verify_sessions s ON s.id = r.session_id
       ${ownerClause}`,
      countParams
    );
    const total = countsRow.rows[0]?.total || 0;
    const approvedCount = countsRow.rows[0]?.approved || 0;

    const params = [];
    const where = [];
    if (!admin) {
      params.push(String(req.userId));
      where.push(
        `COALESCE(NULLIF(r.host_user_id, ''), s.host_user_id, '') = $${params.length}`
      );
    }
    if (status === 'approved') {
      where.push(`UPPER(COALESCE(r.verified, '')) = 'TRUE'`);
    } else if (status === 'attempted') {
      where.push(`UPPER(COALESCE(r.verified, '')) IS DISTINCT FROM 'TRUE'`);
    }

    params.push(limit);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await query(
      `SELECT
         r.*,
         s.title AS session_title,
         COALESCE(NULLIF(r.host_user_id, ''), s.host_user_id, '') AS owner_id,
         u.email AS host_email,
         u.full_name AS host_name
       FROM verify_results r
       LEFT JOIN verify_sessions s ON s.id = r.session_id
       LEFT JOIN users u
         ON u.id::text = COALESCE(NULLIF(r.host_user_id, ''), s.host_user_id, '')
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    const results = (r.rows || []).map(rowToResult);
    return res.json({
      scope: admin ? 'all' : 'mine',
      status,
      counts: {
        total,
        approved: approvedCount,
        attempted: Math.max(0, total - approvedCount),
      },
      results,
    });
  } catch (err) {
    console.error('verify dashboard:', err);
    return res.status(500).json({ error: 'Could not load verification dashboard.' });
  }
});

/**
 * GET /api/verify/sessions/:id — public guest metadata.
 */
router.get('/sessions/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const r = await query(`SELECT * FROM verify_sessions WHERE id = $1`, [id]);
    if (!r.rowCount) {
      return res.status(404).json({
        error:
          'Verification link not found. Ask the host to create or refresh the QR / link.',
      });
    }
    const session = rowToSession(r.rows[0]);
    if (session.status === 'closed') {
      return res.status(403).json({
        error: 'This verification link is closed. Ask the host for a new link.',
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
    console.error('verify get session:', err);
    return res.status(500).json({ error: 'Could not load verification session.' });
  }
});

/**
 * POST /api/verify/sessions/:id/results — guest submits KYC outcome.
 */
router.post('/sessions/:id/results', async (req, res) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const r = await query(`SELECT * FROM verify_sessions WHERE id = $1`, [
      sessionId,
    ]);
    if (!r.rowCount) {
      return res.status(404).json({ error: 'Verification session not found.' });
    }
    if (String(r.rows[0].status || '') === 'closed') {
      return res.status(403).json({
        error: 'This verification link is closed.',
      });
    }

    const parsed = parseAttemptBody({ ...(req.body || {}), source: 'share' });
    if (parsed.ghanaCard.length < 5) {
      return res.status(400).json({ error: 'Ghana Card number is required.' });
    }

    const result = await insertAttempt({
      sessionId,
      hostUserId: r.rows[0].host_user_id,
      parsed,
    });
    return res.status(201).json({
      result,
      message: result.approved
        ? 'Approved. The host can see the full details on the dashboard.'
        : 'Attempt saved. The host can see this verification on the dashboard.',
    });
  } catch (err) {
    console.error('verify post result:', err);
    return res.status(500).json({ error: 'Could not save verification result.' });
  }
});

/**
 * GET /api/verify/sessions/:id/results — host live list.
 */
router.get('/sessions/:id/results', authRequired, async (req, res) => {
  try {
    const owned = await getOwnedSession(req.params.id, req.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    const r = await query(
      `SELECT * FROM verify_results
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [owned.id]
    );
    return res.json({
      session: rowToSession(owned),
      results: (r.rows || []).map(rowToResult),
    });
  } catch (err) {
    console.error('verify list results:', err);
    return res.status(500).json({ error: 'Could not load results.' });
  }
});

async function findResultForDelete(resultId) {
  const id = String(resultId || '').trim();
  if (!id) return null;
  const r = await query(
    `SELECT
       r.*,
       COALESCE(NULLIF(r.host_user_id, ''), s.host_user_id, '') AS owner_id
     FROM verify_results r
     LEFT JOIN verify_sessions s ON s.id = r.session_id
     WHERE r.id = $1`,
    [id]
  );
  return r.rowCount ? r.rows[0] : null;
}

async function canDeleteResult(row, userId, jwtRole) {
  if (!row) return false;
  if (String(row.owner_id || '') === String(userId || '')) return true;
  return isLiveSuperAdmin(userId, jwtRole);
}

/**
 * DELETE /api/verify/results/:id — owner or superadmin removes saved KYC details.
 */
router.delete('/results/:id', authRequired, async (req, res) => {
  try {
    const row = await findResultForDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Saved details not found.' });
    }
    if (!(await canDeleteResult(row, req.userId, req.userRole))) {
      return res.status(403).json({
        error: 'You can only delete your own saved details.',
      });
    }
    await query(`DELETE FROM verify_results WHERE id = $1`, [row.id]);
    return res.json({ ok: true, id: row.id });
  } catch (err) {
    console.error('verify delete saved details:', err);
    return res.status(500).json({ error: 'Could not delete saved details.' });
  }
});

/**
 * DELETE /api/verify/sessions/:id/results/:resultId
 */
router.delete(
  '/sessions/:id/results/:resultId',
  authRequired,
  async (req, res) => {
    try {
      const row = await findResultForDelete(req.params.resultId);
      if (!row) {
        return res.status(404).json({ error: 'Saved details not found.' });
      }
      const sessionId = String(req.params.id || '').trim();
      if (sessionId && String(row.session_id || '') !== sessionId) {
        return res.status(404).json({ error: 'Saved details not found.' });
      }
      if (!(await canDeleteResult(row, req.userId, req.userRole))) {
        return res.status(403).json({
          error: 'You can only delete your own saved details.',
        });
      }
      await query(`DELETE FROM verify_results WHERE id = $1`, [row.id]);
      return res.json({ ok: true, id: row.id });
    } catch (err) {
      console.error('verify delete result:', err);
      return res.status(500).json({ error: 'Could not delete result.' });
    }
  }
);

/**
 * DELETE /api/verify/sessions/:id — close/remove session (host).
 */
router.delete('/sessions/:id', authRequired, async (req, res) => {
  try {
    const owned = await getOwnedSession(req.params.id, req.userId);
    if (!owned) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    await query(`DELETE FROM verify_results WHERE session_id = $1`, [owned.id]);
    await query(`DELETE FROM verify_sessions WHERE id = $1`, [owned.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('verify delete session:', err);
    return res.status(500).json({ error: 'Could not delete session.' });
  }
});

module.exports = router;
