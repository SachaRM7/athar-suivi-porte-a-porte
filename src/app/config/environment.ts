export type FirebaseEnvironment = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  useEmulators: boolean;
};

const keys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const;

function configuredFirebase(): FirebaseEnvironment | null {
  const values = keys.map((key) => import.meta.env[key]?.trim() ?? '');
  if (values.every((value) => value === '')) return null;
  if (values.some((value) => value === '')) {
    throw new Error(`Firebase configuration is incomplete. Set ${keys.join(', ')} or none of them.`);
  }
  return {
    apiKey: values[0],
    authDomain: values[1],
    projectId: values[2],
    appId: values[3],
    useEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  };
}

export const environment = Object.freeze({
  firebase: configuredFirebase(),
  workspaceId: import.meta.env.VITE_WORKSPACE_ID?.trim() || 'main'
});
