/**
 * The built-in "On this phone" provider runs downloaded models on the device itself. It is an ordinary provider row
 * (so the model picker, chats and settings work as for any endpoint) whose address is this marker instead of a URL.
 */
export const LOCAL_URL = 'local://device';

export const isLocalProvider = (p?: { baseUrl: string } | null) => !!p && p.baseUrl.startsWith('local://');
