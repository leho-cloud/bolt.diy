/** Preview inspection is optional and must not block project filesystem restoration. */
export function withOptionalPreviewSupport<T>(container: T, initialize: () => Promise<void>): T {
  void Promise.resolve()
    .then(initialize)
    .catch(() => {
      console.warn('Az előnézet kiegészítő ellenőrzése nem indult el. A projekt futtatása folytatható.');
    });
  return container;
}
