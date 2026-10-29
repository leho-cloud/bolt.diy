/** Truncated native tool JSON must never be resumed as plain assistant text. */
export function assertTextContinuation(hasNativeTools: boolean) {
  if (hasNativeTools) {
    throw new Error(
      'A fájlírás válasza elérte a hosszkorlátot. A befejezett fájlok megmaradtak; a hiányzó részt kisebb lépésben kell folytatni.',
    );
  }
}
