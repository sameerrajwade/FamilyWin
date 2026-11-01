/**
 * lib/fb.ts — Firebase namespaced-API compatibility shim.
 *
 * @react-native-firebase v26 removed the namespaced default exports
 * (`firestore()`, `auth()`, `storage()`, `functions()`) and is modular-only,
 * aligning with firebase-js-sdk. Rather than rewrite hundreds of chainable
 * call sites across the data layer + screens, this file rebuilds the small
 * slice of the namespaced ergonomics the app actually uses, on top of the v26
 * modular free-functions. Import { firestore, auth, storage, functions } from
 * '@/lib/fb' as a drop-in for the old default imports.
 *
 * NOTE: v26 made DocumentSnapshot.exists a METHOD (`.exists()`), not a
 * property — call sites were updated accordingly; this shim does not paper
 * over that.
 */
import {
  getFirestore,
  collection as mColl,
  doc as mDoc,
  query as mQuery,
  where as mWhere,
  orderBy as mOrderBy,
  limit as mLimit,
  startAfter as mStartAfter,
  getDocs,
  getDoc,
  onSnapshot as mOnSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  runTransaction as mRunTransaction,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  deleteField,
} from '@react-native-firebase/firestore';
import type {
  QuerySnapshot,
  DocumentSnapshot,
  DocumentData,
  WhereFilterOp,
  OrderByDirection,
} from '@react-native-firebase/firestore';
import {
  getAuth,
  onAuthStateChanged as mOnAuthStateChanged,
  signInWithEmailAndPassword as mSignIn,
  createUserWithEmailAndPassword as mCreateUser,
  signOut as mSignOut,
  sendPasswordResetEmail as mSendReset,
  signInWithCredential as mSignInCred,
  GoogleAuthProvider,
} from '@react-native-firebase/auth';
import {
  getStorage,
  ref as mStorageRef,
  putFile as mPutFile,
  getDownloadURL as mGetDownloadURL,
  deleteObject as mDeleteObject,
} from '@react-native-firebase/storage';
import { getFunctions, httpsCallable as mHttpsCallable } from '@react-native-firebase/functions';
import {
  getAnalytics,
  setUserId as mSetUserId,
  setUserProperties as mSetUserProperties,
  logScreenView as mLogScreenView,
  logEvent as mLogEvent,
} from '@react-native-firebase/analytics';
import {
  getCrashlytics,
  log as mCrashLog,
  recordError as mRecordError,
  setCrashlyticsCollectionEnabled as mSetCrashEnabled,
} from '@react-native-firebase/crashlytics';
import {
  getMessaging,
  requestPermission as mReqPermission,
  getToken as mGetToken,
  setBackgroundMessageHandler as mSetBackgroundMessageHandler,
  onMessage as mOnMessage,
  onNotificationOpenedApp as mOnNotificationOpenedApp,
  getInitialNotification as mGetInitialNotification,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';

// ─── Firestore ──────────────────────────────────────────────────────────────
const db = getFirestore();

type Snap = QuerySnapshot<DocumentData>;
type DocSnap = DocumentSnapshot<DocumentData>;

export interface QueryRef {
  where(field: string, op: WhereFilterOp, value: unknown): QueryRef;
  orderBy(field: string, dir?: OrderByDirection): QueryRef;
  limit(n: number): QueryRef;
  startAfter(...values: unknown[]): QueryRef;
  get(): Promise<Snap>;
  onSnapshot(next: (snap: Snap) => void, error?: (e: Error) => void): () => void;
}

export interface CollectionRef extends QueryRef {
  doc(id?: string): DocRef;
  add(data: DocumentData): Promise<DocRef>;
  readonly id: string;
  readonly path: string;
}

export interface DocRef {
  readonly id: string;
  readonly path: string;
  collection(path: string): CollectionRef;
  get(): Promise<DocSnap>;
  set(data: DocumentData, options?: { merge?: boolean }): Promise<void>;
  update(data: DocumentData): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snap: DocSnap) => void, error?: (e: Error) => void): () => void;
  _ref: any;
}

function wrapQuery(q: any): QueryRef {
  return {
    where: (f, op, v) => wrapQuery(mQuery(q, mWhere(f, op, v))),
    orderBy: (f, dir) => wrapQuery(mQuery(q, mOrderBy(f, dir as any))),
    limit: (n) => wrapQuery(mQuery(q, mLimit(n))),
    startAfter: (...values) => wrapQuery(mQuery(q, mStartAfter(...values))),
    get: () => getDocs(q),
    onSnapshot: (next, error) => mOnSnapshot(q, next as any, error as any),
  };
}

function wrapDoc(ref: any): DocRef {
  return {
    get id() { return ref.id; },
    get path() { return ref.path; },
    _ref: ref,
    collection: (path) => wrapCollection(mColl(ref, path)),
    get: () => getDoc(ref),
    set: (data, options) => setDoc(ref, data, options ?? {}),
    update: (data) => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (next, error) => mOnSnapshot(ref, next as any, error as any),
  };
}

function wrapCollection(ref: any): CollectionRef {
  const q = wrapQuery(ref);
  return {
    ...q,
    get id() { return ref.id; },
    get path() { return ref.path; },
    doc: (id?: string) => wrapDoc(id ? mDoc(ref, id) : mDoc(ref)),
    add: async (data) => wrapDoc(await addDoc(ref, data)),
  };
}

interface Batch {
  set(doc: DocRef, data: DocumentData, options?: { merge?: boolean }): Batch;
  update(doc: DocRef, data: DocumentData): Batch;
  delete(doc: DocRef): Batch;
  commit(): Promise<void>;
}

function wrapBatch(): Batch {
  const b = writeBatch(db);
  const api: Batch = {
    set(doc, data, options) { b.set(doc._ref, data, options ?? {}); return api; },
    update(doc, data) { b.update(doc._ref, data); return api; },
    delete(doc) { b.delete(doc._ref); return api; },
    commit: () => b.commit(),
  };
  return api;
}

/** Read-then-write atomically (e.g. "create only if it doesn't exist yet"). */
export interface Txn {
  get(doc: DocRef): Promise<DocSnap>;
  set(doc: DocRef, data: DocumentData, options?: { merge?: boolean }): Txn;
  update(doc: DocRef, data: DocumentData): Txn;
  delete(doc: DocRef): Txn;
}

function wrapTxn(t: any): Txn {
  const api: Txn = {
    get: (doc) => t.get(doc._ref),
    set(doc, data, options) { t.set(doc._ref, data, options ?? {}); return api; },
    update(doc, data) { t.update(doc._ref, data); return api; },
    delete(doc) { t.delete(doc._ref); return api; },
  };
  return api;
}

interface FirestoreFn {
  (): {
    collection(path: string): CollectionRef;
    doc(path: string): DocRef;
    batch(): Batch;
    runTransaction<T>(fn: (txn: Txn) => Promise<T>): Promise<T>;
    settings(opts?: unknown): void;
  };
  Timestamp: typeof Timestamp;
  FieldValue: {
    serverTimestamp: typeof serverTimestamp;
    arrayUnion: typeof arrayUnion;
    arrayRemove: typeof arrayRemove;
    increment: typeof increment;
    delete: typeof deleteField;
  };
}

const firestoreImpl = (() => ({
  collection: (path: string) => wrapCollection(mColl(db, path)),
  doc: (path: string) => wrapDoc(mDoc(db, path)),
  batch: () => wrapBatch(),
  runTransaction: <T,>(fn: (txn: Txn) => Promise<T>) => mRunTransaction(db, (t: any) => fn(wrapTxn(t))) as Promise<T>,
  // Persistence is enabled by default on native in v26; keep as a no-op so the
  // old `firestore().settings({ persistence: true })` call still type-checks.
  settings: (_opts?: unknown) => {},
})) as FirestoreFn;
firestoreImpl.Timestamp = Timestamp;
firestoreImpl.FieldValue = { serverTimestamp, arrayUnion, arrayRemove, increment, delete: deleteField };

export const firestore = firestoreImpl;

// ─── Auth ─────────────────────────────────────────────────────────────────
const authInstance = getAuth();

interface AuthFn {
  (): {
    readonly currentUser: ReturnType<typeof getAuth>['currentUser'];
    createUserWithEmailAndPassword(email: string, password: string): Promise<any>;
    signInWithEmailAndPassword(email: string, password: string): Promise<any>;
    signInWithCredential(credential: any): Promise<any>;
    signOut(): Promise<void>;
    sendPasswordResetEmail(email: string): Promise<void>;
    onAuthStateChanged(cb: (user: any) => void): () => void;
  };
  GoogleAuthProvider: typeof GoogleAuthProvider;
}

const authImpl = (() => ({
  get currentUser() { return authInstance.currentUser; },
  createUserWithEmailAndPassword: (email: string, password: string) => mCreateUser(authInstance, email, password),
  signInWithEmailAndPassword: (email: string, password: string) => mSignIn(authInstance, email, password),
  signInWithCredential: (credential: any) => mSignInCred(authInstance, credential),
  signOut: () => mSignOut(authInstance),
  sendPasswordResetEmail: (email: string) => mSendReset(authInstance, email),
  onAuthStateChanged: (cb: (user: any) => void) => mOnAuthStateChanged(authInstance, cb),
})) as AuthFn;
authImpl.GoogleAuthProvider = GoogleAuthProvider;

export const auth = authImpl;

// ─── Storage ──────────────────────────────────────────────────────────────
const storageInstance = getStorage();

export interface StorageRef {
  // putFile returns an UploadTask (thenable, but not a full Promise) — typed as
  // `any` so `await ref.putFile(...)` works without the Promise-shape mismatch.
  putFile(localPath: string, metadata?: { contentType?: string }): any;
  getDownloadURL(): Promise<string>;
  delete(): Promise<void>;
}

function wrapStorageRef(r: any): StorageRef {
  return {
    putFile: (localPath, metadata) => mPutFile(r, localPath, metadata as any),
    getDownloadURL: () => mGetDownloadURL(r),
    delete: () => mDeleteObject(r),
  };
}

export const storage = () => ({
  ref: (path: string) => wrapStorageRef(mStorageRef(storageInstance, path)),
});

// ─── Functions ────────────────────────────────────────────────────────────
const functionsInstance = getFunctions();

export const functions = () => ({
  httpsCallable: (name: string) => mHttpsCallable(functionsInstance, name),
});

// ─── Analytics ──────────────────────────────────────────────────────────────
export const analytics = () => {
  const inst = getAnalytics();
  return {
    setUserId: (id: string | null) => mSetUserId(inst, id),
    setUserProperties: (props: { [k: string]: string | null }) => mSetUserProperties(inst, props),
    logScreenView: (params: any) => mLogScreenView(inst, params),
    logEvent: (name: string, params?: any) => mLogEvent(inst, name, params),
  };
};

// ─── Crashlytics ──────────────────────────────────────────────────────────
export const crashlytics = () => {
  const inst = getCrashlytics();
  return {
    log: (msg: string) => mCrashLog(inst, msg),
    recordError: (err: Error) => mRecordError(inst, err),
    setCrashlyticsCollectionEnabled: (v: boolean) => mSetCrashEnabled(inst, v),
  };
};

// ─── Messaging ────────────────────────────────────────────────────────────
export const messaging = Object.assign(
  () => {
    const inst = getMessaging();
    return {
      requestPermission: () => mReqPermission(inst),
      getToken: () => mGetToken(inst),
      setBackgroundMessageHandler: (handler: (msg: any) => Promise<any>) => mSetBackgroundMessageHandler(inst, handler),
      onMessage: (handler: (msg: any) => any) => mOnMessage(inst, handler),
      onNotificationOpenedApp: (handler: (msg: any) => any) => mOnNotificationOpenedApp(inst, handler),
      getInitialNotification: () => mGetInitialNotification(inst),
    };
  },
  { AuthorizationStatus },
);
