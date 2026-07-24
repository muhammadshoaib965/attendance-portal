/**
 * Vercel Serverless Function — ZKTeco ADMS endpoint
 * Handles: device registration (GET) and real-time punch push (POST)
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from Vercel's
 * Environment Variables (Project Settings → Environment Variables) —
 * never hardcoded here, so this file is safe to commit publicly.
 */

function parseAttlogLine(line) {
  const parts = line.trim().split('\t');
  if (parts.length < 2) return null;
  const pin = parts[0].trim();
  const datetime = parts[1].trim();
  if (!pin || !datetime) return null;
  const [datePart, timePart] = datetime.split(' ');
  if (!datePart || !timePart) return null;
  return { empId: pin, date: datePart, time: timePart.slice(0, 5) };
}

module.exports = async function handler(req, res) {
  const { method, query } = req;

  // ── Device registration handshake ──
  if (method === 'GET' && query.options === 'all') {
    const sn = query.SN || 'UNKNOWN';
    const response = [
      'GET OPTION FROM: ' + sn,
      'ATTLOGStamp=None', 'OPERLOGStamp=9999', 'ATTPHOTOStamp=None',
      'ErrorDelay=30', 'Delay=10', 'TransTimes=00:00;23:59', 'TransInterval=1',
      'TransFlag=TransData AttLog OpLog', 'Realtime=1', 'Encrypt=None', 'ServerVer=3.0.1',
    ].join('\n');
    res.status(200).send(response);
    return;
  }

  // ── Real punch data push ──
  if (method === 'POST' && query.table === 'ATTLOG') {
    const sn = query.SN || 'UNKNOWN';
    let body = '';
    for await (const chunk of req) body += chunk;

    if (!body.trim()) { res.status(200).send('OK'); return; }

    const records = body.trim().split('\n').map(parseAttlogLine).filter(Boolean);
    if (records.length === 0) { res.status(200).send('OK'); return; }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
      res.status(200).send('OK'); // Always ACK the device even if misconfigured server-side
      return;
    }

    for (const record of records) {
      try {
        const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/handle_realtime_punch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
          },
          body: JSON.stringify({ p_emp_id: record.empId, p_date: record.date, p_time: record.time, p_device_sn: sn })
        });
        const result = await r.json().catch(() => null);
        console.log('Punch processed:', record.empId, record.date, record.time, 'from', sn, '→', result);
      } catch (e) {
        console.error('Failed to write punch for', record.empId, e.message);
      }
    }

    res.status(200).send('OK: ' + records.length);
    return;
  }

  res.status(200).send('OK');
};
