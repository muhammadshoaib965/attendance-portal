module.exports = async function handler(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  res.status(200).send('OK');
};
