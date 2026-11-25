// Small stroke icons (24px grid) for the staff navigation. Decorative: always hidden from screen readers.
const P = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  deals: <><path d="M3 7h18v12H3z" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>,
  testdrives: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 3v6.5M4.5 16l5.2-2.6M19.5 16l-5.2-2.6" /></>,
  tradeins: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
  exceptions: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.2v.1" /></>,
  payments: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></>,
  invoices: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  catalogue: <><path d="M4 16l1.6-5.2A2 2 0 0 1 7.5 9.4h9a2 2 0 0 1 1.9 1.4L20 16" /><path d="M3 16h18v3H3z" /><circle cx="7.5" cy="19" r="0.6" /><circle cx="16.5" cy="19" r="0.6" /></>,
  inventory: <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  delivery: <><path d="M2 6h11v10H2zM13 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  owners: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></>,
  reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c1.9.7 3.2 2.5 3.5 5.3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5l1.5 1.2-1.8 3.1-1.8-.6a7.6 7.6 0 0 1-1.7 1l-.3 1.9H10.7l-.3-1.9a7.6 7.6 0 0 1-1.7-1l-1.8.6-1.8-3.1 1.5-1.2a7.800 7.800 0 0 1 0-2l-1.5-1.2 1.8-3.1 1.8.6a7.6 7.6 0 0 1 1.7-1l.3-1.9h3.6l.3 1.9a7.6 7.6 0 0 1 1.7 1l1.800-.6 1.8 3.1-1.500 1.200a7.800 7.800 0 0 1 0 2z" /></>,
  audit: <><path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6z" /><path d="M8.500 12l2.500 2.500 4.500-5" /></>,
  data_requests: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></>,
  outbox: <><path d="M3 6h18v12H3z" /><path d="M3 7l9 6 9-6" /></>,
  backups: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.700 3.600 3 8 3s8-1.300 8-3V6M4 12v6c0 1.700 3.600 3 8 3s8-1.300 8-3v-6" /></>,
};
export function Icon({ name, size = 18, className }) {
  return <svg aria-hidden="true" focusable="false" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{P[name] || P.dashboard}</svg>;
}
