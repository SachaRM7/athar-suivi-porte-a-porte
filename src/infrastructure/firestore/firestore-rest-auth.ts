export type FirestoreRestAuth = {
  projectId: string;
  getIdToken(): Promise<string | null>;
};
