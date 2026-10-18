// One-off: sends one MSG91 template email to check the email channel end to end.
//   node scripts/send-test-email.js someone@irrikart.in <templateId> '{"name":"Ramesh"}'
import { sendEmail } from '../src/modules/notifications/notifications.service.js';

const [to, templateId, vars = '{}'] = process.argv.slice(2);
if (!to || !templateId) {
  console.error('Usage: node scripts/send-test-email.js <email> <templateId> [variablesJson]');
  process.exit(1);
}

try {
  const id = await sendEmail({ to, templateId, variables: JSON.parse(vars) });
  // accepted != delivered — MSG91 validates recipients async; check its Logs / API Failed Logs
  console.log(`Accepted by MSG91 (unique_id: ${id}). Check delivery in MSG91 Logs.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
process.exit();
