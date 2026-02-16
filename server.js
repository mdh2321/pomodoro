const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TODOIST_API = 'https://api.todoist.com/api/v1';

// Serve static files
app.use(express.static(path.join(__dirname)));

// Extract Todoist token from request header
function getToken(req) {
  const auth = req.headers['x-todoist-token'];
  if (!auth) {
    return null;
  }
  return auth;
}

// Proxy: Validate token
app.get('/api/todoist/validate', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const resp = await fetch(`${TODOIST_API}/projects`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: 'Invalid token' });
    res.json({ valid: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: Get today's tasks
app.get('/api/todoist/tasks', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    // Fetch all tasks with pagination (API returns max 50 per page)
    let allTasks = [];
    let cursor = null;

    while (true) {
      const url = cursor
        ? `${TODOIST_API}/tasks?cursor=${encodeURIComponent(cursor)}`
        : `${TODOIST_API}/tasks`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error(`Todoist API error (${resp.status}):`, body);
        return res.status(resp.status).json({ error: 'Failed to fetch tasks' });
      }

      const data = await resp.json();
      const tasks = Array.isArray(data) ? data : (data.results || data.items || []);
      allTasks = allTasks.concat(tasks);

      // Check for next page cursor
      cursor = data.next_cursor || null;
      if (!cursor || tasks.length === 0) break;
    }

    const tasks = allTasks;

    // Filter server-side: only tasks due today or overdue
    // v1 API due.date can be "2026-02-17" or "2026-02-17T13:30:00" or "2026-02-17T09:00:00Z"
    // Use Australia/Sydney timezone to match the user's local date
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
    const getDatePart = (d) => d ? d.split('T')[0] : null;
    const todayTasks = tasks.filter(t => {
      const dueDate = getDatePart(t.due?.date);
      const deadlineDate = getDatePart(t.deadline?.date);
      if (dueDate && dueDate <= today) return true;
      if (deadlineDate && deadlineDate <= today) return true;
      return false;
    });

    console.log(`Todoist: ${tasks.length} total tasks, ${todayTasks.length} due today/overdue (${today})`);
    res.json(todayTasks);
  } catch (e) {
    console.error('Todoist fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Proxy: Close (complete) a task
app.post('/api/todoist/tasks/:id/close', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const resp = await fetch(`${TODOIST_API}/tasks/${req.params.id}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: 'Failed to close task' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: Reopen a task
app.post('/api/todoist/tasks/:id/reopen', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const resp = await fetch(`${TODOIST_API}/tasks/${req.params.id}/reopen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) return res.status(resp.status).json({ error: 'Failed to reopen task' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🍅 Pomo server running at http://localhost:${PORT}`);
});
