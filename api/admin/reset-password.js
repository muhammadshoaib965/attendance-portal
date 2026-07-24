const { verifySuperAdmin } = require('../_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const auth = await verifySuperAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  let body = '';
  for await (const chunk of req) body += chunk;
  let data;
  try { data = JSON.parse(body || '{}'); } catch { return res.status(400).json({ success: false, message: 'Invalid request body.' }); }

  const { targetUserId, newPassword } = data;
  if (!targetUserId || !newPassword) return res.status(400).json({ success: false, message: 'Missing target user or new password.' });
  if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ password: newPassword })
    });
    const result = await r.json();
    if (!r.ok) return res.status(400).json({ success: false, message: result.msg || 'Failed to reset password.' });
    res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
