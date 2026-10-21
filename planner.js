/* Optional today planner. Task cards and calendar share state.tasks. */
(() => {
  'use strict';
  const S = PomoSchedule, $ = id => document.getElementById(id);
  const panel = $('plannerPanel'), grid = $('plannerGrid'), host = $('plannerEvents'), scroll = $('plannerScroll');
  const scale = 1.5, history = [], fields = ['startTime', 'scheduledDate', 'estimatedMinutes', 'blockId', 'notNow', 'plannerColor', 'name'];
  const palette = { violet: '#9676bd', teal: '#4d9a88', amber: '#b79550', clay: '#b98168' };
  let opened = false, editing = null, returnFocus = null, pending = null, drag = null, suppressClick = 0, autoScroll = null;
  const esc = text => escapeHtml(String(text)).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const today = () => getTodayDate();
  const color = task => palette[task.plannerColor] || getTaskAreaInfo(task)?.color || palette.clay;
  const range = task => `${task.startTime}–${S.time(S.minute(task.startTime) + S.duration(task))}`;
  const status = message => { $('plannerStatus').textContent = message; };
  const inSession = () => ['running', 'paused', 'overflow'].includes(state.status);
  function showTasks() { document.body.classList.add('planner-mobile-tasks'); }
  function open() {
    opened = true; openSidebar();
    document.body.classList.add('planner-open');
    document.body.classList.remove('planner-mobile-tasks');
    panel.inert = false;
    $('plannerEdge').setAttribute('aria-expanded', 'true');
    $('openPlannerBtn').setAttribute('aria-expanded', 'true');
    render();
    if (!scroll.dataset.initialized) {
      scroll.scrollTop = Math.max(0, Math.min(21 * 60, new Date().getHours() * 60 - 60)) * scale;
      scroll.dataset.initialized = 'true';
    }
  }
  function close() {
    opened = false; document.body.classList.remove('planner-open');
    panel.inert = true;
    $('plannerEdge').setAttribute('aria-expanded', 'false');
    $('openPlannerBtn').setAttribute('aria-expanded', 'false');
  }
  function renderFocusPicker() {
    const picker = $('focusTaskSelect');
    const selected = inSession() ? state.activeTaskId || '' : state.focusTaskId;
    const choices = state.tasks.filter(t => !t.completed && !t.notNow);
    picker.innerHTML = '<option value="">No task · just focus</option>' + choices.map(t => `<option value="${esc(t.id)}">${t.isBlock ? 'Block · ' : ''}${esc(t.name)}</option>`).join('');
    picker.value = choices.some(t => t.id === selected) ? selected : '';
    picker.disabled = inSession();
    if (!inSession()) state.focusTaskId = picker.value;
  }
  function render(tasks = state.tasks, preview = {}) {
    if (!host) return;
    if (!drag) renderFocusPicker();
    const events = S.events(tasks, today());
    $('plannerDate').textContent = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
    const minutes = events.reduce((n, t) => n + S.duration(t), 0);
    $('plannerTotal').textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}m planned`;
    const existing = new Map([...host.children].map(el => [el.dataset.eventId, el]));
    events.forEach(task => {
      let node = existing.get(task.id);
      if (!node) { node = document.createElement('div'); node.className = 'calendar-event'; node.dataset.eventId = task.id; host.append(node); }
      existing.delete(task.id);
      node.style.setProperty('--event-color', color(task));
      node.style.top = `${preview.id === task.id && preview.rawTop !== undefined ? preview.rawTop : S.minute(task.startTime) * scale + 2}px`;
      node.style.height = `${Math.max(24, S.duration(task) * scale - 4)}px`;
      node.classList.toggle('completed', !!task.completed);
      node.classList.toggle('calendar-block', !!task.isBlock);
      node.classList.toggle('calendar-short', S.duration(task) <= 30);
      node.classList.toggle('calendar-moving', preview.id === task.id);
      node.classList.toggle('calendar-shifted', preview.shifted?.includes(task.id) || false);
      node.classList.toggle('calendar-nest-hover', preview.nest === task.id);
      const members = tasks.filter(t => t.blockId === task.id);
      const capacity = members.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
      node.innerHTML = `${!task.isBlock ? `<input class="calendar-check" type="checkbox" data-complete="${esc(task.id)}" aria-label="${task.completed ? 'Reopen' : 'Complete'} ${esc(task.name)}" ${task.completed ? 'checked' : ''}>` : ''}
        <button type="button" class="calendar-event-title" data-calendar-drag="${esc(task.id)}" data-event-edit="${esc(task.id)}" aria-label="Edit ${esc(task.name)}, ${range(task)}">${task.isBlock ? '<span aria-hidden="true">▱ </span>' : ''}${esc(task.name)}</button>
        <span class="calendar-event-time">${range(task)} · ${task.isBlock ? 'Block' : S.duration(task) + 'm'}</span>
        ${task.isBlock ? `<div class="calendar-members" data-nest="${esc(task.id)}">${members.map(t => `<label class="calendar-member ${t.completed ? 'completed' : ''}"><input type="checkbox" data-complete="${esc(t.id)}" aria-label="${t.completed ? 'Reopen' : 'Complete'} ${esc(t.name)}" ${t.completed ? 'checked' : ''}><span title="${esc(t.name)}">${esc(t.name)}</span></label>`).join('')}</div>${capacity > S.duration(task) ? '<span class="calendar-capacity" title="Task estimates exceed block duration">Over capacity</span>' : ''}` : ''}
        <button type="button" class="calendar-resize" data-resize="${esc(task.id)}" aria-label="Resize ${esc(task.name)}; click to edit duration"></button>`;
    });
    existing.forEach(node => node.remove());
    $('plannerUndo').hidden = !history.length;
    const now = new Date(), line = $('plannerNow');
    if (line) line.style.top = `${(now.getHours() * 60 + now.getMinutes()) * scale}px`;
    const sync = $('plannerSyncStatus');
    if (sync) sync.textContent = state.todoist.enabled ? 'Todoist · sync on' : 'Todoist · sync paused';
  }
  function commit(result, message) {
    if (!result.ok) { renderTasks(); status(result.error); return false; }
    const previous = new Map(state.tasks.map(t => [t.id, t]));
    const changes = result.tasks.filter(t => !previous.has(t.id) || fields.some(f => t[f] !== previous.get(t.id)[f])).map(t => ({ id: t.id, before: previous.has(t.id) ? Object.fromEntries(fields.map(f => [f, previous.get(t.id)[f]])) : null }));
    history.push(changes); if (history.length > 20) history.shift();
    // Preserve time/completion changes made while a drag was in progress.
    state.tasks = result.tasks.map(t => ({ ...t, ...(previous.has(t.id) ? { actualSeconds: previous.get(t.id).actualSeconds, completed: previous.get(t.id).completed } : {}) }));
    normalizeBlockOrder(); saveToStorage(); renderTasks(); renderAreas(); updateCurrentTaskDisplay();
    status(message || (result.shifted?.length ? `${result.shifted.length} later item${result.shifted.length === 1 ? '' : 's'} moved. Undo is available.` : 'Task list and calendar updated.'));
    return true;
  }
  function undo() {
    const changes = history.pop(); if (!changes) return;
    changes.forEach(change => {
      if (!change.before) state.tasks = state.tasks.filter(t => t.id !== change.id);
      else { const task = state.tasks.find(t => t.id === change.id); if (task) Object.assign(task, change.before); }
    });
    normalizeBlockOrder(); saveToStorage(); renderTasks(); updateCurrentTaskDisplay(); status('Schedule change undone. Tracked time and completion kept.');
  }
  function schedule(id) {
    const task = state.tasks.find(t => t.id === id); if (!task) return;
    open();
    const now = new Date(), from = Math.max(8 * 60, now.getHours() * 60 + now.getMinutes());
    const start = S.firstGap(state.tasks, today(), S.duration(task), from);
    if (start === null) { status('No gap fits this task today. It stays unplanned; shorten its estimate or edit a block.'); return; }
    state.plannedCollapsed = false;
    if (commit(S.place(state.tasks, id, start, today()), `${task.name} placed at ${S.time(start)}. Drag to adjust, or Undo.`)) {
      scroll.scrollTo({ top: Math.max(0, start * scale - 80), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }
  function resize(id, duration) {
    const task = state.tasks.find(t => t.id === id);
    if (task) commit(S.place(state.tasks, id, S.minute(task.startTime), today(), duration));
  }
  function edit(id = null, start = null) {
    const task = state.tasks.find(t => t.id === id);
    editing = { id, newBlock: !task }; returnFocus = document.activeElement;
    $('scheduleTitle').textContent = task ? task.isBlock ? 'Edit block' : 'Task & schedule' : 'New block';
    $('scheduleName').value = task?.name || '';
    $('scheduleDuration').value = task?.estimatedMinutes || (task ? 30 : 60);
    const owner = task && S.owner(task, state.tasks, today());
    $('schedulePlacement').innerHTML = '<option value="unplanned">Unplanned</option><option value="calendar">On calendar</option>' + (!task?.isBlock && task ? state.tasks.filter(t => t.isBlock && !t.completed && !t.notNow && t.id !== id).map(t => `<option value="${esc(t.id)}">Inside ${esc(t.name)}</option>`).join('') : '');
    $('schedulePlacement').value = task?.blockId || (owner || !task ? 'calendar' : 'unplanned');
    const now = new Date();
    $('scheduleStart').value = S.time(start ?? (owner ? S.minute(owner.startTime) : S.firstGap(state.tasks, today(), Number($('scheduleDuration').value), now.getHours() * 60 + now.getMinutes()) ?? 8 * 60));
    $('scheduleColor').value = task?.plannerColor || '';
    $('scheduleError').textContent = '';
    $('scheduleUnplan').hidden = !task;
    $('scheduleMembers').innerHTML = task?.isBlock ? getBlockMembers(id).map(t => `<label class="schedule-member"><input type="checkbox" data-complete="${esc(t.id)}" ${t.completed ? 'checked' : ''}>${esc(t.name)}<button type="button" data-detach="${esc(t.id)}" aria-label="Remove ${esc(t.name)} from block">×</button></label>`).join('') + `<label>Add a task<select id="scheduleAddMember"><option value="">Choose an unplanned task…</option>${state.tasks.filter(t => !t.isBlock && !t.completed && !t.notNow && !t.blockId && !S.owner(t, state.tasks, today())).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>` : '';
    placement(); $('scheduleOverlay').classList.add('active'); $('scheduleOverlay').setAttribute('aria-hidden', 'false');
    $('scheduleName').focus();
  }
  function closeEditor() { $('scheduleOverlay').classList.remove('active'); $('scheduleOverlay').setAttribute('aria-hidden', 'true'); editing = null; if (returnFocus?.isConnected) returnFocus.focus(); }
  function placement() { $('scheduleStartLabel').hidden = $('schedulePlacement').value !== 'calendar'; $('scheduleStart').required = !$('scheduleStartLabel').hidden; }
  function saveEditor(event) {
    event.preventDefault(); if (!editing) return;
    const tasks = state.tasks.map(t => ({ ...t }));
    let task = tasks.find(t => t.id === editing.id);
    if (!task) { task = { id: generateTaskId(), isBlock: true, actualSeconds: 0, completed: false, createdAt: Date.now(), notes: '', goalId: null }; tasks.push(task); }
    task.name = $('scheduleName').value.trim(); task.estimatedMinutes = Number($('scheduleDuration').value); task.plannerColor = $('scheduleColor').value;
    if (!task.name || !Number.isFinite(task.estimatedMinutes) || task.estimatedMinutes < 5 || task.estimatedMinutes > 1440) { $('scheduleError').textContent = 'Add a name and a duration between 5 and 1440 minutes.'; return; }
    const where = $('schedulePlacement').value;
    const result = where === 'calendar' ? S.place(tasks, task.id, S.minute($('scheduleStart').value), today()) : where === 'unplanned' ? S.unplan(tasks, task.id) : S.nest(tasks, task.id, where);
    if (!result.ok) { $('scheduleError').textContent = result.error; return; }
    commit(result); closeEditor(); if (where === 'calendar') open();
  }
  function complete(event) {
    const id = event.target.dataset.complete; if (!id) return;
    if (event.target.checked) completeTaskById(id); else uncompleteTaskById(id);
    render();
  }
  function previewMove(x, y) {
    if (!drag) return;
    drag.x = x; drag.y = y;
    const bounds = grid.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
    const inGrid = x >= bounds.left + 36 && x <= bounds.right && y >= viewport.top && y <= viewport.bottom;
    const hit = document.elementFromPoint(x, y);
    const nest = hit?.closest('[data-nest]')?.dataset.nest;
    const task = drag.base.find(t => t.id === drag.id);
    const unschedule = hit?.closest('[data-section="unplannedCollapsed"]');
    let result, start;
    if (drag.resize) {
      const duration = Math.max(15, Math.round((drag.duration + (y - drag.y0 + scroll.scrollTop - drag.scroll0) / scale) / 15) * 15);
      result = S.place(drag.base, drag.id, drag.start, today(), duration);
    } else if (unschedule) result = S.unplan(drag.base, drag.id);
    else if (inGrid && nest && nest !== drag.id && !task.isBlock) result = S.nest(drag.base, drag.id, nest);
    else if (inGrid) { start = Math.max(0, Math.round((y - bounds.top - drag.offset) / scale / 15) * 15); result = S.place(drag.base, drag.id, start, today()); }
    else result = { ok: false, error: 'Drop on a time, inside a block, or on Unplanned.' };
    drag.result = result;
    if (result.ok) render(result.tasks, { id: nest || unschedule ? null : drag.id, shifted: result.shifted, nest: nest && !task.isBlock ? nest : null, ...(start !== undefined ? { rawTop: Math.max(0, y - bounds.top - drag.offset) } : {}) });
    $('plannerGuide').hidden = !inGrid || start === undefined;
    if (!$('plannerGuide').hidden) { $('plannerGuide').style.top = `${start * scale}px`; $('plannerGuide').textContent = S.time(start); }
    status(result.ok ? nest && !task.isBlock ? `Add to ${drag.base.find(t => t.id === nest)?.name}.` : result.shifted?.length ? `${result.shifted.length} later items will move.` : 'Release to update both views.' : result.error);
  }
  function finish(cancel = false) {
    if (autoScroll) cancelAnimationFrame(autoScroll); autoScroll = null;
    const result = drag?.result; drag = null; pending = null;
    document.body.classList.remove('planner-dragging'); $('plannerGuide').hidden = true;
    if (!cancel && result?.ok) commit(result); else render();
  }
  function autoScrollDrag() {
    if (!drag) return;
    const bounds = scroll.getBoundingClientRect();
    if (drag.x >= bounds.left && drag.x <= bounds.right) {
      const delta = drag.y < bounds.top + 35 ? -10 : drag.y > bounds.bottom - 35 ? 10 : 0;
      if (delta) { scroll.scrollTop += delta; previewMove(drag.x, drag.y); }
    }
    autoScroll = requestAnimationFrame(autoScrollDrag);
  }
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || editing) return;
    if (event.target.closest('input,label,select')) return;
    const grip = event.target.closest('[data-calendar-drag],[data-resize],[data-planner-drag]') || event.target.closest('.calendar-event');
    if (!grip) return;
    const id = grip.dataset.calendarDrag || grip.dataset.resize || grip.dataset.plannerDrag || grip.dataset.eventId;
    const task = state.tasks.find(t => t.id === id); if (!task) return;
    if (grip.dataset.plannerDrag && !opened) open();
    const node = grip.closest('.calendar-event');
    pending = { id, pointer: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, scroll0: scroll.scrollTop, offset: node ? event.clientY - node.getBoundingClientRect().top : 12, resize: !!grip.dataset.resize, start: S.minute(task.startTime), duration: S.duration(task), base: state.tasks.map(t => ({ ...t })) };
  });
  document.addEventListener('pointermove', event => {
    if (!pending && !drag) return;
    if (!drag) {
      if (Math.hypot(event.clientX - pending.x0, event.clientY - pending.y0) < 5) return;
      drag = pending; pending = null; document.body.setPointerCapture(event.pointerId);
      document.body.classList.add('planner-dragging'); autoScroll = requestAnimationFrame(autoScrollDrag);
    }
    event.preventDefault(); previewMove(event.clientX, event.clientY);
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (!drag) { pending = null; return; }
    suppressClick = performance.now() + 250;
    if (document.body.hasPointerCapture(event.pointerId)) document.body.releasePointerCapture(event.pointerId);
    finish();
  });
  document.addEventListener('pointercancel', () => finish(true));
  document.addEventListener('dragstart', event => { if (pending || (drag && !draggedTaskId)) event.preventDefault(); }, true);
  // Existing desktop list dragging remains available alongside touch drag grips.
  grid.addEventListener('dragover', event => {
    if (!draggedTaskId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    if (!drag) { const task = state.tasks.find(t => t.id === draggedTaskId); if (!task) return; drag = { id: task.id, base: state.tasks.map(t => ({ ...t })), offset: 12 }; }
    previewMove(event.clientX, event.clientY);
  });
  grid.addEventListener('drop', event => { if (!drag) return; event.preventDefault(); event.stopPropagation(); finish(); });
  document.addEventListener('dragend', () => { if (drag) finish(true); });
  panel.addEventListener('click', event => {
    if (performance.now() < suppressClick) return;
    const editButton = event.target.closest('[data-event-edit],[data-resize]');
    if (editButton) edit(editButton.dataset.eventEdit || editButton.dataset.resize);
    else if (event.target === grid || event.target === host) edit(null, Math.max(0, Math.min(1380, Math.round((event.clientY - grid.getBoundingClientRect().top) / scale / 15) * 15)));
  });
  panel.addEventListener('change', complete); $('scheduleMembers').addEventListener('change', event => {
    complete(event);
    if (event.target.id === 'scheduleAddMember' && event.target.value && editing?.id) { commit(S.nest(state.tasks, event.target.value, editing.id)); edit(editing.id); }
  });
  $('scheduleMembers').addEventListener('click', event => { const button = event.target.closest('[data-detach]'); if (button) { commit(S.unplan(state.tasks, button.dataset.detach)); edit(editing.id); } });
  $('plannerEdge').addEventListener('click', open); $('openPlannerBtn').addEventListener('click', open);
  $('closePlannerBtn').addEventListener('click', close); $('plannerTasksBtn').addEventListener('click', () => { openSidebar(); showTasks(); });
  $('newPlannerBlock').addEventListener('click', () => edit()); $('plannerUndo').addEventListener('click', undo);
  $('scheduleClose').addEventListener('click', closeEditor); $('schedulePlacement').addEventListener('change', placement);
  $('scheduleForm').addEventListener('submit', saveEditor);
  $('scheduleUnplan').addEventListener('click', () => { if (editing?.id) commit(S.unplan(state.tasks, editing.id), 'Unplanned. Duration and tracked time kept.'); closeEditor(); });
  $('scheduleOverlay').addEventListener('click', event => { if (event.target === $('scheduleOverlay')) closeEditor(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (editing || drag)) { event.preventDefault(); event.stopImmediatePropagation(); if (editing) closeEditor(); if (drag) finish(true); }
    if (event.key === 'Tab' && editing) {
      const controls = [...$('scheduleForm').querySelectorAll('button,input,select')].filter(el => !el.disabled && el.getClientRects().length);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }
  }, true);
  $('focusTaskSelect').addEventListener('change', event => {
    if (inSession()) return;
    state.focusTaskId = event.target.value; state.activeTaskId = null; state.activeBlockId = null;
  });
  $('plannerHours').innerHTML = Array.from({ length: 24 }, (_, h) => `<div class="planner-hour" style="top:${h * 60 * scale}px"><span>${String(h).padStart(2, '0')}:00</span></div>`).join('') + '<div id="plannerNow" class="planner-now" aria-label="Current time"></div>';
  const sync = document.createElement('div'); sync.id = 'plannerSyncStatus'; sync.className = 'planner-sync'; $('sidebarPanel').append(sync);
  window.PomoPlanner = { render, open, close, showTasks, schedule, resize, edit, color, undo, isDragging: () => !!drag };
  elements.sidebarPanel.inert = !state.sidebarOpen;
  renderTasks();
})();
