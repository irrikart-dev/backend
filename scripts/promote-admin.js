// One-off: flips a User's role to ADMIN by email. Run after that user has
// signed in at least once (via /auth/firebase/sync) so the row exists.
//   node scripts/promote-admin.js someone@irrikart.in
import { prisma } from '../src/config/db.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/promote-admin.js <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No User row for "${email}" yet — sign in once first, then re-run this.`);
  process.exit(1);
}

await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
console.log(`${email} is now ADMIN.`);
await prisma.$disconnect();
