"""Write generateImage request bodies for the bg batch. Usage: python mk.py <id> [<id> ...] (suffix _vN in name allowed via --tag)."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

PREFIX = ("Flat vector cartoon sticker art for a cute 2D side-scrolling mobile game: thick uniform dark-purple outlines (#2b2233) "
          "around every shape, flat color fills with exactly one hard-edged cel-shade step, no gradients, no texture, warm sunset "
          "palette of coral, peach, cream, lavender and teal accents, clean bold graphic shapes readable at small size, strict side "
          "view orthographic elevation, transparent background, absolutely no text, no letters, no numbers, no digits, no logos, "
          "no brand trade dress.")

SHEET = ("Every module's bottom sits exactly on one straight horizontal baseline at the very bottom edge of the image, perfectly "
         "flat side elevation, no perspective, no vanishing point. Each module is one single connected piece with a closed outline. "
         "NO sky, NO ground strip, NO floor strip, NO grass strip, NO road, NO people, NO cast shadows on the ground, NO clouds, "
         "NO background wall: everything outside the modules is fully transparent, and the wide gaps between modules are empty "
         "transparent space.")

P = {}

P['park_mid_1'] = PREFIX + (
    " Background modules for the middle parallax layer of a cozy Chinese residential compound (xiaoqu) at evening, laid out as a "
    "sprite sheet: exactly 4 SEPARATE free-standing modules arranged side by side in one row from left to right, with WIDE fully "
    "transparent gaps between them (no module touches or overlaps another): "
    "(1) a tall narrow section of a 6-storey apartment block, flat cream and peach facade with a balcony on every floor, laundry "
    "(shirts and towels) hanging on poles on some balconies, small AC units, warm glowing yellow evening windows, flat roof edge; "
    "(2) a big round leafy tree with a cloud-like teal-green canopy and a short sturdy brown trunk; "
    "(3) a low bicycle shed with a sloped teal metal roof on thin posts sheltering three parked bicycles seen exactly from the side; "
    "(4) a small community notice board on two legs with a little roof, its panel showing only simple pictogram icons (a heart, a "
    "leaf, a little house), no writing. "
    "Realistic relative scale between modules: the apartment block is the tallest and fills most of the image height, the tree is "
    "about half as tall, the shed and notice board are short. Warm evening light from the left: the left side of every element is "
    "lit peach, the right side one shade darker. " + SHEET)

P['park_mid_2'] = PREFIX + (
    " Background modules for the middle parallax layer of a cozy Chinese residential compound (xiaoqu) at evening, laid out as a "
    "sprite sheet: exactly 4 SEPARATE free-standing modules arranged side by side in one row from left to right, with WIDE fully "
    "transparent gaps between them (no module touches or overlaps another): "
    "(1) a tall narrow section of a 6-storey apartment block in coral and cream, a balcony on every floor with potted plants and "
    "hanging laundry, warm glowing yellow evening windows, a ground-floor building entrance door under a small canopy, no house "
    "numbers, flat roof edge; "
    "(2) a traditional Chinese garden pavilion with an upturned tiled roof, red columns and a bench between the columns; "
    "(3) a children's playground slide with a ladder, a small platform with railings and a curved coral slide chute; "
    "(4) a long low trimmed green hedge with a tall slim street lamp at its end glowing warm yellow. "
    "Realistic relative scale between modules: the apartment block is the tallest and fills most of the image height, the "
    "pavilion is about a third as tall, the slide and hedge are short, the lamp is a bit taller than the pavilion. Warm evening "
    "light from the left: the left side of every element is lit peach, the right side one shade darker. " + SHEET)

P['home_mid_1'] = PREFIX + (
    " Background modules for the middle parallax layer of a cozy old Chinese apartment STAIRWELL interior at evening, laid out as "
    "a sprite sheet: exactly 3 SEPARATE free-standing modules arranged side by side in one row from left to right, with WIDE fully "
    "transparent gaps between them (no module touches or overlaps another): "
    "(1) an apartment front door seen flat from the front as a wall elevation: a sturdy warm wood-brown security door inside a "
    "cream door frame, round handle, small peephole, a red paper diamond decoration with no writing on it, and a plain coral "
    "doormat lying on the floor at the foot of the door shown as a thin flat strip, no text, no door number; "
    "(2) a bank of residents' mailboxes: a freestanding teal metal cabinet with a grid of small mailbox doors (4 columns by 3 "
    "rows), each with a little slot and knob, standing on short legs, no numbers, no labels; "
    "(3) a low wooden shoe cabinet with two closed doors, with a few pairs of sneakers and a pair of slippers on top and a folded "
    "umbrella leaning against its side. "
    "Realistic relative scale: the door is the tallest module, the mailbox bank about two thirds of the door height, the shoe "
    "cabinet about one third. Warm yellow corridor lamp light, cream and wood tones with teal and coral accents: the left side of "
    "every element is lit warm, the right side one shade darker. " + SHEET)

P['home_mid_2'] = PREFIX + (
    " Background modules for the middle parallax layer of a cozy old Chinese apartment STAIRWELL interior at evening, laid out as "
    "a sprite sheet: exactly 3 SEPARATE free-standing modules arranged side by side in one row from left to right, with WIDE fully "
    "transparent gaps between them (no module touches or overlaps another): "
    "(1) an electric meter box: a cream-grey metal utility cabinet with a small glass window showing three round meter dials with "
    "blank faces (no numbers), a little lightning pictogram, mounted on a thick vertical conduit pipe that runs straight down to "
    "the floor; "
    "(2) a stairwell window module: a narrow vertical wall pier of cream plaster with a wood-tone painted lower dado band, reaching "
    "down to the floor, with a window in its upper half showing a warm sunset glow through the panes and a terracotta potted green "
    "plant sitting on the deep window sill; "
    "(3) a stair handrail section: a short flight of concrete steps rising to the right seen exactly from the side, with a slanted "
    "wooden handrail on evenly spaced dark metal balusters following the slope. "
    "Realistic relative scale: the window pier is the tallest module, the stair section about as tall as the meter cabinet top. "
    "Warm yellow corridor lamp light, cream and wood tones with teal and coral accents: the left side of every element is lit "
    "warm, the right side one shade darker. " + SHEET)

P['far_park'] = PREFIX + (
    " A wide panoramic horizontal strip of distant residential high-rise apartment towers seen as silhouettes: a continuous row of "
    "tall slab-shaped and tower-shaped Chinese residential high-rises of varied heights, with small rooftop water tanks and "
    "elevator machine rooms, rendered as low-detail flat shapes in hazy muted lavender, dusty mauve and soft peach, with tiny "
    "sparse warm lit window dots (most windows unlit, only a few lit squares scattered), softer and lighter than foreground art, "
    "all bottoms aligned on one straight horizontal baseline at the bottom edge of the image, evenly spread for horizontal tiling. "
    "NO sky, NO sun, NO moon, NO clouds, NO ground, NO trees: everything outside the buildings is fully transparent. No text. "
    "For this far layer, the outlines are a soft mauve (#7a6488) instead of dark purple so it recedes into haze; no single "
    "dominant landmark tower and no cranes, just evenly varied residential towers; building bottoms touch the very bottom edge of "
    "the canvas and the row fills the full image width.")

OPAQUE = (" Every filled shape is 100% opaque solid color (alpha fully opaque everywhere inside the outlines, including foliage, "
          "laundry, glass and shading); only the empty space around the modules is transparent.")

P['park_mid_1_v2'] = P['park_mid_1'].replace(
    "(2) a big round leafy tree with a cloud-like teal-green canopy and a short sturdy brown trunk; ",
    "(2) a big round leafy tree with a solid cloud-like teal-green canopy made of a few big bumps with one darker shade step on "
    "the right, no face-like marks, no small detail lines, and a short sturdy brown trunk; ").replace(
    "(3) a low bicycle shed with a sloped teal metal roof on thin posts sheltering three parked bicycles seen exactly from the side; ",
    "(3) a low bicycle shed with a sloped teal metal roof on two posts, standing on a low concrete base slab that runs the full "
    "width between the posts, sheltering three parked bicycles seen exactly from the side whose wheels stand on that slab and "
    "lean against a continuous horizontal metal bike-rack rail joining both posts, so the shed, slab, rail and bicycles form ONE "
    "connected piece; ") + OPAQUE

P['home_mid_2_v2'] = P['home_mid_2'].replace(
    "with a window in its upper half showing a warm sunset glow through the panes and a terracotta potted green "
    "plant sitting on the deep window sill; ",
    "with a window in its upper half whose glass panes are flat solid warm amber-peach color with two short diagonal white "
    "glint stripes (no scenery, no sky, no sun, no buildings seen through the window), and a terracotta potted green plant "
    "sitting on the deep window sill; ").replace(
    "an electric meter box: a cream-grey metal utility cabinet",
    "an electric meter box: a cream-grey metal utility cabinet fixed to the wall") + OPAQUE

P['far_park_v2'] = P['far_park'].replace(
    "with small rooftop water tanks and elevator machine rooms, ",
    "with simple flat roofs topped by small plain rectangular elevator machine-room blocks (no water towers, no antennas, no "
    "thin details), ") + (" Every building is a solid 100% opaque flat shape with crisp edges, no haze transparency, no faint "
    "or ghosted elements; window dots are small solid squares.")

P['park_mid_1_v3'] = P['park_mid_1_v2'].replace(
    "sheltering three parked bicycles seen exactly from the side whose wheels stand on that slab and "
    "lean against a continuous horizontal metal bike-rack rail joining both posts, ",
    "sheltering three parked bicycles in exact side profile (each bicycle parallel to the picture plane, both round wheels "
    "visible side by side as full circles, handlebars to the right, like a bicycle icon), slightly overlapping each other in a "
    "row, their wheels standing on that slab and touching a continuous low horizontal metal bike-rack rail joining both posts, ")

P['far_park_v3'] = P['far_park'].replace(
    "with small rooftop water tanks and elevator machine rooms, ",
    "with crisp square-cornered rectangular silhouettes (no rounded tops, no cylinders), flat roofs topped by small plain "
    "rectangular elevator machine-room blocks, some slab blocks wide and some towers narrow, a few with a stepped top "
    "(no water towers, no antennas, no thin details), ") + (" Every building is a solid 100% opaque flat shape with crisp "
    "edges, no haze transparency, no faint or ghosted elements; window dots are small solid squares.")


def body(aid, name):
    return {"command": "image.generate",
            "args": [{"prompt": P[aid if aid in P else aid], "model": "gpt-image-2.5-flare", "quality": "medium", "aspectRatio": "16:9",
                      "imageSize": "2K", "background": "transparent", "name": name}]}


if __name__ == '__main__':
    tag = ''
    ids = []
    for a in sys.argv[1:]:
        if a.startswith('--tag='):
            tag = a[6:]
        else:
            ids.append(a)
    for aid in ids:
        name = aid + (('_' + tag) if tag else '')
        path = os.path.join(HERE, 'req_' + name + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(body(aid, name), f, ensure_ascii=False)
        print(path)
