'use client';

import { useState, useEffect, useCallback } from 'react';
import './Toast.css';

export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
    duration?: number;
}

interface ToastProps {
    toasts: ToastMessage[];
    onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove(toast.id);
        }, toast.duration || 3000);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onRemove]);

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
    };

    return (
        <div className={`toast toast-${toast.type}`}>
            <span className="toast-icon">{icons[toast.type]}</span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => onRemove(toast.id)}>×</button>
        </div>
    );
}

export function ToastContainer({ toasts, onRemove }: ToastProps) {
    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

// Hook for managing toasts
export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((type: ToastMessage['type'], message: string, duration = 3000) => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, type, message, duration }]);
        return id;
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const success = useCallback((message: string) => addToast('success', message), [addToast]);
    const error = useCallback((message: string) => addToast('error', message, 5000), [addToast]);
    const info = useCallback((message: string) => addToast('info', message), [addToast]);

    return { toasts, addToast, removeToast, success, error, info };
}
