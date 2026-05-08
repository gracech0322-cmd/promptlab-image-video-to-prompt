export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read the selected image file."));
    };

    reader.onerror = () => reject(new Error("Could not read the selected image file."));
    reader.readAsDataURL(file);
  });
}

function base64FromBytes(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

export async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error("Could not load this image for analysis.");
  }

  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = base64FromBytes(new Uint8Array(arrayBuffer));

  return `data:${mimeType};base64,${base64}`;
}
