import { redirect } from 'next/navigation';
import { EmptyState } from '@staysphere/ui';
import { defaultWorkspace } from '@/lib/roles';
import { requireSession } from '@/lib/session';

export default async function StaffHomePage() {
  const session = await requireSession();
  const workspace = defaultWorkspace(session.user.roles);

  // Straight into the shift's own queue — a chooser between one option is friction.
  if (workspace) redirect(workspace.href);

  return (
    <EmptyState
      title="No workspace is assigned to your account"
      description="Your roles do not grant access to any staff workspace yet. Ask a manager to assign one."
    />
  );
}
