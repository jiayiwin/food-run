"""Fix the one smudged (outline-less, blurred) garment on the 5th-floor balcony of park_mid_1_v3 by copying
the matching balcony window+laundry rectangle from floor 1 of the SAME image (floors repeat at +664 px from floor 1
to floor 5, dx=0, found by image matching on the window/AC columns). Input: cleaned sheet, output: patched sheet."""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
X0, X1 = 45, 258      # balcony window opening incl. laundry, inside the balcony outline
Y0, Y1 = 113, 212     # floor-1 rows: below window head, above balcony slab
OFF = 664
patch = im.crop((X0, Y0, X1, Y1))
im.paste(patch, (X0, Y0 + OFF))
im.save(out)
print('patched', out)
