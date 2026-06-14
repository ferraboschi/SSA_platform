"use client";

import { PL_HeatmapView } from "./view-heatmap";
import { PL_TimelineView } from "./view-timeline";
import { PL_BarsByTypeView } from "./view-bars";
import { PL_CityMonthGridView } from "./view-city";
import { PL_EducatorMonthGridView } from "./view-educator";

export const PL_Views = {
  Heatmap: PL_HeatmapView,
  Timeline: PL_TimelineView,
  BarsByType: PL_BarsByTypeView,
  CityMonthGrid: PL_CityMonthGridView,
  EducatorMonthGrid: PL_EducatorMonthGridView,
};
