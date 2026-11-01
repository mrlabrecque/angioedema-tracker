/** A file fetched with the in-memory token, ready to be saved. */
export interface PreparedFile {
  blob: Blob;
  name: string;
  url: string;
}

export function prepareFile(blob: Blob, name: string): PreparedFile {
  return { blob, name, url: URL.createObjectURL(blob) };
}

/**
 * Saves a prepared file. On iPhone the share sheet ("Save to Files") is the reliable route, and it must
 * start from a tap, so this is called from a button's click handler after the file is ready.
 */
export async function saveFile(f: PreparedFile): Promise<"shared" | "downloaded"> {
  const file = new File([f.blob], f.name, { type: f.blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: f.name });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared"; // user closed the sheet
    }
  }
  const a = document.createElement("a");
  a.href = f.url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "downloaded";
}
