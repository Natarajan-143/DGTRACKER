const bcrypt = require('bcryptjs');

async function run() {
  const mHash = await bcrypt.hash('manager123', 10);
  const lHash = await bcrypt.hash('lead123', 10);
  console.log('Manager Hash:', mHash);
  console.log('Lead Hash:', lHash);
}

run();
