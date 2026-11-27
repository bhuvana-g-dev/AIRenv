/**
 * Optional Firebase Authentication. When VITE_FIREBASE_* variables are absent the
 * app runs against a backend in AUTH_MODE=local and no sign-in is required.
 */
import type { Auth, User } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let authPromise: Promise<Auth> | null = null;
let currentUser: User | null = null;
const listeners = new Set<(u: User | null) => void>();

async function getAuthInstance(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const [{ initializeApp }, { getAuth, onAuthStateChanged }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
      ]);
      const app = initializeApp(config);
      const auth = getAuth(app);
      onAuthStateChanged(auth, (u) => {
        currentUser = u;
        listeners.forEach((l) => l(u));
      });
      return auth;
    })();
  }
  return authPromise;
}

export function onAuthChange(cb: (u: User | null) => void): () => void {
  listeners.add(cb);
  if (firebaseEnabled) void getAuthInstance();
  return () => listeners.delete(cb);
}

export async function getIdToken(): Promise<string | null> {
  if (!firebaseEnabled) return null;
  await getAuthInstance();
  return currentUser ? currentUser.getIdToken() : null;
}

export async function signInWithGoogle(): Promise<void> {
  const auth = await getAuthInstance();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signInWithEmail(email: string, password: string, create: boolean): Promise<void> {
  const auth = await getAuthInstance();
  const m = await import("firebase/auth");
  if (create) await m.createUserWithEmailAndPassword(auth, email, password);
  else await m.signInWithEmailAndPassword(auth, email, password);
}

export async function signOut(): Promise<void> {
  if (!firebaseEnabled) return;
  const auth = await getAuthInstance();
  const { signOut: so } = await import("firebase/auth");
  await so(auth);
}
