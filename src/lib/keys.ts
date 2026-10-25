import * as SecureStore from 'expo-secure-store';

// API keys live only in the OS keystore. They are never written to SQLite or to backups.
const k = (providerId: string) => `apikey.${providerId}`;

export const getApiKey = (providerId: string) => SecureStore.getItemAsync(k(providerId));
export const setApiKey = (providerId: string, key: string) => SecureStore.setItemAsync(k(providerId), key);
export const deleteApiKey = (providerId: string) => SecureStore.deleteItemAsync(k(providerId));
