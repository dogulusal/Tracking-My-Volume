/**
 * Clipboard write with a fallback for the cases the async API refuses:
 * a non-secure origin, or an older mobile browser. Returns false when both
 * paths fail, so the caller can fall back to showing the text for a manual
 * select-and-copy instead of claiming a copy that never happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or no user gesture — try the textarea route.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    // Keep it off-screen but still selectable; position:fixed avoids the
    // scroll jump a plain off-screen element causes on iOS.
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
