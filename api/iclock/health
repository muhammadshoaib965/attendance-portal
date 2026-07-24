module.exports = function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    timestamp: new Date().toISOString()
  });
};
