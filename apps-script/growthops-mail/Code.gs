/**
 * Growth & Ops mail. A tiny web app that sends two kinds of email on
 * behalf of the GrowthOps Google account:
 *
 *   assigned  someone was handed a task
 *   digest    the 7 pm summary of the team's day
 *
 * The dashboard's database calls doPost with a JSON body and a shared
 * token. Nothing here talks to the database; the payload carries all it
 * needs. Deploy as a web app, "Execute as: Me", "Who has access: Anyone".
 *
 * Script property to set once (Project Settings > Script properties):
 *   MAIL_TOKEN   the same value the database holds in app_settings.mail_token
 */

var SENDER_NAME = 'Growth & Ops';
var REPLY_TO_DEFAULT = 'growthops@ssei.co.in';

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return reply_({ ok: false, error: 'bad json' }); }

  var token = PropertiesService.getScriptProperties().getProperty('MAIL_TOKEN');
  if (!token || body.token !== token) return reply_({ ok: false, error: 'bad token' });

  // The database may retry; never send the same thing twice within an hour.
  var key = body.kind + ':' + (body.kind === 'assigned' ? (body.task && body.task.id) + ':' + body.to : body.day + ':' + body.to);
  var cache = CacheService.getScriptCache();
  if (cache.get(key)) return reply_({ ok: true, skipped: 'duplicate' });
  cache.put(key, '1', 3600);

  if (body.kind === 'assigned') sendAssigned_(body);
  else if (body.kind === 'digest') sendDigest_(body);
  else return reply_({ ok: false, error: 'unknown kind' });

  return reply_({ ok: true });
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- One task, handed over ------------------------- */

function sendAssigned_(b) {
  var t = b.task || {};
  var first = (b.to_name || '').split(' ')[0] || 'there';
  var subject = 'New task from ' + (b.by_name || 'Growth & Ops') + ': ' + t.title;

  var rows = [];
  if (t.due_date) rows.push(['Due', niceDate_(t.due_date)]);
  if (t.project)  rows.push(['Project', t.project]);
  if (t.kpi)      rows.push(['Counts towards', t.kpi]);
  if (t.link)     rows.push(['Link', '<a href="' + esc_(t.link) + '">' + esc_(t.link) + '</a>']);

  var html = wrap_(
    '<p style="margin:0 0 14px">Hi ' + esc_(first) + ',</p>' +
    '<p style="margin:0 0 14px">' + esc_(b.by_name || 'Growth & Ops') + ' has handed you a task.</p>' +
    '<p style="margin:0 0 6px;font-size:18px;font-weight:600">' + esc_(t.title) + '</p>' +
    (t.description ? '<p style="margin:0 0 12px;color:#414a58">' + esc_(t.description).replace(/\n/g, '<br>') + '</p>' : '') +
    (t.notes ? '<p style="margin:0 0 12px;color:#414a58"><b>Note:</b> ' + esc_(t.notes).replace(/\n/g, '<br>') + '</p>' : '') +
    table_(rows) +
    button_(b.url, 'Open the task') +
    '<p style="margin:18px 0 0;color:#6b7684;font-size:13px">Click the status dot in the dashboard to move it to In progress and then Done. Reply to this email if anything is unclear.</p>'
  );

  var text = 'Hi ' + first + ',\n\n' + (b.by_name || 'Growth & Ops') + ' has handed you a task.\n\n' + t.title + '\n' +
    (t.description ? t.description + '\n' : '') + (t.notes ? 'Note: ' + t.notes + '\n' : '') +
    rows.map(function (r) { return r[0] + ': ' + r[1].replace(/<[^>]+>/g, ''); }).join('\n') +
    '\n\nOpen the task: ' + b.url + '\n';

  MailApp.sendEmail({ to: b.to, subject: subject, htmlBody: html, body: text,
                      name: SENDER_NAME, replyTo: b.by_email || REPLY_TO_DEFAULT });
}

/* ---------- The day, at 7 pm ------------------------------ */

function sendDigest_(b) {
  var people = b.people || [];
  var totalDone = people.reduce(function (s, p) { return s + (p.done_today || []).length; }, 0);
  var totalLate = people.reduce(function (s, p) { return s + (p.late || []).length; }, 0);
  var subject = 'Team day, ' + b.day + ': ' + totalDone + ' finished' + (totalLate ? ', ' + totalLate + ' late' : '');

  var parts = ['<p style="margin:0 0 18px">Hi Kavya, here is the team\'s ' + esc_(b.day) + '.</p>'];
  var textParts = ['Team day, ' + b.day + '\n'];

  people.forEach(function (p) {
    var att = p.attendance;
    var attLine = !att ? 'No check-in today'
                : att.status && att.status !== 'present' && att.status !== 'wfh' ? cap_(att.status.replace('_', ' '))
                : ('In ' + (att.in || '') + (att.out ? ' to ' + att.out : ', not checked out yet'));
    var h = '<h3 style="margin:22px 0 6px;font-size:16px">' + esc_(p.name) + ' <span style="font-weight:400;color:#6b7684;font-size:13px">' + esc_(attLine) + ' · ' + p.open + ' open</span></h3>';
    h += list_('Finished today', p.done_today, b.home, '#087443');
    h += list_('Late or blocked', p.late, b.home, '#b42318', function (t) { return t.blocked ? 'blocked' : 'due ' + niceDate_(t.due); });
    h += list_('Due by ' + b.next_day, p.next, b.home, '#1e5f74', function (t) { return 'due ' + niceDate_(t.due); });
    parts.push(h);

    textParts.push('\n' + p.name + ' (' + attLine + ', ' + p.open + ' open)');
    textParts.push(textList_('Finished today', p.done_today));
    textParts.push(textList_('Late or blocked', p.late));
    textParts.push(textList_('Due by ' + b.next_day, p.next));
  });

  parts.push(button_(b.home + '#plan', 'Open the plan'));
  MailApp.sendEmail({ to: b.to, subject: subject, htmlBody: wrap_(parts.join('')), body: textParts.join('\n') + '\n\n' + b.home,
                      name: SENDER_NAME, replyTo: REPLY_TO_DEFAULT });
}

/* ---------- Bits ------------------------------------------ */

function list_(title, items, home, colour, extra) {
  if (!items || !items.length) return '';
  var lis = items.map(function (t) {
    var more = extra ? ' <span style="color:#6b7684">· ' + esc_(extra(t)) + '</span>' : '';
    var proj = t.project ? ' <span style="color:#6b7684">· ' + esc_(t.project) + '</span>' : '';
    return '<li style="margin:0 0 4px"><a href="' + esc_(home) + '#work/' + esc_(t.id) + '" style="color:#14181f;text-decoration:none">' + esc_(t.title) + '</a>' + proj + more + '</li>';
  }).join('');
  return '<p style="margin:10px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:' + colour + '">' + esc_(title) + '</p><ul style="margin:0;padding-left:18px">' + lis + '</ul>';
}

function textList_(title, items) {
  if (!items || !items.length) return '';
  return '  ' + title + ':\n' + items.map(function (t) { return '   - ' + t.title + (t.project ? ' (' + t.project + ')' : ''); }).join('\n');
}

function table_(rows) {
  if (!rows.length) return '';
  return '<table style="border-collapse:collapse;margin:8px 0 16px;font-size:14px">' + rows.map(function (r) {
    return '<tr><td style="padding:4px 14px 4px 0;color:#6b7684">' + r[0] + '</td><td style="padding:4px 0">' + r[1] + '</td></tr>';
  }).join('') + '</table>';
}

function button_(url, label) {
  return '<p style="margin:18px 0 0"><a href="' + esc_(url) + '" style="display:inline-block;background:#1e5f74;color:#fff;padding:9px 16px;border-radius:4px;text-decoration:none;font-weight:600">' + esc_(label) + '</a></p>';
}

function wrap_(inner) {
  return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#14181f;max-width:600px;padding:8px 4px">' +
    '<p style="margin:0 0 18px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#1e5f74;font-weight:600">Growth &amp; Ops</p>' +
    inner +
    '<p style="margin:26px 0 0;font-size:12px;color:#97a1af">Sent by the Growth &amp; Ops dashboard, SSEI.</p></div>';
}

function niceDate_(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T12:00:00+05:30');
  return Utilities.formatDate(d, 'Asia/Kolkata', 'd MMM');
}
function cap_(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/** Run this once from the editor to check the property and send yourself a test. */
function selfTest() {
  var me = Session.getEffectiveUser().getEmail();
  sendAssigned_({ to: me, to_name: 'Test Person', by_name: 'Kavya Bahety', by_email: me,
    task: { id: 'test', title: 'A test task from the mail script', description: 'If you can read this, the script can send.', due_date: '2026-10-01', project: 'Team dashboard' },
    url: 'https://growthkavya.github.io/growth-ops-dashboard/dashboard.html#work/test' });
}
