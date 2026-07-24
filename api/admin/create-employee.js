const { verifyAdminOrHod } = require('../_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed.' });

  const auth = await verifyAdminOrHod(req);
  if (!auth.ok) return res.status(auth.status).json({ success: false, message: auth.message });

  let body = '';
  for await (const chunk of req) body += chunk;
  let data;
  try { data = JSON.parse(body || '{}'); } catch { return res.status(400).json({ success: false, message: 'Invalid request body.' }); }

  const { emp_id, name, department_id, designation, email, phone, shift_id, role, password, username } = data;

  if (!emp_id || !name || !department_id) return res.status(400).json({ success: false, message: 'Employee ID, name, and department are required.' });

  // HOD can only ever add people into their own department, and cannot create SuperAdmins
  if (auth.role === 'HOD') {
    if (String(department_id) !== String(auth.departmentId)) {
      return res.status(403).json({ success: false, message: 'HODs can only add employees to their own department.' });
    }
    if (role === 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Only SuperAdmin can create a SuperAdmin account.' });
    }
  }

  const svcHeaders = {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };

  try {
    // 1. Create the employee record
    const empRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/employees`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        emp_id, name, department_id, designation: designation || null,
        email: email || null, phone: phone || null, shift_id: shift_id || null
      })
    });
    const empResult = await empRes.json();
    if (!empRes.ok) {
      const msg = Array.isArray(empResult) ? '' : (empResult.message || '');
      return res.status(400).json({ success: false, message: msg.includes('duplicate') ? 'This Employee ID already exists.' : (msg || 'Failed to create employee record.') });
    }

    // 2. If no login requested, we're done — just the HR record was created
    if (!email || !password || !role) {
      return res.status(200).json({ success: true, message: 'Employee record created (no login account requested).' });
    }

    // 3. Create their login account
    const createRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({
        email, password, email_confirm: true,
        user_metadata: { username: username || emp_id, role, full_name: name }
      })
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      // Roll back the employee record so we don't leave an orphaned HR row with a broken login
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/employees?emp_id=eq.${encodeURIComponent(emp_id)}`, { method: 'DELETE', headers: svcHeaders });
      return res.status(400).json({ success: false, message: created.msg || created.error_description || 'Failed to create login — employee record rolled back.' });
    }

    // 4. Link the auto-created profile row to this department/employee
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${created.id}`, {
      method: 'PATCH',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ department_id, emp_id })
    });

    res.status(200).json({ success: true, message: 'Employee and login account created successfully.', userId: created.id });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
