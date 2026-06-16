import { useState, useRef, useEffect, useCallback } from 'react';
import { useLang, useT } from '../lib/i18n';

export function DatePicker({ value, onChange, min, max, placeholder, inline = false }) {
  const t = useT();
  const { lang } = useLang();
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  const dayNames =
    lang === 'id'
      ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const placeholderText = placeholder ?? t('Select date', 'Pilih tanggal');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);
  const popupRef = useRef(null);
  // Track which direction the month is sliding for the transition.
  const [slideDir, setSlideDir] = useState(0); // 0 = no animation, 1 = forward, -1 = back

  // Parse date strings for comparison
  const parseDate = useCallback((dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, []);

  const formatDate = (date) => {
    // Format from local components — toISOString() shifts the day in
    // timezones ahead of UTC.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isDateDisabled = useCallback((date) => {
    if (min && date < parseDate(min)) return true;
    if (max && date > parseDate(max)) return true;
    return false;
  }, [parseDate, min, max]);

  const isSameDay = (date1, date2) => {
    if (!date1 || !date2) return false;
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const handleDateSelect = (date) => {
    if (isDateDisabled(date)) return;
    const formatted = formatDate(date);
    setIsOpen(false);
    onChange(formatted);
  };

  const handleInputChange = useCallback((e) => {
    const inputValue = e.target.value;
    // Validate format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
      const date = parseDate(inputValue);
      if (date && !isNaN(date.getTime()) && !isDateDisabled(date)) {
        onChange(inputValue);
      }
    } else if (inputValue === '') {
      onChange('');
    }
    // Keep invalid values in input but don't update state
  }, [parseDate, isDateDisabled, onChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputChange(e);
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.focus();
    }
  }, [inputRef, setIsOpen, handleInputChange]);

  const handleOutsideClick = (e) => {
    if (
      inputRef.current &&
      !inputRef.current.contains(e.target) &&
      popupRef.current &&
      !popupRef.current.contains(e.target)
    ) {
      setIsOpen(false);
    }
  };
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Today's date for highlighting
  const today = new Date();

  // Generate calendar days for the current month
  const generateCalendar = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysInMonth = lastDay.getDate();
    const days = [];

    // Add empty cells for days before the 1st
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month, day);
      days.push({
        day,
        date: currentDate,
        isToday: isSameDay(currentDate, today),
        isSelected: isSameDay(currentDate, parseDate(value)),
        isDisabled: isDateDisabled(currentDate),
      });
    }

    return { year, month, days };
  };

  const [currentDate, setCurrentDate] = useState(() => {
    if (value) {
      const [year, month] = value.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    return new Date();
  });

  const prevMonth = () => {
    setSlideDir(-1);
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setSlideDir(1);
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const calendar = generateCalendar(currentDate);

  // The month grid, shared between the popup and the inline (always-open) mode.
  const calendarBody = (
    <>
      <div className={`flex items-center justify-between ${inline ? 'mb-5' : 'px-4 pt-4 mb-4'}`}>
        <button
          onClick={prevMonth}
          className="rounded-md border border-line px-2.5 py-1 text-sm font-medium text-ink-muted hover:border-ink-muted hover:text-ink hover:scale-[1.02] active:bg-well active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t('Previous month', 'Bulan sebelumnya')}
        >
          ‹
        </button>
        <h2 className={`font-medium text-ink ${inline ? 'font-serif text-lg' : 'text-sm'}`}>
          {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(currentDate)}
        </h2>
        <button
          onClick={nextMonth}
          className="rounded-md border border-line px-2.5 py-1 text-sm font-medium text-ink-muted hover:border-ink-muted hover:text-ink hover:scale-[1.02] active:bg-well active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={t('Next month', 'Bulan berikutnya')}
        >
          ›
        </button>
      </div>
      <div className={inline ? '' : 'px-4 pb-4'}>
        {/* Month key forces React to remount the grid, replaying the slide-in. */}
        <div key={calendar.year + '-' + calendar.month} className="month-enter" style={{ '--slide-dir': slideDir }}>
        {/* table-fixed: the 7 columns share the table width equally, so day
            numbers line up under their weekday headers instead of shifting to
            fit the widest 3-letter abbreviation in each column. */}
        <table className="w-full table-fixed text-center text-xs">
          <thead>
            <tr>
              {[...Array(7)].map((_, i) => (
                <th key={i} className="pb-2 font-normal text-ink-muted">
                  {dayNames[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Split days into weeks (7 days per week) */}
            {Array.from({ length: Math.ceil(calendar.days.length / 7) }, (_, weekIndex) => {
              const weekDays = calendar.days.slice(weekIndex * 7, weekIndex * 7 + 7);
              return (
                <tr key={weekIndex}>
                  {weekDays.map((day, dayIndex) => {
                    const index = weekIndex * 7 + dayIndex;
                    if (day === null) {
                      return <td key={index}></td>;
                    }
                    return (
                      <td key={index} className={`relative ${inline ? 'h-12' : 'h-10'}`}>
                        <button
                          onClick={() => handleDateSelect(day.date)}
                          disabled={day.isDisabled}
                          className={`flex h-full w-full items-center justify-center rounded-md font-medium text-sm transition-[background-color,border-color,color,transform] duration-150 ${
                            day.isSelected
                              ? 'bg-brand text-on-brand hover:bg-brand-deep'
                              : day.isToday
                                ? 'border-2 border-brand text-brand-strong hover:bg-brand-tint'
                                : 'hover:bg-well-2 hover:text-ink'
                          } ${day.isDisabled ? 'text-ink-muted cursor-not-allowed' : ''}`}
                          aria-label={`${day.isSelected ? t('Selected, ', 'Terpilih, ') : ''}${
                            day.isToday ? t('Today, ', 'Hari ini, ') : ''
                          }${day.isDisabled ? t('Unavailable', 'Tidak tersedia') : ''} ${day.day}`}
                        >
                          {day.day}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );

  // Inline mode: render the calendar directly, always open (no input field).
  if (inline) {
    return <div className="w-full">{calendarBody}</div>;
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value || ''}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          readOnly
          placeholder={placeholderText}
          className={`w-full rounded-md border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted transition-[transform,opacity] duration-200 hover:border-ink-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 focus:scale-[1.02] cursor-pointer`}
          aria-label={t('Date picker', 'Pemilih tanggal')}
          aria-expanded={isOpen}
          aria-controls="date-picker-popup"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 text-ink-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute z-dropdown mt-2 w-full max-w-xs rounded-md border border-line bg-elevated shadow-lg shadow-ink/5"
        >
          {calendarBody}
        </div>
      )}
    </div>
  );
}