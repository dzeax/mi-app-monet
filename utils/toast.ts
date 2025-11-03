'use client';

type ToastVariant = 'success' | 'error' | 'info';

const DEFAULT_DURATION = 2600;

export function showToast(message: string, opts?: { variant?: ToastVariant; duration?: number }) {
  if (typeof document === 'undefined') return;
  const { variant = 'success', duration = DEFAULT_DURATION } = opts || {};

  const host = document.createElement('div');
  host.className = 'fixed bottom-4 right-4 z-[300]';

  const toast = document.createElement('div');
  toast.className =
    'pointer-events-auto select-none rounded-lg border px-3 py-2 shadow-xl text-sm transition-all';
  toast.style.borderColor = 'var(--color-border)';
  toast.style.background = 'var(--color-surface)';
  toast.style.color = 'var(--color-text)';
  toast.style.transform = 'translateY(8px)';
  toast.style.opacity = '0';

  if (variant === 'error') {
    toast.style.outline = '1px solid rgba(239, 68, 68, 0.35)';
    toast.style.boxShadow = '0 16px 40px rgba(239, 68, 68, 0.16)';
  } else if (variant === 'info') {
    toast.style.outline = '1px solid rgba(59, 130, 246, 0.35)';
    toast.style.boxShadow = '0 16px 40px rgba(59, 130, 246, 0.16)';
  } else {
    toast.style.outline = '1px solid rgba(16, 185, 129, 0.3)';
    toast.style.boxShadow = '0 16px 40px rgba(16, 185, 129, 0.14)';
  }

  toast.textContent = message;

  host.appendChild(toast);
  document.body.appendChild(host);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  window.setTimeout(() => {
    toast.style.transform = 'translateY(8px)';
    toast.style.opacity = '0';
    window.setTimeout(() => {
      try {
        document.body.removeChild(host);
      } catch {
        /* noop */
      }
    }, 220);
  }, duration);
}

export function showSuccess(message: string, duration?: number) {
  showToast(message, { variant: 'success', duration });
}

export function showError(message: string, duration?: number) {
  showToast(message, { variant: 'error', duration });
}

export function showInfo(message: string, duration?: number) {
  showToast(message, { variant: 'info', duration });
}
