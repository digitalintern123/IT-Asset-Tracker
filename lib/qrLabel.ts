/**
 * QR label printing and sharing (web). Works from the QR code's rendered
 * <svg>: printing embeds it as vector (sharp at any size); sharing converts it
 * to a PNG file.
 */

import type { Asset } from "@/types/asset";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** File-name-safe host name, e.g. "ENC-DEL-LT-001-QR.png". */
export function qrFileName(asset: Pick<Asset, "name" | "id">): string {
  const base = String(asset.name || asset.id || "asset").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "asset"}-QR.png`;
}

/** The printable label: QR (5 cm) with the device details underneath. */
export function labelHtml(asset: Asset, svgMarkup: string): string {
  const makeModel = [asset.make, asset.model].filter(Boolean).join(" ");
  const lines = [
    `<div class="host">${escapeHtml(asset.name)}</div>`,
    `<div>Asset ID: ${escapeHtml(asset.id)}</div>`,
    asset.serialNumber ? `<div>S/N: ${escapeHtml(asset.serialNumber)}</div>` : "",
    makeModel ? `<div>${escapeHtml(makeModel)}</div>` : "",
    `<div class="foot">Encalm IT — scan to view</div>`,
  ].join("");
  return [
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(asset.name)} — QR label</title>`,
    `<style>`,
    `@page{margin:8mm}body{font-family:Segoe UI,Arial,sans-serif;margin:0;color:#000}`,
    `.label{display:inline-flex;flex-direction:column;align-items:center;gap:4px;border:1px dashed #999;padding:4mm;width:60mm;text-align:center;font-size:10pt}`,
    `.label svg{width:50mm;height:50mm}.host{font-weight:700;font-size:12pt}.foot{font-size:8pt;color:#444;margin-top:2px}`,
    `@media print{.label{border:none}}`,
    `</style></head><body><div class="label">${svgMarkup}${lines}</div></body></html>`,
  ].join("");
}

/** Open the label in a new window and show the print dialog. */
export function printQrLabel(asset: Asset, svg: SVGElement): boolean {
  const w = window.open("", "_blank", "width=420,height=560");
  if (!w) return false;
  w.document.open();
  w.document.write(labelHtml(asset, new XMLSerializer().serializeToString(svg)));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

/** PNG of the QR (white margin, `size` px square). */
export function qrPngBlob(svg: SVGElement, size = 600): Promise<Blob> {
  const markup = new XMLSerializer().serializeToString(svg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const pad = Math.round(size * 0.08);
      canvas.width = canvas.height = size + pad * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas is not available"));
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, size, size);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), "image/png");
    };
    img.onerror = () => reject(new Error("Could not draw the QR code"));
    img.src = url;
  });
}

/** Share the QR as a PNG (phones), else download it. */
export async function shareQr(asset: Asset, svg: SVGElement): Promise<"shared" | "downloaded"> {
  const blob = await qrPngBlob(svg);
  const name = qrFileName(asset);
  const file = typeof File !== "undefined" ? new File([blob], name, { type: "image/png" }) : null;
  const nav: any = typeof navigator !== "undefined" ? navigator : null;
  if (file && nav?.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: `${asset.name} QR`, text: `${asset.name} (${asset.id})` });
      return "shared";
    } catch (err: any) {
      if (err?.name === "AbortError") return "shared";
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
  return "downloaded";
}
