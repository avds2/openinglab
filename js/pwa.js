const secureContextForServiceWorkers =
  location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);

function showUpdateNotice(registration) {
  const notice = document.querySelector("#pwa-update-notice");
  const apply = document.querySelector("#pwa-update-apply");
  const later = document.querySelector("#pwa-update-later");
  if (!notice || !registration.waiting) return;

  notice.hidden = false;
  apply?.addEventListener(
    "click",
    () => {
      apply.disabled = true;
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    },
    { once: true },
  );
  later?.addEventListener("click", () => {
    notice.hidden = true;
  }, { once: true });
}

function watchForUpdate(registration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateNotice(registration);
  }

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateNotice(registration);
      }
    });
  });
}

export function setupPWA() {
  if (!("serviceWorker" in navigator) || !secureContextForServiceWorkers) return;

  let controlling = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controlling) {
      controlling = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        updateViaCache: "none",
      });
      watchForUpdate(registration);

      const requestUpdate = () => registration.update().catch(() => {});
      window.addEventListener("online", requestUpdate);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") requestUpdate();
      });
    } catch {
      // The online app remains fully usable when service workers are unavailable.
    }
  }, { once: true });
}
