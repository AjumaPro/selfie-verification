/** Fields the host can include when downloading the attendance register. */

export const ATTENDANCE_DOWNLOAD_FIELDS = [
  { key: 'rowNumber', label: '#', defaultOn: true },
  { key: 'name', label: 'Full name', defaultOn: true, alwaysOn: true },
  { key: 'department', label: 'Department', defaultOn: true },
  { key: 'email', label: 'Email', defaultOn: true },
  { key: 'phone', label: 'Phone', defaultOn: true },
  {
    key: 'breakfast',
    label: 'Breakfast',
    defaultOn: false,
    mealKey: 'breakfast',
  },
  { key: 'lunch', label: 'Lunch', defaultOn: false, mealKey: 'lunch' },
  { key: 'dinner', label: 'Dinner', defaultOn: false, mealKey: 'dinner' },
  { key: 'locationStatus', label: 'Location status', defaultOn: true },
  { key: 'gps', label: 'Guest GPS', defaultOn: false },
  { key: 'checkedIn', label: 'Checked-in time', defaultOn: true },
];

export const ATTENDANCE_FILTERS = [
  { key: 'all', label: 'All who approved to join' },
  { key: 'at_venue', label: 'At venue only' },
  { key: 'away', label: 'Not at venue only' },
  { key: 'unknown', label: 'Unverified location only' },
];

export function defaultAttendanceDownloadOptions() {
  return ATTENDANCE_DOWNLOAD_FIELDS.reduce((acc, field) => {
    acc[field.key] = field.defaultOn;
    return acc;
  }, {});
}

export function normalizeAttendanceDownloadOptions(raw) {
  const defaults = defaultAttendanceDownloadOptions();
  if (!raw || typeof raw !== 'object') return defaults;
  const out = { ...defaults };
  ATTENDANCE_DOWNLOAD_FIELDS.forEach(({ key, alwaysOn }) => {
    if (alwaysOn) {
      out[key] = true;
      return;
    }
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  });
  return out;
}

export function locationStatusLabel(a) {
  if (!a) return { text: '—', cls: '' };
  if (a.locationMatch === 'at_venue') {
    return {
      text:
        a.distanceM != null
          ? `At venue · ${Math.round(a.distanceM)} m`
          : 'At venue',
      cls: 'match-ok',
    };
  }
  if (a.locationMatch === 'away') {
    return {
      text:
        a.distanceM != null
          ? `Not at venue · ${Math.round(a.distanceM)} m away`
          : 'Not at venue',
      cls: 'match-away',
    };
  }
  return { text: 'Unverified', cls: 'match-unknown' };
}

/** Guests who consented / approved to join (check-in register). */
export function filterApprovedAttendance(attendance, filterKey = 'all') {
  const list = (attendance || []).filter(
    (a) => a && a.consentDetails !== false
  );
  if (filterKey === 'at_venue') {
    return list.filter((a) => a.locationMatch === 'at_venue');
  }
  if (filterKey === 'away') {
    return list.filter((a) => a.locationMatch === 'away');
  }
  if (filterKey === 'unknown') {
    return list.filter(
      (a) => a.locationMatch !== 'at_venue' && a.locationMatch !== 'away'
    );
  }
  return list;
}

export function resolveAttendanceColumns(meeting, attendance, options) {
  const opts = normalizeAttendanceDownloadOptions(options);
  const list = attendance || [];
  const mealMenu = meeting?.mealMenu || {};
  const mealEnabled = {
    breakfast: !!(
      mealMenu.breakfast?.enabled || list.some((a) => a.breakfastChoice)
    ),
    lunch: !!(mealMenu.lunch?.enabled || list.some((a) => a.lunchChoice)),
    dinner: !!(mealMenu.dinner?.enabled || list.some((a) => a.dinnerChoice)),
  };

  return {
    rowNumber: !!opts.rowNumber,
    name: true,
    department: !!opts.department,
    email: !!opts.email,
    phone: !!opts.phone,
    breakfast: !!opts.breakfast && mealEnabled.breakfast,
    lunch: !!opts.lunch && mealEnabled.lunch,
    dinner: !!opts.dinner && mealEnabled.dinner,
    locationStatus: !!opts.locationStatus,
    gps: !!opts.gps,
    checkedIn: !!opts.checkedIn,
  };
}

export function attendanceColumnDefs(columns) {
  const cols = columns || {};
  const defs = [];
  if (cols.rowNumber) defs.push({ key: 'rowNumber', label: '#' });
  if (cols.name) defs.push({ key: 'name', label: 'Full name' });
  if (cols.department) defs.push({ key: 'department', label: 'Department' });
  if (cols.email) defs.push({ key: 'email', label: 'Email' });
  if (cols.phone) defs.push({ key: 'phone', label: 'Phone' });
  if (cols.breakfast) defs.push({ key: 'breakfast', label: 'Breakfast' });
  if (cols.lunch) defs.push({ key: 'lunch', label: 'Lunch' });
  if (cols.dinner) defs.push({ key: 'dinner', label: 'Dinner' });
  if (cols.locationStatus) {
    defs.push({ key: 'locationStatus', label: 'Location status' });
  }
  if (cols.gps) defs.push({ key: 'gps', label: 'Guest GPS' });
  if (cols.checkedIn) defs.push({ key: 'checkedIn', label: 'Checked in' });
  return defs;
}

export function attendanceRowCells(person, index, columns) {
  const cols = columns || {};
  const cells = [];
  if (cols.rowNumber) cells.push(String(index + 1));
  if (cols.name) cells.push(String(person.fullName || ''));
  if (cols.department) cells.push(String(person.department || ''));
  if (cols.email) cells.push(String(person.email || ''));
  if (cols.phone) cells.push(String(person.phone || ''));
  if (cols.breakfast) cells.push(String(person.breakfastChoice || ''));
  if (cols.lunch) cells.push(String(person.lunchChoice || ''));
  if (cols.dinner) cells.push(String(person.dinnerChoice || ''));
  if (cols.locationStatus) {
    cells.push(locationStatusLabel(person).text);
  }
  if (cols.gps) {
    if (person.latitude != null && person.longitude != null) {
      const acc =
        person.locationAccuracy != null
          ? ` (±${Math.round(person.locationAccuracy)}m)`
          : '';
      cells.push(
        `${Number(person.latitude).toFixed(5)}, ${Number(
          person.longitude
        ).toFixed(5)}${acc}`
      );
    } else {
      cells.push('No location');
    }
  }
  if (cols.checkedIn) {
    cells.push(
      person.checkedInAt
        ? new Date(person.checkedInAt).toLocaleString()
        : ''
    );
  }
  return cells;
}

export function meetingFileSlug(meeting) {
  const safeTitle = String(meeting?.title || 'meeting')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const datePart =
    String(meeting?.date || '').replace(/[^\d-]/g, '') || 'nodate';
  return { safeTitle: safeTitle || 'meeting', datePart };
}
