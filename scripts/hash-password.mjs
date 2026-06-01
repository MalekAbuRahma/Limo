import { hashPassword } from '../server/password.js';

const plain = process.argv[2] || '1234';
console.log(hashPassword(plain));
