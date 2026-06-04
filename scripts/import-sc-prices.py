#!/usr/bin/env python3
# Refresh the SC B2B price snapshot (column W = "B2B Price no VAT", keyed by ID)
# from the Dropbox pricing master into the committed JSON the catalog reads.
# Usage: python3 scripts/import-sc-prices.py
import openpyxl, json, os
SRC = "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/SC-FT team/SC TEAM/MASTER 2025/00 PRODUCT PRICING.xlsx"
OUT = os.path.join(os.path.dirname(__file__), "..", "src/lib/integrations/sakecompany/sc-b2b-prices.json")
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["Sheet1"]
out = {}
for row in ws.iter_rows(min_row=5, values_only=True):  # header is row 4
    code, w = row[0], row[22]  # A = ID, W = B2B Price no VAT
    if code is None:
        continue
    code = str(code).strip()
    if code and isinstance(w, (int, float)) and w > 0:
        out[code] = round(float(w), 2)
with open(OUT, "w") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=0, sort_keys=True)
print(f"wrote {len(out)} prices to {OUT}")
