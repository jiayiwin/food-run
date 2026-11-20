"""美术资源管线：把 AI 出图的原图加工成游戏能直接用的图集和清单。

用法（在项目根目录）：
  python tools/art/build.py clean  <in.png> <out.png>                 去透明底光晕、去碎屑、裁到内容
  python tools/art/build.py layer  <in.png> <out.png> --h 300          背景层：去光晕 → 底边对齐 → 缩放 → 横向无缝 → 压缩
  python tools/art/build.py slice  <sheet.png> <outdir>                把「部件表」切成独立部件 + 带编号的预览图
  python tools/art/build.py build  <spec.json>                         按清单规格打包角色图集、背景层，生成 js/data/art.js

spec.json（相对项目根目录的路径）：
{
  "dpr": 2,
  "bg": { "street": { "mid": { "src": "raw/street_mid.png", "h": 300, "par": 0.5, "blend": 140 },
                      "far": { "src": "raw/street_far.png", "h": 220, "par": 0.15, "dy": -60 } } },
  "chars": { "player": { "parts": { "head": "raw/player/head.png", "torso": "...", "armU": "...", "armL": "...",
                                     "legU": "...", "legL": "...", "shoe": "..." },
                         "heads": { "normal": "...", "panic": "...", "happy": "..." },
                         "pivots": { "head": [0.5, 0.55, 0.42] } } }
}
四肢图会自动转成竖直（主轴朝下），枢轴放在上端；头的枢轴默认在包围盒中心偏下，r 取宽度的 42%。
pivots 可手动覆盖：四肢 [px, py, len]（比例，相对部件包围盒），头 [px, py, r]，躯干 [px, py, len]。

可读性后处理（都不用重新出图）：
  道具  "rim": "ground" | "float"     米白外圈（顶层 rimPx / rimColor）；落地的底边不加，悬空的四边都加。清单写 rim、bbox
        "fix": [{"op": "hue" | "desat" | "erase", ...}]   原图分辨率换色 / 去饱和 / 擦除
        "post": [{"op": "rope" | "tread", ...}]          成品分辨率重画绳子 / 台阶踏步边
        "grade": {"sat", "ink", "inkDark", "v"}          背景类道具调色
        "hole" / "anchors" / "centerOn": "hole"          门洞、锚点（比例坐标换算成逻辑 px）
  中景  "grade"（整层调色）、"veil"（抄 tune.js 的 VEIL，只用来算跳跃带）、"backdropFull"（整块铺墙）、"dy"（后人行道）
        模块组 {"src", "h", "skip": [文件名], "fix": {文件名: [...]}}
打包结束：删掉清单没引用的旧图；写 tools/art/report.json（主色扇区、跳跃带指标）；跳跃带超标直接报错；源图缺的条目跳过。
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


# ── 透明底清理 ─────────────────────────────────────────────
def alpha_stats(im):
    a = np.asarray(im.getchannel('A'))
    n = a.size
    return {'transparent': round(float((a == 0).sum()) / n, 3), 'semi': round(float(((a > 0) & (a < 250)).sum()) / n, 3), 'opaque': round(float((a >= 250).sum()) / n, 3)}


def clean_alpha(im, core=250, grow=7, min_area_frac=0.002):
    """AI 出的「透明底」常带一圈灰色半透明光晕：只保留不透明核心 + 外扩几像素的抗锯齿边，其余清零；再去掉小碎块。"""
    im = im.convert('RGBA')
    a = im.getchannel('A')
    core_mask = a.point(lambda v: 255 if v >= core else 0)
    keep = core_mask.filter(ImageFilter.MaxFilter(grow))
    a2 = Image.fromarray(np.minimum(np.asarray(a), np.asarray(keep)))
    im.putalpha(a2)
    return drop_specks(im, min_area_frac)


def components(mask, scale=4):
    """在缩小的掩码上做连通域（纯 numpy + BFS，本机没有 scipy）。返回 [(面积, (x0,y0,x1,y1)) ...]，坐标是原图尺度。"""
    h, w = mask.shape
    small = Image.fromarray((mask * 255).astype(np.uint8)).resize((max(1, w // scale), max(1, h // scale)), Image.NEAREST)
    m = np.asarray(small) > 0
    sh, sw = m.shape
    lab = np.zeros((sh, sw), dtype=np.int32)
    out = []
    cur = 0
    for y in range(sh):
        row = m[y]
        for x in range(sw):
            if not row[x] or lab[y, x]:
                continue
            cur += 1
            q = deque([(y, x)])
            lab[y, x] = cur
            x0 = x1 = x
            y0 = y1 = y
            area = 0
            while q:
                cy, cx = q.popleft()
                area += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1), (cy - 1, cx - 1), (cy - 1, cx + 1), (cy + 1, cx - 1), (cy + 1, cx + 1)):
                    if 0 <= ny < sh and 0 <= nx < sw and m[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
            out.append((area * scale * scale, (x0 * scale, y0 * scale, min(w, (x1 + 1) * scale), min(h, (y1 + 1) * scale)), cur))
    return out, lab, scale


def drop_specks(im, min_area_frac):
    a = np.asarray(im.getchannel('A'))
    mask = a > 8
    comps, lab, scale = components(mask)
    if not comps:
        return im
    total = sum(c[0] for c in comps)
    small_ids = [c[2] for c in comps if c[0] < total * min_area_frac]
    if not small_ids:
        return im
    big = np.isin(lab, small_ids, invert=True)
    big_full = np.asarray(Image.fromarray((big * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0]), Image.NEAREST)) > 0
    im.putalpha(Image.fromarray(np.where(big_full, a, 0).astype(np.uint8)))
    return im


def crop_content(im, pad=2):
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


# ── 背景层 ───────────────────────────────────────────────
def make_tileable(im, blend):
    """横向无缝：把右端 blend 像素和左端交叉淡化（预乘 alpha，避免接缝发灰），输出宽度 W - blend。"""
    arr = np.asarray(im.convert('RGBA')).astype(np.float32) / 255.0
    h, w, _ = arr.shape
    blend = max(8, min(blend, w // 3))
    rgb, a = arr[..., :3] * arr[..., 3:4], arr[..., 3:4]
    out_rgb, out_a = rgb[:, : w - blend].copy(), a[:, : w - blend].copy()
    t = np.linspace(0, 1, blend, dtype=np.float32)[None, :, None]
    out_rgb[:, :blend] = rgb[:, w - blend:] * (1 - t) + rgb[:, :blend] * t
    out_a[:, :blend] = a[:, w - blend:] * (1 - t) + a[:, :blend] * t
    col = np.where(out_a > 1e-4, out_rgb / np.maximum(out_a, 1e-4), 0)
    res = np.concatenate([col, out_a], axis=2)
    return Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def build_modules(sheets, outdir, stage, name, h_tallest, dpr=2, G=None):
    """背景模块：每张表里切出独立的楼 / 墙面，同一张表统一缩放（最高的那块 = h_tallest 逻辑像素），底边对齐。
    sheet 可以写成 {"src", "h", "skip": [文件名], "fix": {文件名: [fix 操作]}}：skip 剔除像障碍的假模块，fix 按文件修补。
    G：整层调色（grade）。返回 (模块清单, 字节数, 调色后的图)，图给跳跃带统计用。"""
    mods, total, ims = [], 0, []
    import glob as _glob
    for si, sheet in enumerate(sheets):
        h_group, skip, fixes = h_tallest, set(), {}
        if isinstance(sheet, dict):      # {"src": 路径或通配符, "h": 这一组最高那块的逻辑高度}
            h_group, skip, fixes, sheet = sheet.get('h', h_tallest), set(sheet.get('skip', [])), sheet.get('fix', {}), sheet['src']
        if '*' in sheet:                 # 一组已经切好的模块图：同组统一缩放
            files = [f for f in sorted(_glob.glob(os.path.join(ROOT, sheet))) if os.path.basename(f) not in skip]
            group = [apply_fix(crop_content(clean_alpha(Image.open(f), min_area_frac=0.0005), pad=0), fixes.get(os.path.basename(f))) for f in files]
            if not group:
                continue
            k = h_group * dpr / max(im.height for im in group)
            for mi, part in enumerate(group):
                part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS)
                part = grade(part, G)
                rel = f'bg/{stage}_{name}_{si}_{mi}.png'
                total += save_png(part, os.path.join(outdir, rel))
                mods.append({'src': rel, 'w': round(part.width / dpr, 1), 'h': round(part.height / dpr, 1)})
                ims.append(part)
            continue
        im = clean_alpha(Image.open(os.path.join(ROOT, sheet)), min_area_frac=0.0005)
        a = np.asarray(im.getchannel('A')) > 8
        comps, _, _ = components(a)
        tot = sum(c[0] for c in comps) or 1
        comps = sorted([c for c in comps if c[0] >= tot * 0.02], key=lambda c: c[1][0])
        if not comps:
            continue
        tallest = max(c[1][3] - c[1][1] for c in comps)
        k = h_group * dpr / tallest
        for mi, (_, (x0, y0, x1, y1), _) in enumerate(comps):
            part = crop_content(im.crop((x0, y0, x1, y1)), pad=0)
            part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS)
            part = grade(part, G)
            rel = f'bg/{stage}_{name}_{si}_{mi}.png'
            total += save_png(part, os.path.join(outdir, rel))
            mods.append({'src': rel, 'w': round(part.width / dpr, 1), 'h': round(part.height / dpr, 1)})
            ims.append(part)
    return mods, total, ims


def gap_cut(im, search=0.3, thresh=0.04):
    """楼和楼之间有空隙时，左右各在空隙处切开：平铺接缝落在空隙里，完全看不出来。找不到空隙返回 None。"""
    a = np.asarray(im.getchannel('A')).astype(np.float32) / 255.0
    cov = a.mean(axis=0)
    w = len(cov)
    s = max(1, int(w * search))
    left = int(np.argmin(cov[:s]))
    right = w - s + int(np.argmin(cov[w - s:]))
    if cov[left] < thresh and cov[right] < thresh and right - left > w * 0.5:
        return im.crop((left, 0, right, im.height))
    return None


def save_png(im, path, colors=256):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    q = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(path, optimize=True)
    return os.path.getsize(path)


def build_layer(src, out, h, dpr=2, blend=140, opaque=False):
    im = Image.open(src).convert('RGBA')
    if not opaque:
        im = clean_alpha(im, min_area_frac=0.003)        # 远景条带：去掉飘在天上的碎块（塔吊残片等）
        bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        if bbox:  # 左右不裁（要平铺），只裁上方空白；底边对齐到内容底部
            im = im.crop((0, bbox[1], im.width, bbox[3]))
    ph = int(h * dpr)
    im = im.resize((max(1, round(im.width * ph / im.height)), ph), Image.LANCZOS)
    cut = None if opaque else gap_cut(im)
    im = cut if cut is not None else make_tileable(im, int(blend * dpr))
    size = save_png(im, out)
    return {'w': round(im.width / dpr, 2), 'h': h, 'bytes': size}


# ── 角色部件 ─────────────────────────────────────────────
def slice_sheet(src, outdir, min_frac=0.004):
    im = clean_alpha(Image.open(src))
    a = np.asarray(im.getchannel('A')) > 8
    comps, _, _ = components(a)
    total = sum(c[0] for c in comps) or 1
    comps = sorted([c for c in comps if c[0] >= total * min_frac], key=lambda c: (c[1][1] // 200, c[1][0]))
    os.makedirs(outdir, exist_ok=True)
    preview = Image.new('RGBA', im.size, (40, 36, 52, 255))
    preview.alpha_composite(im)
    d = ImageDraw.Draw(preview)
    info = []
    for i, (area, (x0, y0, x1, y1), _) in enumerate(comps):
        part = crop_content(im.crop((x0, y0, x1, y1)))
        p = os.path.join(outdir, f'part_{i:02d}.png')
        part.save(p)
        d.rectangle((x0, y0, x1, y1), outline=(255, 80, 80, 255), width=3)
        d.text((x0 + 4, y0 + 4), str(i), fill=(255, 255, 0, 255))
        info.append({'i': i, 'file': p, 'bbox': [x0, y0, x1, y1], 'area': area})
    preview.save(os.path.join(outdir, 'preview.png'))
    return info


def principal_angle(im):
    a = np.asarray(im.getchannel('A')) > 40
    ys, xs = np.nonzero(a)
    if len(xs) < 10:
        return 0.0
    x, y = xs - xs.mean(), ys - ys.mean()
    cov = np.cov(np.vstack([x, y]))
    vals, vecs = np.linalg.eigh(cov)
    vx, vy = vecs[:, np.argmax(vals)]
    return math.degrees(math.atan2(vy, vx))


def orient_limb(im):
    """把肢体转成竖直（主轴朝下）。"""
    ang = principal_angle(im)
    rot = 90 - ang          # 让主轴对准 +y
    while rot > 90:         # 主轴方向有正负两种：取转得最少的那个，免得本来竖着的肢体被倒过来
        rot -= 180
    while rot < -90:
        rot += 180
    out = crop_content(im.rotate(-rot, resample=Image.BICUBIC, expand=True))
    return out


def part_def(kind, im, pv=None):
    w, h = im.size
    if kind in ('head', 'normal', 'panic', 'happy'):
        px, py, r = pv or (0.5, 0.56, 0.42)
        return {'px': round(w * px, 1), 'py': round(h * py, 1), 'r': round(w * r, 1)}
    if kind == 'torso':
        px, py, ln = pv or (0.5, 0.94, 0.82)
        return {'px': round(w * px, 1), 'py': round(h * py, 1), 'len': round(h * ln, 1)}
    if kind == 'shoe':
        px, py = (pv or (0.28, 0.3))[:2]
        return {'px': round(w * px, 1), 'py': round(h * py, 1)}
    # 四肢：枢轴在上端，长度 = 上端关节到下端关节
    px, py, ln = pv or (0.5, min(0.5, w / max(1, h) / 2), 1 - min(0.9, w / max(1, h)))
    return {'px': round(w * px, 1), 'py': round(h * py, 1), 'len': round(h * ln, 1)}


def pack(images, pad=4, max_w=1024):
    """简单的行式装箱：按高度从大到小排，一行放满换行。返回 (图集, {名字: (x, y)})。"""
    items = sorted(images.items(), key=lambda kv: -kv[1].height)
    x = y = row_h = 0
    pos = {}
    width = min(max_w, max(im.width for _, im in items) + pad * 2) if items else 1
    width = max(width, min(max_w, sum(im.width + pad for _, im in items)))
    for name, im in items:
        if x + im.width + pad > width:
            x, y, row_h = 0, y + row_h + pad, 0
        pos[name] = (x + pad, y + pad)
        x += im.width + pad
        row_h = max(row_h, im.height + pad)
    atlas = Image.new('RGBA', (width, y + row_h + pad * 2), (0, 0, 0, 0))
    for name, im in items:
        atlas.alpha_composite(im, pos[name])
    return atlas, pos


def build_char(cid, spec, outdir, target_head_px=48):
    """加工一个角色：清理 → 四肢竖直化 → 按「头半径 = target_head_px/2」统一缩放 → 打包图集 → 部件定义。"""
    raw = {}
    for kind, path in (spec.get('parts') or {}).items():
        im = crop_content(clean_alpha(Image.open(os.path.join(ROOT, path))))
        raw[kind] = orient_limb(im) if kind in ('armU', 'armL', 'legU', 'legL') else im
    for kind, path in (spec.get('heads') or {}).items():
        raw['head_' + kind] = crop_content(clean_alpha(Image.open(os.path.join(ROOT, path))))
    head_im = raw.get('head') or raw.get('head_normal')
    if head_im is None:
        raise SystemExit(f'{cid}: 至少要有 head 或 heads.normal')
    pv = spec.get('pivots', {})
    head_r = part_def('head', head_im, pv.get('head'))['r']
    k = (target_head_px / 2) / head_r
    def kk(n, im):           # 表情头各自按自己的头半径归一，保证换表情时头不忽大忽小
        if n.startswith('head_'):
            return (target_head_px / 2) / part_def('head', im, pv.get(n))['r']
        return k
    scaled = {n: im.resize((max(1, round(im.width * kk(n, im))), max(1, round(im.height * kk(n, im)))), Image.LANCZOS) for n, im in raw.items()}
    atlas, pos = pack(scaled)
    rel = f'chars/{cid}.png'
    size = save_png(atlas, os.path.join(outdir, rel))
    parts, heads = {}, {}
    for name, im in scaled.items():
        kind = name[5:] if name.startswith('head_') else name
        d = part_def('head' if name.startswith('head_') else kind, im, pv.get(name) or pv.get(kind))
        d.update({'sx': pos[name][0], 'sy': pos[name][1], 'sw': im.width, 'sh': im.height})
        (heads if name.startswith('head_') else parts)[kind] = d
    return {'src': rel, 'parts': parts, 'heads': heads}, size


# ── 可读性后处理：换色、重画、调色、外圈、包围盒、报告 ─────────────
INK = np.array([43, 34, 51], dtype=np.float32)


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def rgb_hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.where(d > 1e-6, d, 1)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    return np.where(d > 1e-6, h, 0), np.where(mx > 0, d / np.where(mx > 0, mx, 1), 0), mx


def hsv_rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,), np.float32)
    for k, (R, G, B) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m, 0], out[m, 1], out[m, 2] = R[m], G[m], B[m]
    return out


def rect_mask(shape, rect):
    H, W = shape
    x0, y0, x1, y1 = rect
    m = np.zeros(shape, bool)
    m[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = True
    return m


# fix：在原图分辨率上做（原图大，换色边缘干净）
def op_hue(im, f):
    """色相落在 from=[lo,hi]（可跨 0°）的非墨线像素换成目标色，S/V 按选区中位数对齐到目标色等比缩放，保留明暗台阶。"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    rgb = a[..., :3] / 255
    h, s, v = rgb_hsv(rgb)
    lo, hi = f['from']
    hue_in = (h >= lo) & (h <= hi) if lo <= hi else (h >= lo) | (h <= hi)
    not_ink = np.abs(a[..., :3] - INK).sum(-1) >= 70
    m = hue_in & (s >= f.get('sMin', 0.3)) & (s <= f.get('sMax', 1.0)) & (v >= f.get('vMin', 0.25)) & (a[..., 3] > 8) & not_ink
    if f.get('rect'):
        m &= rect_mask(m.shape, f['rect'])
    if f.get('exclude'):
        m &= ~rect_mask(m.shape, f['exclude'])
    if not m.any():
        print(f'  ! hue {f["from"]}->{f["to"]} 没选中任何像素')
        return im
    th, ts, tv = (x[0, 0] for x in rgb_hsv(hex_rgb(f['to'])[None, None]))
    ns = np.clip(s * ts / max(float(np.median(s[m])), 1e-3), 0, 1)
    nv = np.clip(v * tv / max(float(np.median(v[m])), 1e-3), 0, 1)
    rgb = np.where(m[..., None], hsv_rgb(np.full_like(h, th), ns, nv), rgb)
    return Image.fromarray(np.clip(np.concatenate([rgb * 255, a[..., 3:]], -1) + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def op_desat(im, f):
    """框内非墨线像素向「目标色 × 自身明度」混合 k：背景里的同款物件变成低饱和剪影。"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    m = rect_mask(a.shape[:2], f['rect']) & (a[..., 3] > 8) & (np.abs(a[..., :3] - INK).sum(-1) >= 70)
    w = np.array([0.299, 0.587, 0.114], np.float32)
    t = hex_rgb(f['to']) * 255
    lum = (a[..., :3] @ w)[..., None] / 255
    tgt = np.clip(t * (lum / max(float(t @ w) / 255, 1e-3)) ** 0.6, 0, 255)
    k = f.get('k', 0.85)
    a[..., :3] = np.where(m[..., None], a[..., :3] * (1 - k) + tgt * k, a[..., :3])
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def op_erase(im, rect):
    a = np.asarray(im.convert('RGBA')).copy()
    a[rect_mask(a.shape[:2], rect), 3] = 0
    return Image.fromarray(a, 'RGBA')


def apply_fix(im, fixes):
    for f in fixes or []:
        im = op_erase(im, f['rect']) if f['op'] == 'erase' else {'hue': op_hue, 'desat': op_desat}[f['op']](im, f)
    return im


# post：在成品分辨率上做（粗细按逻辑 px 算才准）
def op_rope(im, f, dpr):
    """擦掉旧绳 → 4 倍超采样在底层画新绳（芯 w、墨线 ink，单位逻辑 px）→ 原图叠在上面。erase 可以是一个框或多个框。"""
    src = im.convert('RGBA')
    er = f.get('erase') or []
    for r in (er if er and isinstance(er[0], list) else [er] if er else []):
        src = op_erase(src, r)
    S = 4
    W, H = src.size
    big = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    p0 = (f['from'][0] * W * S, f['from'][1] * H * S)
    p1 = (f['to'][0] * W * S, f['to'][1] * H * S)
    core, ink = f['w'] * dpr * S, f.get('ink', 1) * dpr * S
    c = tuple(int(x * 255) for x in hex_rgb(f['color']))
    hl = tuple(min(255, int(x * 127.5 + 127.5)) for x in hex_rgb(f['color']))
    d.line([p0, p1], fill=(43, 34, 51, 255), width=round(core + 2 * ink))
    for p in (p0, p1):
        r = core / 2 + ink
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(43, 34, 51, 255))
    d.line([p0, p1], fill=c + (255,), width=round(core))
    d.line([(p0[0], p0[1] - core * 0.22), (p1[0], p1[1] - core * 0.22)], fill=hl + (255,), width=max(1, round(core * 0.25)))
    under = big.resize((W, H), Image.LANCZOS)
    under.alpha_composite(src)
    return under


def op_tread(im, f, dpr):
    """台阶踏步边：每列从顶部墨线下面开始涂 h 逻辑 px 目标色，再补 ink 逻辑 px 墨线。只处理图的上半部分。"""
    a = np.asarray(im.convert('RGBA')).copy()
    H, W = a.shape[:2]
    px, ink = round(f['h'] * dpr), round(f.get('ink', 1) * dpr)
    c = (hex_rgb(f['color']) * 255).astype(np.uint8)
    for x in range(W):
        col = a[:H // 2, x]
        op = np.nonzero(col[:, 3] > 128)[0]
        if not len(op):
            continue
        y = op[0]
        while y < len(col) and np.abs(col[y, :3].astype(int) - INK).sum() < 90:
            y += 1
        if y < len(col) - px - ink:
            a[y:y + px, x, :3] = c
            a[y + px:y + px + ink, x, :3] = INK.astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


def apply_post(im, posts, dpr):
    for f in posts or []:
        im = {'rope': op_rope, 'tread': op_tread}[f['op']](im, f, dpr)
    return im


def box_mean(x, r=4):
    p = np.pad(x.astype(np.float64), r, mode='edge')
    c = np.pad(np.cumsum(np.cumsum(p, 0), 1), ((1, 0), (1, 0)))
    k = 2 * r + 1
    return ((c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)).astype(np.float32)


def grade(im, G):
    """背景调色：饱和度 × sat；明度线性压到 v=[v0,v1]；描边像素 = ink × 墨色 + (1-ink) × 邻域均色 × inkDark。
    粗墨线只留给前景（会撞的东西），背景描边变成同色系深色。"""
    if not G:
        return im
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    h, s, v = rgb_hsv(a[..., :3] / 255)
    v0, v1 = G.get('v', [0.0, 1.0])
    new = hsv_rgb(h, s * G.get('sat', 1.0), v0 + (v1 - v0) * v)
    ink_px = (np.sqrt(((a[..., :3] - INK) ** 2).sum(-1)) < 60) & (a[..., 3] > 8)
    w = (~ink_px & (a[..., 3] > 8)).astype(np.float32)
    ws = box_mean(w)
    loc = np.stack([box_mean(new[..., i] * w) for i in range(3)], -1) / np.maximum(ws, 1e-3)[..., None]
    loc = np.where((ws > 1e-3)[..., None], loc, new)
    k = G.get('ink', 1.0)
    mixed = (INK / 255) * k + loc * G.get('inkDark', 0.7) * (1 - k)
    out = np.where(ink_px[..., None], mixed, new)
    return Image.fromarray(np.clip(np.concatenate([out * 255, a[..., 3:]], -1) + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def add_rim(im, px, color, bottom):
    """贴纸外圈：圆角外扩 px 像素，米白垫底。bottom=False 去掉底边那圈（落地的障碍不往地面下长）。
    返回 (图, 左/右/上外扩 px, 底边外扩 px)。"""
    im = im.convert('RGBA')
    W, H = im.size
    pad = px + 2
    big = Image.new('RGBA', (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    big.alpha_composite(im, (pad, pad))
    a = big.getchannel('A').point(lambda v: 255 if v > 60 else 0)
    dil = a.filter(ImageFilter.GaussianBlur(px * 0.75)).point(lambda v: 255 if v > 18 else 0).filter(ImageFilter.GaussianBlur(0.4))
    layer = Image.new('RGBA', big.size, tuple(int(x * 255) for x in hex_rgb(color)) + (0,))
    layer.putalpha(dil)
    layer.alpha_composite(big)
    out = layer.crop((pad - px, pad - px, pad + W + px, pad + H + (px if bottom else 0)))
    return out, px, (px if bottom else 0)


def content_bbox(im, dpr, ox, oy, h):
    """不透明内容包围盒（逻辑 px，相对绘制原点；y 向上为负）。"""
    b = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    if not b:
        return None
    x0, y0, x1, y1 = b
    top = oy - h                              # 图顶边的 y
    return [round(ox + x0 / dpr, 1), round(top + y0 / dpr, 1), round(ox + x1 / dpr, 1), round(top + y1 / dpr, 1)]


def find_hole(im, dpr, ox, oy, h, min_frac=0.02):
    """最大的「门洞」透明区域 → [x, y, w, h]，逻辑 px，相对绘制原点。
    碰到左、上、右边的透明区域是图外空白，不算；碰到底边的算（门洞从地面开始）。"""
    a = np.asarray(im.getchannel('A')) <= 8
    comps, _, _ = components(a)
    H, W = a.shape
    best = None
    for area, (x0, y0, x1, y1), _ in comps:
        if x0 <= 0 or y0 <= 0 or x1 >= W:
            continue
        if area >= W * H * min_frac and (best is None or area > best[0]):
            best = (area, (x0, y0, x1, y1))
    if not best:
        return None
    x0, y0, x1, y1 = best[1]
    top = oy - h
    return [round(ox + x0 / dpr, 1), round(top + y0 / dpr, 1), round((x1 - x0) / dpr, 1), round((y1 - y0) / dpr, 1)]


def hue_sector(im):
    """饱和度加权的主色扇区（0–11，30° 一格）；中性色（饱和像素 <15%）返回 None。"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    h, s, v = rgb_hsv(a[..., :3] / 255)
    m = (a[..., 3] > 200) & (np.abs(a[..., :3] - INK).sum(-1) >= 70)
    sel = m & (s > 0.35) & (v > 0.35)
    if sel.sum() < m.sum() * 0.15:
        return None
    hist = np.bincount((h[sel] // 30).astype(int) % 12, weights=s[sel], minlength=12)
    return int(np.argmax(hist))


def band_stats(mods, veil, dpr):
    """中景模块底部 60 逻辑 px（跳跃带）的统计，模拟运行时的保底暮色罩。veil = {"color": "#341E60", "alpha": 0.2}。"""
    veil = veil or {'color': '#341E60', 'alpha': 0}
    vc, va = hex_rgb(veil['color']) * 255, veil['alpha']
    S, HB, INKF, band = [], [], [], np.zeros(12)
    tot = 0
    for im in mods:
        a = np.asarray(im.convert('RGBA')).astype(np.float32)[-60 * dpr:]
        m = a[..., 3] > 200
        rgb = a[..., :3] * (1 - va) + vc * va
        h, s, v = rgb_hsv(rgb / 255)
        S.append(s[m]); HB.append(((s > .45) & (v > .55))[m]); INKF.append((np.abs(a[..., :3] - INK).sum(-1) < 70)[m])
        sel = m & (s > .35) & (v > .35)
        band += np.bincount((h[sel] // 30).astype(int) % 12, minlength=12)
        tot += m.sum()
    cat = lambda xs: np.concatenate(xs) if xs else np.zeros(1)
    return {'sMean': round(float(cat(S).mean()), 3), 'hiSatBright': round(float(cat(HB).mean()), 3),
            'ink': round(float(cat(INKF).mean()), 3), 'hueBand': [round(float(x / max(tot, 1)), 3) for x in band], 'veil': veil}


def all_srcs(manifest):
    """清单里引用到的所有图片（bg 的模块、变体，props，chars）。"""
    out = set()
    for layers in manifest['bg'].values():
        for d in layers.values():
            for m in d.get('modules') or d.get('variants') or [d]:
                out.add(m['src'])
            if d.get('src'):
                out.add(d['src'])
    for d in list(manifest['props'].values()) + list(manifest['chars'].values()):
        out.add(d['src'])
    return out


# ── 清单 ─────────────────────────────────────────────────
def build(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    dpr = spec.get('dpr', 2)
    outdir = os.path.join(ROOT, spec.get('out', 'art'))
    manifest = {'base': spec.get('base', 'art/'), 'bg': {}, 'props': {}, 'chars': {}}
    total = 0
    rim_px, rim_color = spec.get('rimPx', 3), spec.get('rimColor', '#FFF8EC')
    report = {'props': {}, 'bg': {}}
    layer_cache = {}                 # 远景去重：同一张源图、同样参数只处理一次，后面的路段引用同一个文件
    skipped = []                     # 源图还没有的条目：清单里不写，运行时走代码兜底
    exists = lambda p: os.path.exists(os.path.join(ROOT, p))
    for stage, layers in (spec.get('bg') or {}).items():
        for name, L in layers.items():
            if 'modules' in L:          # 模块式：引擎随机拼接
                mods, size, ims = build_modules(L['modules'], outdir, stage, name, L['h'], dpr, L.get('grade'))
                if not mods:
                    skipped.append(f'bg {stage}/{name}')
                    continue
                total += size
                entry = {'modules': mods, 'par': L.get('par', 0.5), 'dy': L.get('dy', 0), 'gap': L.get('gap', [6, 40]), 'w': 300, 'h': L['h']}
                for k in ('backdrop', 'backdropFull'):          # 透传给运行时
                    if L.get(k) is not None:
                        entry[k] = L[k]
                manifest['bg'].setdefault(stage, {})[name] = entry
                print(f'bg {stage}/{name}: {len(mods)} modules, {size // 1024}KB')
                if name == 'mid':
                    st = band_stats(ims, L.get('veil'), dpr)
                    report['bg'][stage] = st
                    print(f'  jump band S {st["sMean"]}  hiSB(+veil) {st["hiSatBright"]}  ink {st["ink"]}')
                    if L.get('grade') and (st['sMean'] > 0.36 or st['hiSatBright'] > 0.15 or st['ink'] > 0.12):
                        raise SystemExit(f'{stage} 跳跃带超标：{st}')
                continue
            srcs = L['src'] if isinstance(L['src'], list) else [L['src']]
            srcs = [s for s in srcs if exists(s)]
            if not srcs:
                skipped.append(f'bg {stage}/{name}')
                continue
            key = (tuple(srcs), L['h'], L.get('blend', 140), L.get('opaque', False))
            if key in layer_cache:
                manifest['bg'].setdefault(stage, {})[name] = {**layer_cache[key], 'par': L.get('par', 0.5), 'dy': L.get('dy', 0)}
                print(f'bg {stage}/{name}: 复用 {layer_cache[key]["src"]}')
                continue
            variants = []
            for vi, src in enumerate(srcs):
                rel = f'bg/{stage}_{name}{"" if vi == 0 else "_" + str(vi)}.png'
                r = build_layer(os.path.join(ROOT, src), os.path.join(outdir, rel), L['h'], dpr, L.get('blend', 140), L.get('opaque', False))
                variants.append({'src': rel, 'w': r['w'], 'h': r['h']})
                total += r['bytes']
                print(f'bg {stage}/{name}#{vi}: {r["w"]}x{r["h"]} logical, {r["bytes"] // 1024}KB')
            entry = {**variants[0], 'par': L.get('par', 0.5), 'dy': L.get('dy', 0)}
            if len(variants) > 1:
                entry['variants'] = variants
            layer_cache[key] = {k: entry[k] for k in ('src', 'w', 'h', 'variants') if k in entry}
            manifest['bg'].setdefault(stage, {})[name] = entry
    # 道具 / 障碍 / 地标：{ "src", "w"(逻辑宽), "h"(可省，按比例), "ox", "oy" }，宽度按判定框 + 画面需要自己定
    # 处理顺序：清理 → 裁剪 → fix 换色（原图分辨率）→ 翻转 → 缩放 → post 重画（成品分辨率）→ grade → bbox → rim 外圈
    for pid, P in (spec.get('props') or {}).items():
        if not exists(P['src']):
            print(f'  ! prop {pid}: 源图还没有，跳过（清单里不写，运行时走代码兜底）')
            skipped.append(f'prop {pid}')
            continue
        im = crop_content(clean_alpha(Image.open(os.path.join(ROOT, P['src']))))
        if P.get('crop'):            # 按比例裁一块（例如脚手架去掉警示条下面的腿）：[x0, y0, x1, y1]
            x0, y0, x1, y1 = P['crop']
            im = crop_content(im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height))), pad=0)
        im = apply_fix(im, P.get('fix'))
        if P.get('flip'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        w = P.get('w') or round(P['h'] * im.width / im.height, 1)     # 宽高只给一个就按原图比例算另一个
        h = P.get('h') or round(w * im.height / im.width, 1)
        im = im.resize((max(1, round(w * dpr)), max(1, round(h * dpr))), Image.LANCZOS)
        im = apply_post(im, P.get('post'), dpr)
        im = grade(im, P.get('grade'))                                 # 背景类道具（不会撞的）调色
        ox, oy = P.get('ox', 0), P.get('oy', 0)
        entry = {'src': f'props/{pid}.png', 'w': w, 'h': h, 'ox': ox, 'oy': oy}
        entry['bbox'] = content_bbox(im, dpr, ox, oy, h)               # 外圈之前记录：测试拿它对判定框
        if P.get('hole'):
            entry['hole'] = find_hole(im, dpr, ox, oy, h)
        if P.get('anchors'):                                           # 比例坐标 → 相对绘制原点的逻辑 px
            entry['anchors'] = {k: [round(ox + fx * w, 1), round(oy - h + fy * h, 1)] for k, (fx, fy) in P['anchors'].items()}
        if P.get('centerOn') == 'hole' and entry.get('hole'):          # 把原点挪到门洞水平中心
            dx = entry['hole'][0] + entry['hole'][2] / 2
            ox = entry['ox'] = round(ox - dx, 2)
            entry['hole'][0] = round(entry['hole'][0] - dx, 1)
            entry['bbox'][0], entry['bbox'][2] = round(entry['bbox'][0] - dx, 1), round(entry['bbox'][2] - dx, 1)
            for v in (entry.get('anchors') or {}).values():
                v[0] = round(v[0] - dx, 1)
        if P.get('rim'):             # 米白外圈：会撞的和能捡的才有。"ground" 底边不加，"float" 四边都加；内容在屏幕上的位置不变
            im, side, bot = add_rim(im, rim_px, rim_color, P['rim'] == 'float')
            entry.update(w=round(w + 2 * side / dpr, 1), h=round(h + (side + bot) / dpr, 1), ox=round(ox - side / dpr, 2), oy=round(oy + bot / dpr, 2), rim=round(rim_px / dpr, 2))
        size = save_png(im, os.path.join(outdir, entry['src']))
        manifest['props'][pid] = entry
        report['props'][pid] = {'bytes': size, 'hueSector': hue_sector(im)}
        total += size
        print(f'prop {pid}: {entry["w"]}x{entry["h"]} logical, {size // 1024}KB' + (' rim' if P.get('rim') else ''))
    for cid, c in (spec.get('chars') or {}).items():
        need = list((c.get('parts') or {}).values()) + list((c.get('heads') or {}).values())
        if not need or not all(exists(p) for p in need):
            print(f'  ! char {cid}: 源图不全，跳过（运行时走代码兜底）')
            skipped.append(f'char {cid}')
            continue
        entry, size = build_char(cid, c, outdir, c.get('headPx', 96))   # 头直径 96px：结算页 / 饭桌放大到 2 倍也清楚
        manifest['chars'][cid] = entry
        total += size
        print(f'char {cid}: {len(entry["parts"])} parts, {len(entry["heads"])} heads, {size // 1024}KB')
    target = spec.get('manifest', 'js/data/art.js')
    if target.endswith('.json'):
        json.dump(manifest, open(os.path.join(ROOT, target), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    else:
        with open(os.path.join(ROOT, target), 'w', encoding='utf-8') as f:
            f.write('// 美术清单：由 tools/art/build.py 生成，别手改。\n')
            f.write('// 空的时候所有东西回退到代码绘制，游戏照样能玩。\n')
            f.write('export const ART_MANIFEST = ' + json.dumps(manifest, ensure_ascii=False, indent=1) + ';\n')
    # 清理：清单没引用的旧图（剔除的模块、去重掉的远景、改名前的文件）不删的话还会被打进包里
    used = all_srcs(manifest)
    for dirpath, _, files in os.walk(outdir):
        for fn in files:
            rel = os.path.relpath(os.path.join(dirpath, fn), outdir).replace('\\', '/')
            if fn.endswith('.png') and rel not in used:
                os.remove(os.path.join(dirpath, fn))
                print('removed stale', rel)
    # 报告：tools/ 不进包，测试读它检查撞色扇区、跳跃带指标
    rp = os.path.join(ROOT, spec.get('report', 'tools/art/report.json'))
    with open(rp, 'w', encoding='utf-8', newline='\n') as f:   # 新文件用 LF
        json.dump(report, f, ensure_ascii=False, indent=1)
        f.write('\n')
    if skipped:
        print('还在用代码兜底：' + '、'.join(skipped))
    print(f'total {total // 1024}KB → {target}')
    return manifest


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'clean':
        im = Image.open(args[0])
        print('before', alpha_stats(im.convert('RGBA')))
        out = crop_content(clean_alpha(im))
        out.save(args[1])
        print('after', alpha_stats(out))
    elif cmd == 'layer':
        h = int(args[args.index('--h') + 1]) if '--h' in args else 300
        print(build_layer(args[0], args[1], h))
    elif cmd == 'slice':
        for p in slice_sheet(args[0], args[1]):
            print(p)
    elif cmd == 'build':
        build(args[0])
    else:
        raise SystemExit(__doc__)
