mergeInto(LibraryManager.library, {
  LabState: function (pointer) {
    window.dispatchEvent(new CustomEvent('unity-lab-state', { detail: JSON.parse(UTF8ToString(pointer)) }));
  },
  LabSave: function (pointer) {
    try {
      localStorage.setItem(window.unityLabStorageKey || 'UnityCourseLab.Scene.v1', UTF8ToString(pointer));
      window.dispatchEvent(new CustomEvent('unity-lab-storage', { detail: { ok: true } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('unity-lab-storage', { detail: { ok: false, message: String(error) } }));
    }
  },
  LabExport: function (pointer) {
    window.dispatchEvent(new CustomEvent('unity-lab-export', { detail: JSON.parse(UTF8ToString(pointer)) }));
  },
  LabReady: function () {
    window.dispatchEvent(new CustomEvent('unity-lab-ready'));
  }
});

