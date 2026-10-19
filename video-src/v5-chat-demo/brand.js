// Brand inputs — referenced read-only. Crops are [sx, sy, sw, sh] in source pixels (content box from assets.mjs).
// *Blend: 'multiply' = opaque logo on white paper (draw only on light cards), 'screen' = on black paper; null = transparent.
// Never retype a wordmark as live text; if a variant is missing, ask for the approved file.
var BRAND = {
  "logoWide": "file:///C:/Data/1.Projects/LAP-KE-HOACH-SX/HUNG-NHAN/PlanGo/public/plango-lockup-light.png",
  "logoWideCrop": [
    168,
    90,
    667,
    200
  ],
  "logoWideBlend": null,
  "logoWideInverse": null,
  "logoWideInverseCrop": null,
  "logoWideInverseBlend": null,
  "mark": null,
  "markCrop": null,
  "markBlend": null
};
