const { verifySuperAdmin } = require('../_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  let body = '';
  for await (const chunk of req) body += chunk;
  let data;
  try { data = JSON.parse(body || '{}'); } catch { return res.status(400).json({ success: false, message: 'Invalid request body.' }); }

  const { email, password, username, role, department_id, emp_id, full_name } = data;
  if (!email || !password || !username || !role) {
    return res.status(400).json({ success: false, message: 'Email, password, username, and role are all required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    const createRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        email, password, email_confirm: true,
        user_metadata: { username, role, full_name: full_name || username }
      })
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      return res.status(400).json({ success: false, message: created.msg || created.error_description || 'Failed to create account.' });
    }

    // The auto-profile trigger sets username/role/full_name — now link department/employee too
    if (department_id || emp_id) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${created.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ department_id: department_id || null, emp_id: emp_id || null })
      });
    }

    res.status(200).json({ success: true, message: 'Account created successfully.', userId: created.id });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
