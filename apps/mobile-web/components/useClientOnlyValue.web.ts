import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('load', callback);
  return () => window.removeEventListener('load', callback);
}

function getServerSnapshot() {
  return false;
}

function getClientSnapshot() {
  return true;
}

function useIsClient() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

// `useEffect` is not invoked during server rendering, meaning
// we can use this to determine if we're on the server or not.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const isClient = useIsClient();
  return isClient ? client : server;
}