'use strict';
// Copia de seguridad del JSON: npm run backup  ->  Data/backups/resume-data-AAAAMMDD-HHMMSS.json
const store = require('../server/store');
store.backup()
  .then((file) => console.log(`Copia creada / Backup created: ${file}`))
  .catch((err) => { console.error(err.message); process.exit(1); });
