import * as Crypto from 'expo-crypto';

export const uid = () => Crypto.randomUUID();
export const now = () => Date.now();
