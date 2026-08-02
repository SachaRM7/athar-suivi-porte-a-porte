import { httpsCallable, type Functions } from 'firebase/functions';

export type CreateMemberInput = {
  workspaceId: string;
  username: string;
  displayName: string;
  temporaryPassword: string;
};

export type CreateMemberResult = { uid: string; username: string };

export async function createMemberWithFunction(functions: Functions, input: CreateMemberInput): Promise<CreateMemberResult> {
  const callable = httpsCallable<CreateMemberInput, CreateMemberResult>(functions, 'createMember');
  const response = await callable(input);
  return response.data;
}
