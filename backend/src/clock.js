// Injectable clock so time-dependent rules (expiry, reminders, aging) can be tested.
let offsetNow = null;
module.exports = {
  now: () => (offsetNow ? new Date(offsetNow) : new Date()),
  set: (d) => { offsetNow = d ? new Date(d) : null; },
  iso: () => (offsetNow ? new Date(offsetNow) : new Date()).toISOString(),
};
