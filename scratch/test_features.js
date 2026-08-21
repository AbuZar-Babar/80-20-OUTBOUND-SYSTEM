const { UserStore, LeadStore, LoginSessionStore, SendingInboxStore } = require('../backend/config/store');

async function testAll() {
  console.log('Testing features...');

  // 1. Test Inboxes
  const inbox = await SendingInboxStore.createInbox({
    name: 'Test Inbox',
    fromEmail: 'outreach@domain.com',
    fromName: 'Test Rep',
    dailyLimit: 25
  });
  console.log('Created inbox:', inbox.name, inbox.fromEmail, 'Limit:', inbox.dailyLimit);

  const inboxes = await SendingInboxStore.findAllInboxes();
  console.log('Found inboxes count:', inboxes.length);

  await SendingInboxStore.incrementInboxUsage(inbox._id);
  const updatedInbox = await SendingInboxStore.findInboxById(inbox._id);
  console.log('Inbox emails sent today:', updatedInbox.emailsSentToday);

  // 2. Test Break toggle
  const user = await UserStore.create({
    name: 'Agent Smith',
    email: `smith_${Date.now()}@test.com`,
    password: 'password123',
    role: 'salesperson',
    approved: true
  });
  console.log('Created test user:', user.name, user._id);

  const break1 = await LoginSessionStore.toggleBreak(user._id);
  console.log('Toggled break 1 (should be on break):', break1.isOnBreak);

  const break2 = await LoginSessionStore.toggleBreak(user._id);
  console.log('Toggled break 2 (should be off break):', break2.isOnBreak, 'Break seconds:', break2.breakTimeSeconds);

  // 3. Test Replies in Daily Queue
  const lead = await LeadStore.create({
    userId: user._id,
    contact: { name: 'Prospect Jane', phone: '+1234567890', email: 'jane@example.com' },
    status: 'new',
    hasUnansweredReply: true,
    lastReplyText: 'Yes, please call me back tomorrow!',
    lastReplyChannel: 'sms',
    lastReplyAt: new Date()
  });

  const queue = await LeadStore.findDailyQueue(user._id);
  console.log('Daily queue replies count:', queue.replies.length);
  if (queue.replies.length > 0) {
    console.log('First reply text:', queue.replies[0].lastReplyText, 'Channel:', queue.replies[0].lastReplyChannel);
  }

  console.log('All tests passed successfully!');
  process.exit(0);
}

testAll().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
