import { httpsCallable, type Functions } from 'firebase/functions';

export type CreateMemberInput = {
  workspaceId: string;
  username: string;
  displayName: string;
  temporaryPassword: string;
};

export type CreateMemberResult = { uid: string; username: string };

export type ManagedMember = {
  id: string; username: string; displayName: string; role: 'admin' | 'member'; active: boolean;
  createdAt: string; lastVisitAt: string | null; lastSignInAt: string | null;
  accountState: 'enabled' | 'disabled' | 'missing';
};
export type MemberAction = 'suspend' | 'reactivate' | 'promote' | 'demote' | 'reset-password';
export async function listMembers(functions: Functions, workspaceId: string, cursor: string | null) {
  return (await httpsCallable<{ workspaceId: string; cursor: string | null }, { members: ManagedMember[]; nextCursor: string | null }>(functions, 'listMembers', { timeout: 30_000 })({ workspaceId, cursor })).data;
}
export async function manageMember(functions: Functions, input: { workspaceId: string; targetId: string; action: MemberAction; temporaryPassword?: string }) {
  return (await httpsCallable(functions, 'manageMember', { timeout: 30_000 })(input)).data;
}

export async function createMemberWithFunction(functions: Functions, input: CreateMemberInput): Promise<CreateMemberResult> {
  const callable = httpsCallable<CreateMemberInput, CreateMemberResult>(functions, 'createMember');
  const response = await callable(input);
  return response.data;
}
