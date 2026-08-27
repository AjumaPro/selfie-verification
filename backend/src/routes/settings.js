const express = require('express');
const { query } = require('../db/pool');
const { authRequired, requireSuperAdmin } = require('../middleware/auth');
const {
  getMeetingDepartments,
  setMeetingDepartments,
} = require('../services/meetingDepartments');

const router = express.Router();

/** Public list for meeting check-in forms. */
router.get('/meeting-departments', async (_req, res) => {
  try {
    const departments = await getMeetingDepartments(query);
    return res.json({ departments });
  } catch (err) {
    console.error('get meeting departments error:', err);
    return res.status(500).json({ error: 'Could not load departments.' });
  }
});

/** Superadmin manages the department pick list. */
router.put(
  '/meeting-departments',
  authRequired,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const departments = await setMeetingDepartments(
        query,
        req.body?.departments
      );
      return res.json({ departments });
    } catch (err) {
      console.error('set meeting departments error:', err);
      return res.status(500).json({ error: 'Could not save departments.' });
    }
  }
);

module.exports = router;
