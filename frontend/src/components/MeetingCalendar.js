import React, { useMemo, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import './MeetingCalendar.css';

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Month calendar with meeting markers. Select a day to filter the list.
 */
const MeetingCalendar = ({ meetings, selectedDate, onSelectDate }) => {
  const today = ymd(new Date());
  const [cursor, setCursor] = useState(() => {
    const base = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const counts = useMemo(() => {
    const map = new Map();
    (meetings || []).forEach((m) => {
      if (!m.date || m.status === 'cancelled') return;
      map.set(m.date, (map.get(m.date) || 0) + 1);
    });
    return map;
  }, [meetings]);

  const cells = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay(); // 0 Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const out = [];

    for (let i = 0; i < firstDow; i += 1) {
      const day = prevDays - firstDow + 1 + i;
      const d = new Date(year, month - 1, day);
      out.push({ date: ymd(d), day, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(year, month, day);
      out.push({ date: ymd(d), day, inMonth: true });
    }
    while (out.length % 7 !== 0) {
      const day = out.length - (firstDow + daysInMonth) + 1;
      const d = new Date(year, month + 1, day);
      out.push({ date: ymd(d), day, inMonth: false });
    }
    return out;
  }, [year, month]);

  const prev = () => setCursor(new Date(year, month - 1, 1));
  const next = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
    onSelectDate(today);
  };

  return (
    <section className="meeting-cal" aria-label="Meetings calendar">
      <div className="meeting-cal-head">
        <button type="button" className="meeting-cal-nav" onClick={prev} aria-label="Previous month">
          <FaChevronLeft />
        </button>
        <div className="meeting-cal-title-wrap">
          <h3 className="meeting-cal-title">{monthLabel}</h3>
          <button type="button" className="meeting-cal-today" onClick={goToday}>
            Today
          </button>
        </div>
        <button type="button" className="meeting-cal-nav" onClick={next} aria-label="Next month">
          <FaChevronRight />
        </button>
      </div>

      <div className="meeting-cal-weekdays" aria-hidden>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="meeting-cal-grid">
        {cells.map((c) => {
          const n = counts.get(c.date) || 0;
          const selected = selectedDate === c.date;
          const isToday = c.date === today;
          return (
            <button
              key={c.date + String(c.inMonth)}
              type="button"
              className={[
                'meeting-cal-day',
                c.inMonth ? 'in-month' : 'out-month',
                n > 0 ? 'has-meetings' : '',
                selected ? 'selected' : '',
                isToday ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                onSelectDate(selectedDate === c.date ? '' : c.date)
              }
              title={
                n > 0
                  ? `${n} meeting${n === 1 ? '' : 's'} on ${c.date}`
                  : c.date
              }
            >
              <span className="meeting-cal-num">{c.day}</span>
              {n > 0 && (
                <span className="meeting-cal-dots" aria-hidden>
                  {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <i key={i} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <p className="meeting-cal-filter-note">
          Showing <strong>{selectedDate}</strong>
          <button
            type="button"
            className="meeting-cal-clear"
            onClick={() => onSelectDate('')}
          >
            Clear day filter
          </button>
        </p>
      )}
    </section>
  );
};

export default MeetingCalendar;
