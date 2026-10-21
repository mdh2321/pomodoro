/* Shared schedule model. All times are local minutes in the current day. */
(function (root) {
  'use strict';
  const minute = value => {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
    const [h, m] = value.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  };
  const time = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const duration = t => Number(t.estimatedMinutes) > 0 ? Number(t.estimatedMinutes) : 30;
  const events = (tasks, date) => tasks.filter(t => !t.blockId && !t.notNow && t.scheduledDate === date && minute(t.startTime) !== null);
  function owner(task, tasks, date) {
    const event = task.blockId ? tasks.find(t => t.id === task.blockId && t.isBlock) : task;
    return event && !event.notNow && event.scheduledDate === date && minute(event.startTime) !== null ? event : null;
  }
  function firstGap(tasks, date, length, from) {
    let cursor = Math.max(0, Math.ceil(from / 15) * 15);
    for (const event of events(tasks, date).sort((a, b) => minute(a.startTime) - minute(b.startTime))) {
      const start = minute(event.startTime), end = start + duration(event);
      if (end <= cursor) continue;
      if (cursor + length <= start) return cursor;
      cursor = Math.ceil(end / 15) * 15;
    }
    return cursor + length <= 1440 ? cursor : null;
  }
  function place(source, id, start, date, length) {
    const tasks = source.map(t => ({ ...t }));
    const task = tasks.find(t => t.id === id);
    const span = Number(length ?? (task && duration(task)));
    if (!task || !Number.isFinite(start) || !Number.isFinite(span) || span < 5 || start < 0 || start + span > 1440) {
      return { ok: false, error: 'Choose a time and duration that fit within today.' };
    }
    task.blockId = undefined; task.notNow = false; task.startTime = time(start);
    task.scheduledDate = date; task.estimatedMinutes = span;
    let cursor = start + span;
    const shifted = [];
    for (const other of events(tasks, date).filter(t => t.id !== id).sort((a, b) => minute(a.startTime) - minute(b.startTime))) {
      const otherStart = minute(other.startTime), otherEnd = otherStart + duration(other);
      if (otherEnd <= start) continue;
      if (otherStart < cursor) {
        if (cursor + duration(other) > 1440) return { ok: false, error: 'This would push an item past midnight. Try an earlier time or a shorter duration.' };
        other.startTime = time(cursor); shifted.push(other.id);
      }
      cursor = minute(other.startTime) + duration(other);
      if (cursor > 1440) return { ok: false, error: 'This would push an item past midnight. Try an earlier time or a shorter duration.' };
    }
    return { ok: true, tasks, shifted };
  }
  function nest(source, id, blockId) {
    const tasks = source.map(t => ({ ...t }));
    const task = tasks.find(t => t.id === id), block = tasks.find(t => t.id === blockId);
    if (!task || task.isBlock || !block?.isBlock || block.completed || block.notNow) return { ok: false, error: 'Drop a task into an open block.' };
    task.blockId = blockId; task.startTime = undefined; task.scheduledDate = undefined; task.notNow = false;
    return { ok: true, tasks, shifted: [] };
  }
  function unplan(source, id) {
    const tasks = source.map(t => ({ ...t })), task = tasks.find(t => t.id === id);
    if (!task) return { ok: false, error: 'Task not found.' };
    task.blockId = undefined; task.startTime = undefined; task.scheduledDate = undefined;
    return { ok: true, tasks, shifted: [] };
  }
  const api = { minute, time, duration, events, owner, firstGap, place, nest, unplan };
  root.PomoSchedule = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
