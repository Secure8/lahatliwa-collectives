import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canAcceptInquiry, canCompleteInquiry, canDeleteInquiry, inquiryMatchesView, responseSummary, unreadForInquiry } from './teamInquiryWorkspace.js';
import { assignmentDeliveryStatus, canPermanentlyDeleteInquiry, safeTeamInquiryPayload, TEAM_INQUIRY_ACTIONS } from '../../supabase/functions/inquiry-workflow/inquiryWorkflow.js';

const files = Promise.all([
  readFile(new URL('../../supabase/team_inquiry_workspace.sql', import.meta.url), 'utf8'),
  readFile(new URL('../pages/admin/AdminInquiries.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/submit-service-request/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/inquiry-workflow/index.ts', import.meta.url), 'utf8'),
]);

test('active Team views include general and creative-specific inquiries while public access stays revoked', async () => {
  const [sql] = await files;
  assert.match(sql, /member\.role in \('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'\)/i);
  assert.match(sql, /create policy "Active Team can read every inquiry"[\s\S]*private\.is_active_inquiry_team_member\(auth\.uid\(\)\)/i);
  assert.match(sql, /revoke select on public\.project_inquiries from anon/i);
  assert.match(sql, /revoke insert, update, delete on public\.project_inquiries from anon, authenticated/i);
  assert.equal(inquiryMatchesView({ preferred_creative_id: null }, 'general', 'member'), true);
  assert.equal(inquiryMatchesView({ current_assignee_id: 'member' }, 'mine', 'member'), true);
});

test('member responses are unique, Team-visible, and mutated only through the actor-verified RPC', async () => {
  const [sql] = await files;
  assert.match(sql, /unique \(inquiry_id, team_member_id\)/i);
  assert.match(sql, /p_action = 'respond'[\s\S]*team_member_id, response, response_note[\s\S]*actor\.id/i);
  assert.match(sql, /revoke insert, update, delete on public\.inquiry_member_responses/i);
  const summary = responseSummary([{ id: 'a', display_name: 'Alex', creative_member_id: 'ca' }, { id: 'b', display_name: 'Bea', creative_member_id: 'cb' }], [{ team_member_id: 'a', response: 'declined' }]);
  assert.deepEqual(summary.map((item) => item.response), ['declined', 'no_response']);
});

test('declining an assignment opens the inquiry instead of globally declining it', async () => {
  const [sql] = await files;
  assert.match(sql, /p_action = 'decline'[\s\S]*current_assignee_id = null, assigned_creative_id = null, workflow_status = 'open', status = 'under_review'/i);
  assert.doesNotMatch(sql, /update public\.project_inquiries set[^;]*status = 'declined'/i);
});

test('accept, transfer, request, and completion permissions are enforced server-side', async () => {
  const [sql] = await files;
  assert.match(sql, /Only the current assignee may accept/i);
  assert.match(sql, /Only the current assignee may transfer/i);
  assert.match(sql, /This transfer would repeat a recent assignment loop/i);
  assert.match(sql, /Only the current assignee or Super Admin may review this request/i);
  assert.match(sql, /Only the accepted current assignee may complete this inquiry/i);
  assert.equal(canAcceptInquiry({ current_assignee_id: 'a', workflow_status: 'awaiting_response' }, 'a'), true);
  assert.equal(canCompleteInquiry({ current_assignee_id: 'a', workflow_status: 'accepted' }, 'a', 'creative'), true);
  assert.equal(canCompleteInquiry({ current_assignee_id: 'a', workflow_status: 'accepted' }, 'b', 'creative'), false);
});

test('protected inquiry endpoint allowlists actions and bounds every accepted payload field', async () => {
  const [, ui, , , workflowEdge] = await files;
  assert.equal(TEAM_INQUIRY_ACTIONS.has('admin_assign'), true);
  assert.equal(TEAM_INQUIRY_ACTIONS.has('execute_sql'), false);
  assert.equal(safeTeamInquiryPayload({ unexpected: 'value' }), null);
  assert.equal(safeTeamInquiryPayload([]), null);
  assert.equal(safeTeamInquiryPayload({ note: `ok\u0000${'x'.repeat(2100)}` }).note.length, 2000);
  assert.deepEqual(safeTeamInquiryPayload({ response: ' available ', expected_workflow_status: ' open ' }), { response: 'available', expected_workflow_status: 'open' });
  assert.match(workflowEdge, /TEAM_INQUIRY_ACTIONS\.has\(teamAction\)/);
  assert.match(workflowEdge, /perform_team_inquiry_action_as_service/);
  assert.match(workflowEdge, /if \(error\?\.code === 'PGRST202'\)[\s\S]*callerClient\.rpc\('perform_team_inquiry_action'/);
  assert.doesNotMatch(workflowEdge, /if \(error\)[\s\S]{0,100}callerClient\.rpc\('perform_team_inquiry_action'/);
  assert.match(ui, /action: 'team_action'/);
});

test('unread state is independent per member and initialized for every active Team member', async () => {
  const [sql, , layout] = await files;
  assert.match(sql, /primary key \(inquiry_id, team_member_id\)/i);
  assert.match(sql, /insert into public\.inquiry_read_receipts[\s\S]*from public\.admin_users member/i);
  assert.match(layout, /inquiry_read_receipts[\s\S]*team_member_id[\s\S]*is_unread/i);
  assert.equal(unreadForInquiry([{ inquiry_id: 'i', team_member_id: 'a', is_unread: true }, { inquiry_id: 'i', team_member_id: 'b', is_unread: false }], 'i', 'a'), true);
  assert.equal(unreadForInquiry([{ inquiry_id: 'i', team_member_id: 'a', is_unread: true }, { inquiry_id: 'i', team_member_id: 'b', is_unread: false }], 'i', 'b'), false);
});

test('private notes and recipient delivery attempts are restricted to the Super Admin', async () => {
  const [sql, ui, , submitEdge] = await files;
  assert.match(sql, /Super Admin can read inquiry delivery attempts[\s\S]*private\.has_role\(auth\.uid\(\), array\['super_admin'\]\)/i);
  assert.match(sql, /Super Admin can read inquiry private notes[\s\S]*private\.has_role\(auth\.uid\(\), array\['super_admin'\]\)/i);
  assert.doesNotMatch(ui, /notification_email|recipient_email/i);
  assert.match(submitEdge, /to: \[item\.recipient\]/i);
  assert.doesNotMatch(submitEdge, /cc\s*:|bcc\s*:/i);
});

test('terminal permanent deletion requires Super Admin, PIN confirmation, and atomic dependent cleanup', async () => {
  const [sql, ui, , , workflowEdge] = await files;
  assert.equal(canDeleteInquiry({ workflow_status: 'completed' }, 'super_admin'), true);
  assert.equal(canDeleteInquiry({ workflow_status: 'open' }, 'super_admin'), false);
  assert.equal(canPermanentlyDeleteInquiry('creative', 'completed', 'DELETE'), false);
  assert.equal(canPermanentlyDeleteInquiry('super_admin', 'completed', 'DELETE'), true);
  assert.match(ui, /confirmation !== 'DELETE'/i);
  assert.match(workflowEdge, /SUPER_ADMIN_MEMBER_ACTIONS_PIN/);
  const ordered = ['inquiry_member_responses', 'inquiry_read_receipts', 'inquiry_assignment_requests', 'inquiry_assignments', 'inquiry_team_notifications', 'inquiry_delivery_attempts', 'inquiry_private_notes', 'inquiry_status_history', 'project_inquiries'];
  for (let index = 1; index < ordered.length; index += 1) assert.ok(sql.indexOf(`delete from public.${ordered[index - 1]}`) < sql.indexOf(`delete from public.${ordered[index]}`));
  assert.match(sql, /grant execute on function public\.execute_super_admin_inquiry_delete\(uuid, uuid\) to service_role/i);
});

test('assignment notifications use direct delivery with administrative fallback and idempotent keys', async () => {
  const [, , , , workflowEdge] = await files;
  assert.equal(assignmentDeliveryStatus('sent', ''), 'sent');
  assert.equal(assignmentDeliveryStatus('failed', 'sent'), 'partially_sent');
  assert.match(workflowEdge, /deliveryKey = `transfer:\$\{assignment\.id\}`/);
  assert.match(workflowEdge, /prior\?\.status === 'sent'/);
  assert.match(workflowEdge, /to: \[notificationEmail\]/);
  assert.match(workflowEdge, /to: \[emailConfig\.adminEmail\]/);
});

test('dashboard uses authoritative refresh with cleaned-up Realtime subscriptions and mobile-safe widths', async () => {
  const [, ui, layout] = await files;
  assert.match(ui, /postgres_changes/);
  assert.match(ui, /supabase\.removeChannel\(channel\)/);
  assert.match(layout, /supabase\.removeChannel\(channel\)/);
  assert.match(ui, /overflow-x-hidden/);
  assert.doesNotMatch(ui, /w-screen|min-w-screen/);
});

test('inquiry details use a dedicated native-momentum scroll surface without backdrop blur', async () => {
  const [ui, dialog, css] = await Promise.all([
    readFile(new URL('../pages/admin/AdminInquiries.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /contentClassName="admin-inquiry-scroll bg-zinc-950" simpleBackdrop/);
  assert.match(dialog, /!simpleBackdrop && 'backdrop-blur/);
  assert.match(dialog, /contentClassName/);
  assert.match(css, /\.admin-inquiry-scroll[\s\S]*touch-action: pan-y[\s\S]*-webkit-overflow-scrolling: touch/);
  assert.match(css, /\.admin-inquiry-scroll[\s\S]*scrollbar-gutter: stable/);
});

test('existing inquiry fields and public submission remain compatible', async () => {
  const [sql, ui, , submitEdge] = await files;
  assert.match(sql, /assigned_creative_id/i);
  assert.match(`${ui}\n${submitEdge}`, /preferred_creative_id/i);
  assert.match(ui, /details \|\| selected\.message/);
  assert.match(submitEdge, /project_inquiries'\)\.insert\(payload\)/);
  assert.match(submitEdge, /deliverNotifications\(admin, inquiry, deliveryCreative, emailConfig\)/);
});
