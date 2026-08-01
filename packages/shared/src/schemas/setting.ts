import { z } from 'zod';

// Field list mirrors legacy DEFAULT_SETTINGS exactly (LEGACY_ANALYSIS §4).
// Do not add/remove/rename fields without cross-checking the legacy file.
export const settingSchema = z.object({
  id: z.string().uuid(),
  zincPrice: z.number(),
  printRunPrice: z.number(),
  numberingRunPrice: z.number(),
  envelopeDesignPrice: z.number(),
  envelopePrintRunPrice: z.number(),
  envelopeZincPrice: z.number(),
  designPrice: z.number(),
  wasteSheetsDefault: z.number().int(),
  profitPercent: z.number(),
  notebookThreshold: z.number().int(),
  looseThreshold: z.number().int(),
  sellophanePricePerSheet: z.number(),
  logoUrl: z.string().nullable(),
  boardsBannerNoDesign: z.number(),
  boardsBannerWithDesign: z.number(),
  boardsVinylPrintCutNoSello: z.number(),
  boardsVinylPrintCutWithSello: z.number(),
  boardsVinylNormalNoSello: z.number(),
  boardsVinylNormalWithSello: z.number(),
  boardsFlex: z.number(),
  boardsSeasro: z.number(),
  boardsGapMM: z.number(),
});

export const updateSettingSchema = settingSchema.omit({ id: true }).partial();

export type Setting = z.infer<typeof settingSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
