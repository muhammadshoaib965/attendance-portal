// Shared helper: confirms the request carries a valid session belonging
// to a SuperAdmin before allowing any admin-only action to proceed.
async function verifySuperAdmin(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, message: 'Missing authorization token.' };

  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return { ok: false, status: 401, message: 'Invalid or expired session.' };
  const user = await userRes.json();

  const profRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
  });
  const profiles = await profRes.json();
  if (!profiles.length || profiles[0].role !== 'SuperAdmin') {
    return { ok: false, status: 403, message: 'Only SuperAdmin can perform this action.' };
  }
  return { ok: true, userId: user.id };
}

module.exports = { verifySuperAdmin };
