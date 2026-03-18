const bcrypt = require('bcryptjs');
const password = process.argv[2] || 'lg697280';
const hash = bcrypt.hashSync(password, 10);
console.log('Password hash (add to ADMIN_PASSWORD_HASH in Vercel):');
console.log(hash);
