// 统一图片压缩：最长边 maxEdge、JPEG quality——够视觉模型识别，流量友好。
// 快路 createImageBitmap（低内存、快），慢路 <img>+objectURL（iOS Safari 解 HEIC 靠它）。
// 两条都挂抛错——调用方必须显式告诉买家，绝不静默（演示场合静默=事故）。
export async function compressImageToDataURL(file: File, maxEdge = 1024, quality = 0.82): Promise<string> {
  const paint = (srcW: number, srcH: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): string => {
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    draw(canvas.getContext("2d")!, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  };
  try {
    const bmp = await createImageBitmap(file);
    try {
      return paint(bmp.width, bmp.height, (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h));
    } finally {
      bmp.close();
    }
  } catch {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<string>((resolve, reject) => {
        const im = new Image();
        im.onload = () => {
          if (!im.naturalWidth) return reject(new Error("empty"));
          resolve(paint(im.naturalWidth, im.naturalHeight, (ctx, w, h) => ctx.drawImage(im, 0, 0, w, h)));
        };
        im.onerror = () => reject(new Error("decode failed"));
        im.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
