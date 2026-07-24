/**
 * ============================================================
 * FAST-NUCES Multan — Attendance System
 * Shared Client Library (Stage 2)
 * ============================================================
 * Include this AFTER the Supabase CDN script in every portal page:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="db-client.js"></script>
 *
 * Then every page can call: DB.login(...), DB.listEmployees(), etc.
 * ============================================================
 */

// ──────────────────────────────────────────────────────────────
// CONFIG — fetched at runtime from /api/config, never hardcoded here.
// Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel's Environment
// Variables panel (Project Settings → Environment Variables).
// ──────────────────────────────────────────────────────────────
let supabaseClient = null;
let _readyResolve;
const _ready = new Promise(resolve => { _readyResolve = resolve; });

(async function initSupabase() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (!cfg.url || !cfg.anonKey) {
      console.error('Supabase config missing — check environment variables in Vercel.');
      return;
    }
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  } catch (e) {
    console.error('Failed to load Supabase config:', e.message);
  } finally {
    _readyResolve();
  }
})();

const _DB_impl = {

  // ============================================================
  // AUTH
  // ============================================================
  async login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    const profile = await this.getMyProfile();
    return { success: true, session: data.session, profile };
  },

  async logout() {
    await supabaseClient.auth.signOut();
  },

  async getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  async getMyProfile() {
    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData?.user) return null;
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', userData.user.id)
      .single();
    if (error) return null;
    return data;
  },

  async changePassword(newPassword) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    return error ? { success: false, message: error.message } : { success: true };
  },

  async sendPasswordReset(email) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
    return error ? { success: false, message: error.message } : { success: true };
  },

  onAuthChange(callback) {
    supabaseClient.auth.onAuthStateChange((event, session) => callback(event, session));
  },

  // ============================================================
  // DEPARTMENTS
  // ============================================================
  async listDepartments() {
    const { data, error } = await supabaseClient.from('departments').select('*, shifts(name)').order('name');
    return error ? [] : data;
  },

  async addDepartment(name, defaultShiftId) {
    const { data, error } = await supabaseClient.from('departments').insert({ name, default_shift_id: defaultShiftId }).select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async updateDepartmentShift(departmentId, shiftId) {
    const { error } = await supabaseClient.from('departments').update({ default_shift_id: shiftId }).eq('id', departmentId);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // SHIFTS
  // ============================================================
  async listShifts() {
    const { data, error } = await supabaseClient.from('shifts').select('*').order('name');
    return error ? [] : data;
  },

  async addShift(shift) {
    // shift = { name, start_time, end_time, grace_minutes, target_hours }
    const { data, error } = await supabaseClient.from('shifts').insert(shift).select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async updateShift(id, fields) {
    const { error } = await supabaseClient.from('shifts').update(fields).eq('id', id);
    return error ? { success: false, message: error.message } : { success: true };
  },

  async deleteShift(id) {
    const { error } = await supabaseClient.from('shifts').delete().eq('id', id);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // EMPLOYEES
  // ============================================================
  async listEmployees(departmentId = null) {
    let q = supabaseClient.from('employees').select('*, departments(name), shifts(name)').order('name');
    if (departmentId) q = q.eq('department_id', departmentId);
    const { data, error } = await q;
    return error ? [] : data;
  },

  async addEmployee(emp) {
    // emp = { emp_id, name, department_id, email, phone, designation, shift_id }
    const cleaned = { ...emp, phone: emp.phone?.trim() || null, email: emp.email?.trim() || null, designation: emp.designation?.trim() || null };
    const { data, error } = await supabaseClient.from('employees').insert(cleaned).select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async updateEmployee(empId, fields) {
    const { error } = await supabaseClient.from('employees').update(fields).eq('emp_id', empId);
    return error ? { success: false, message: error.message } : { success: true };
  },

  async deactivateEmployee(empId) {
    const { error } = await supabaseClient.from('employees').update({ active: false }).eq('emp_id', empId);
    return error ? { success: false, message: error.message } : { success: true };
  },

  async deleteEmployee(empId) {
    const { error } = await supabaseClient.from('employees').delete().eq('emp_id', empId);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // OFF DAYS  (0=Sunday ... 6=Saturday)
  // ============================================================
  async getEmployeeOffDays(empId) {
    const { data, error } = await supabaseClient.from('employee_off_days').select('day_of_week').eq('emp_id', empId);
    return error ? [] : data.map(r => r.day_of_week);
  },

  async setEmployeeOffDays(empId, daysArray) {
    await supabaseClient.from('employee_off_days').delete().eq('emp_id', empId);
    if (daysArray.length === 0) return { success: true };
    const rows = daysArray.map(d => ({ emp_id: empId, day_of_week: d }));
    const { error } = await supabaseClient.from('employee_off_days').insert(rows);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // DEVICES  (ZKTeco machines — SuperAdmin only)
  // ============================================================
  async listDevices() {
    const { data, error } = await supabaseClient.from('devices').select('*').order('name');
    return error ? [] : data;
  },

  async addDevice(serialNumber, name, location) {
    const { data, error } = await supabaseClient.from('devices').insert({ serial_number: serialNumber, name, location }).select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async removeDevice(id) {
    const { error } = await supabaseClient.from('devices').delete().eq('id', id);
    return error ? { success: false, message: error.message } : { success: true };
  },

  async toggleDevice(id, active) {
    const { error } = await supabaseClient.from('devices').update({ active }).eq('id', id);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // ATTENDANCE
  // ============================================================
  async getAttendance(empId, startDate, endDate) {
    const { data, error } = await supabaseClient
      .from('attendance').select('*')
      .eq('emp_id', empId)
      .gte('date', startDate).lte('date', endDate)
      .order('date');
    return error ? [] : data;
  },

  async getDepartmentAttendance(departmentId, startDate, endDate) {
    const { data, error } = await supabaseClient
      .from('attendance')
      .select('*, employees!inner(name, designation, department_id)')
      .eq('employees.department_id', departmentId)
      .gte('date', startDate).lte('date', endDate)
      .order('date');
    return error ? [] : data;
  },

  async updateAttendanceRecord(empId, date, fields) {
    const { error } = await supabaseClient
      .from('attendance')
      .upsert({ emp_id: empId, date, ...fields }, { onConflict: 'emp_id,date' });
    return error ? { success: false, message: error.message } : { success: true };
  },

  // Live "my week / my month" widget
  async getLiveHours(empId) {
    const { data, error } = await supabaseClient.from('employee_live_hours').select('*').eq('emp_id', empId).maybeSingle();
    return error ? null : data;
  },

  // 3-month trend for charts
  async getAttendanceTrend(empId) {
    const { data, error } = await supabaseClient.from('attendance_trend').select('*').eq('emp_id', empId).order('month');
    return error ? [] : data;
  },

  // Full report (per employee, for a date range) — calls the SQL function from Stage 1 patch
  async getEmployeeReport(empId, startDate, endDate) {
    const { data, error } = await supabaseClient.rpc('get_employee_report', {
      p_emp_id: empId, p_start: startDate, p_end: endDate
    });
    return error ? null : (data && data[0] ? data[0] : null);
  },

  // Whole-department report — runs the function once per employee
  async getDepartmentReport(departmentId, startDate, endDate) {
    const employees = await this.listEmployees(departmentId);
    const results = [];
    for (const emp of employees) {
      const r = await this.getEmployeeReport(emp.emp_id, startDate, endDate);
      if (r) results.push(r);
    }
    return results;
  },

  // ============================================================
  // LEAVES
  // ============================================================
  async applyLeave(empId, leaveDate, leaveType, reason) {
    const { data, error } = await supabaseClient
      .from('leaves')
      .insert({ emp_id: empId, leave_date: leaveDate, leave_type: leaveType, reason })
      .select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async listLeaves(filters = {}) {
    let q = supabaseClient.from('leaves').select('*, employees(name, department_id)').order('created_at', { ascending: false });
    if (filters.empId) q = q.eq('emp_id', filters.empId);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    return error ? [] : data;
  },

  async decideLeave(leaveId, status, comment, decidedByUsername) {
    const { error } = await supabaseClient
      .from('leaves')
      .update({ status, decision_comment: comment, decided_by: decidedByUsername, decided_at: new Date().toISOString() })
      .eq('id', leaveId);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // CORRECTIONS  (mobile-friendly punch correction requests)
  // ============================================================
  async requestCorrection(empId, recordDate, requestedCheckIn, requestedCheckOut, comment) {
    const { data, error } = await supabaseClient
      .from('corrections')
      .insert({
        emp_id: empId, record_date: recordDate,
        requested_check_in: requestedCheckIn || null,
        requested_check_out: requestedCheckOut || null,
        employee_comment: comment
      }).select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async listCorrections(filters = {}) {
    let q = supabaseClient.from('corrections').select('*, employees(name, department_id)').order('created_at', { ascending: false });
    if (filters.empId) q = q.eq('emp_id', filters.empId);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    return error ? [] : data;
  },

  async decideCorrection(correctionId, status, comment, decidedByUsername) {
    const { error } = await supabaseClient
      .from('corrections')
      .update({ status, decision_comment: comment, decided_by: decidedByUsername, decided_at: new Date().toISOString() })
      .eq('id', correctionId);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  async listNotifications(username, unreadOnly = false) {
    let q = supabaseClient.from('notifications').select('*').eq('recipient_username', username).order('created_at', { ascending: false });
    if (unreadOnly) q = q.eq('is_read', false);
    const { data, error } = await q;
    return error ? [] : data;
  },

  async markNotificationRead(id) {
    const { error } = await supabaseClient.from('notifications').update({ is_read: true }).eq('id', id);
    return error ? { success: false, message: error.message } : { success: true };
  },

  async markAllNotificationsRead(username) {
    const { error } = await supabaseClient.from('notifications').update({ is_read: true }).eq('recipient_username', username).eq('is_read', false);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // Real-time: fires callback the instant a new notification arrives, no refresh needed
  subscribeNotifications(username, callback) {
    return supabaseClient
      .channel('notifications-' + username)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_username=eq.${username}` },
        payload => callback(payload.new)
      )
      .subscribe();
  },

  // ============================================================
  // CALENDAR SETTINGS  (holidays, working weekends, short days)
  // ============================================================
  async listCalendarSettings() {
    const { data, error } = await supabaseClient.from('calendar_settings').select('*').order('date');
    return error ? [] : data;
  },

  async addCalendarSetting(date, type, description, targetHours = null) {
    const { data, error } = await supabaseClient
      .from('calendar_settings')
      .upsert({ date, type, description, target_hours: targetHours }, { onConflict: 'date' })
      .select().single();
    return error ? { success: false, message: error.message } : { success: true, data };
  },

  async deleteCalendarSetting(date) {
    const { error } = await supabaseClient.from('calendar_settings').delete().eq('date', date);
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // HOD REASSIGNMENT  (SuperAdmin only — tenure changes)
  // ============================================================
  async reassignHod(departmentId, newHodUsername) {
    const { error } = await supabaseClient.rpc('reassign_hod', {
      p_department_id: departmentId, p_new_hod_username: newHodUsername
    });
    return error ? { success: false, message: error.message } : { success: true };
  },

  // ============================================================
  // AUDIT LOGS
  // ============================================================
  async listAuditLogs(limit = 200) {
    const { data, error } = await supabaseClient.from('audit_logs').select('*').order('changed_at', { ascending: false }).limit(limit);
    return error ? [] : data;
  },

  // ============================================================
  // USER / PROFILE MANAGEMENT  (SuperAdmin creating HOD/Employee logins)
  // ============================================================
  // Note: creating a brand-new login (auth.users row) requires the
  // Supabase Admin API which needs a service_role key — that key must
  // NEVER be placed in frontend code. New logins are created from the
  // Supabase Dashboard (Authentication → Users → Add user), the same
  // way you created your SuperAdmin login. Once created, use this to
  // assign their role/department/emp_id:
  async setUserRole(username, role, departmentId = null, empId = null) {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ role, department_id: departmentId, emp_id: empId })
      .eq('username', username);
    return error ? { success: false, message: error.message } : { success: true };
  },

  async listAllProfiles() {
    const { data, error } = await supabaseClient.from('profiles').select('*, departments(name)').order('username');
    return error ? [] : data;
  },

  // ============================================================
  // ACCOUNT MANAGEMENT  (SuperAdmin only — via secure backend endpoints)
  // ============================================================
  async getAccessToken() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token;
  },

  async createUserAccount(payload) {
    const token = await this.getAccessToken();
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async resetUserPassword(targetUserId, newPassword) {
    const token = await this.getAccessToken();
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ targetUserId, newPassword })
    });
    return res.json();
  },

  async cleanupOldAuditLogs() {
    const { error } = await supabaseClient.rpc('cleanup_old_audit_logs');
    return error ? { success: false, message: error.message } : { success: true };
  },
};

// Wraps every DB method so it automatically waits for the Supabase
// client to finish initializing (from /api/config) before running —
// no need to manually await readiness anywhere else in the app.
const DB = new Proxy(_DB_impl, {
  get(target, prop) {
    const orig = target[prop];
    if (typeof orig === 'function') {
      return async function (...args) {
        await _ready;
        return orig.apply(target, args);
      };
    }
    return orig;
  }
});

window.DB = DB;
