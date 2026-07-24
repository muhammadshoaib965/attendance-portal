const { verifySuperAdmin } = require('../_utils');

// SuperAdmin only — deletes the actual Supabase Auth login (which
// cascades to remove their profile row automatically). This is the
// correct way to free up an email address for reuse; deleting from
// the employees or profiles table alone does NOT do this.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  let body = '';
  for await (const chunk of req) body += chunk;
  let data;
  try { data = JSON.parse(body || '{}'); } catch { return res.status(400).json({ success: false, message: 'Invalid request body.' }); }

  const { targetUserId } = data;
  if (!targetUserId) return res.status(400).json({ success: false, message: 'Missing target user.' });

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`, {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });
    if (!r.ok) {
      const result = await r.json().catch(() => ({}));
      return res.status(400).json({ success: false, message: result.msg || 'Failed to delete account.' });
    }
    res.status(200).json({ success: true, message: 'Login account deleted. The email is now free to reuse.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
