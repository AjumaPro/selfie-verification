/** Fields the meeting author can include in participant food-list downloads. */
export const FOOD_DOWNLOAD_FIELDS = [
  { key: 'name', label: 'Full name', defaultOn: true, alwaysOn: true },
  { key: 'email', label: 'Email', defaultOn: false },
  { key: 'phone', label: 'Phone', defaultOn: true },
  { key: 'department', label: 'Department', defaultOn: true },
  {
    key: 'breakfast',
    label: 'Breakfast choice',
    defaultOn: true,
    mealKey: 'breakfast',
  },
  { key: 'lunch', label: 'Lunch choice', defaultOn: true, mealKey: 'lunch' },
  {
    key: 'dinner',
    label: 'Dinner choice',
    defaultOn: true,
    mealKey: 'dinner',
  },
  { key: 'checkedIn', label: 'Check-in time', defaultOn: true },
  { key: 'totals', label: 'Meal totals summary', defaultOn: true },
  { key: 'locationStatus', label: 'Location status', defaultOn: false },
];

export function defaultFoodDownloadOptions() {
  return FOOD_DOWNLOAD_FIELDS.reduce((acc, field) => {
    acc[field.key] = field.defaultOn;
    return acc;
  }, {});
}

export function normalizeFoodDownloadOptions(raw) {
  const defaults = defaultFoodDownloadOptions();
  if (!raw || typeof raw !== 'object') return defaults;
  const out = { ...defaults };
  FOOD_DOWNLOAD_FIELDS.forEach(({ key, alwaysOn }) => {
    if (alwaysOn) {
      out[key] = true;
      return;
    }
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  });
  return out;
}

/** Which columns/sections to render for a given meeting + attendance list. */
export function resolveFoodDownloadVisibility(meeting, attendance, options) {
  const opts = normalizeFoodDownloadOptions(options);
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
    name: opts.name,
    email: opts.email,
    phone: opts.phone,
    department: opts.department,
    breakfast: opts.breakfast && mealEnabled.breakfast,
    lunch: opts.lunch && mealEnabled.lunch,
    dinner: opts.dinner && mealEnabled.dinner,
    checkedIn: opts.checkedIn,
    totals: opts.totals,
    locationStatus: opts.locationStatus,
  };
}

export function hasPerPersonFoodDownload(visibility) {
  const v = visibility || {};
  return !!(
    v.name ||
    v.email ||
    v.phone ||
    v.department ||
    v.breakfast ||
    v.lunch ||
    v.dinner ||
    v.checkedIn ||
    v.locationStatus
  );
}
