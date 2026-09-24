import { AlertTriangle, Check, Info } from 'lucide-react';

export const ICONS = { success: Check, error: AlertTriangle, info: Info };
export const LIFETIME = { success: 4000, info: 5000, error: 7000 };

export let publish = null;
export const setPublish = (pub) => { publish = pub; };

export const pending = [];

export function emit(type, message, options = {}) {
    const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        message: String(message ?? ''),
        duration: options.duration ?? LIFETIME[type] ?? LIFETIME.info,
    };
    if (publish) publish(item);
    else pending.push(item);
    return item.id;
}

export const toast = {
    success: (message, options) => emit('success', message, options),
    error: (message, options) => emit('error', message, options),
    info: (message, options) => emit('info', message, options),
};
