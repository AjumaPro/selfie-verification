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

function rowToResult(row) {
  if (!row) return null;
  let person = null;
  try {
    const raw = JSON.parse(row.result_json || '{}');
    person = raw.person || null;
  } catch {
    person = null;
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    ghanaCard: row.ghana_card || '',
    verified:
      String(row.verified || '').toUpperCase() === 'TRUE' ||
      row.verified === true ||
      row.verified === 1,
    forenames: row.forenames || '',
    surname: row.surname || '',
    nationalId: row.national_id || '',
    gender: row.gender || '',
    birthDate: row.birth_date || '',
    code: row.code || '',
    message: row.message || '',
    transactionGuid: row.transaction_guid || '',
    localFaceOk: !!(row.local_face_ok === 1 || row.local_face_ok === true),
    person,
    createdAt: row.created_at,
  };
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

    const body = req.body || {};
    const ghanaCard = String(body.ghanaCard || body.pinNumber || '')
      .trim()
      .slice(0, 40);
    if (ghanaCard.length < 5) {
      return res.status(400).json({ error: 'Ghana Card number is required.' });
    }

    const verifiedRaw = body.verified;
    const verified =
      verifiedRaw === true ||
      String(verifiedRaw || '').toUpperCase() === 'TRUE'
        ? 'TRUE'
        : 'FALSE';

    const person = body.person && typeof body.person === 'object' ? body.person : {};
    const forenames = String(
      body.forenames || person.forenames || ''
    ).trim().slice(0, 120);
    const surname = String(body.surname || person.surname || '')
      .trim()
      .slice(0, 120);
    const nationalId = String(
      body.nationalId || person.nationalId || ghanaCard
    )
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
    const transactionGuid = String(
      body.transactionGuid || body.transaction_guid || ''
    )
      .trim()
      .slice(0, 80);
    const localFaceOk = body.localFaceOk ? 1 : 0;

    // Keep a compact JSON snapshot (no selfie image)
    const snapshot = {
      verified,
      code,
      message,
      transactionGuid,
      person: {
        forenames,
        surname,
        nationalId,
        gender,
        birthDate,
        cardId: person.cardId || '',
        nationality: person.nationality || '',
      },
    };

    const id = newId();
    await query(
      `INSERT INTO verify_results (
        id, session_id, ghana_card, verified,
        forenames, surname, national_id, gender, birth_date,
        code, message, transaction_guid, local_face_ok, result_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        sessionId,
        ghanaCard,
        verified,
        forenames,
        surname,
        nationalId,
        gender,
        birthDate,
        code,
        message,
        transactionGuid,
        localFaceOk,
        JSON.stringify(snapshot),
      ]
    );

    const again = await query(`SELECT * FROM verify_results WHERE id = $1`, [
      id,
    ]);
    return res.status(201).json({
      result: rowToResult(again.rows[0]),
      message:
        verified === 'TRUE'
          ? 'Verification submitted. The host can see your result.'
          : 'Result submitted. The host can see that verification did not match.',
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

/**
 * DELETE /api/verify/sessions/:id/results/:resultId
 */
router.delete(
  '/sessions/:id/results/:resultId',
  authRequired,
  async (req, res) => {
    try {
      const owned = await getOwnedSession(req.params.id, req.userId);
      if (!owned) {
        return res.status(404).json({ error: 'Session not found.' });
      }
      await query(
        `DELETE FROM verify_results WHERE id = $1 AND session_id = $2`,
        [String(req.params.resultId || '').trim(), owned.id]
      );
      return res.json({ ok: true });
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
