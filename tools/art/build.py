"""美术资源管线：把AI 绘图工具出的原图加工成游戏能直接用的图集和清单。

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


def build_modules(sheets, outdir, stage, name, h_tallest, dpr=2):
    """背景模块：每张表里切出独立的楼 / 墙面，同一张表统一缩放（最高的那块 = h_tallest 逻辑像素），底边对齐。"""
    mods, total = [], 0
    import glob as _glob
    for si, sheet in enumerate(sheets):
        h_group = h_tallest
        if isinstance(sheet, dict):      # {"src": 路径或通配符, "h": 这一组最高那块的逻辑高度}
            h_group, sheet = sheet.get('h', h_tallest), sheet['src']
        if '*' in sheet:                 # 一组已经切好的模块图：同组统一缩放
            files = sorted(_glob.glob(os.path.join(ROOT, sheet)))
            ims = [crop_content(clean_alpha(Image.open(f), min_area_frac=0.0005), pad=0) for f in files]
            if not ims:
                continue
            k = h_group * dpr / max(im.height for im in ims)
            for mi, part in enumerate(ims):
                part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS)
                rel = f'bg/{stage}_{name}_{si}_{mi}.png'
                total += save_png(part, os.path.join(outdir, rel))
                mods.append({'src': rel, 'w': round(part.width / dpr, 1), 'h': round(part.height / dpr, 1)})
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
            rel = f'bg/{stage}_{name}_{si}_{mi}.png'
            total += save_png(part, os.path.join(outdir, rel))
            mods.append({'src': rel, 'w': round(part.width / dpr, 1), 'h': round(part.height / dpr, 1)})
    return mods, total


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


# ── 清单 ─────────────────────────────────────────────────
def build(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    dpr = spec.get('dpr', 2)
    outdir = os.path.join(ROOT, spec.get('out', 'art'))
    manifest = {'base': spec.get('base', 'art/'), 'bg': {}, 'props': {}, 'chars': {}}
    total = 0
    for stage, layers in (spec.get('bg') or {}).items():
        for name, L in layers.items():
            if 'modules' in L:          # 模块式：引擎随机拼接
                mods, size = build_modules(L['modules'], outdir, stage, name, L['h'], dpr)
                total += size
                entry = {'modules': mods, 'par': L.get('par', 0.5), 'dy': L.get('dy', 0), 'gap': L.get('gap', [6, 40]), 'w': 300, 'h': L['h']}
                if L.get('backdrop'):
                    entry['backdrop'] = L['backdrop']
                manifest['bg'].setdefault(stage, {})[name] = entry
                print(f'bg {stage}/{name}: {len(mods)} modules, {size // 1024}KB')
                continue
            srcs = L['src'] if isinstance(L['src'], list) else [L['src']]
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
            manifest['bg'].setdefault(stage, {})[name] = entry
    # 道具 / 障碍 / 地标：{ "src", "w"(逻辑宽), "h"(可省，按比例), "ox", "oy" }，宽度按判定框 + 画面需要自己定
    for pid, P in (spec.get('props') or {}).items():
        im = crop_content(clean_alpha(Image.open(os.path.join(ROOT, P['src']))))
        if P.get('crop'):            # 按比例裁一块（例如脚手架去掉警示条下面的腿）：[x0, y0, x1, y1]
            x0, y0, x1, y1 = P['crop']
            im = crop_content(im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height))), pad=0)
        if P.get('flip'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        w = P.get('w') or round(P['h'] * im.width / im.height, 1)     # 宽高只给一个就按原图比例算另一个
        h = P.get('h') or round(w * im.height / im.width, 1)
        im = im.resize((max(1, round(w * dpr)), max(1, round(h * dpr))), Image.LANCZOS)
        rel = f'props/{pid}.png'
        size = save_png(im, os.path.join(outdir, rel))
        manifest['props'][pid] = {'src': rel, 'w': w, 'h': h, 'ox': P.get('ox', 0), 'oy': P.get('oy', 0)}
        total += size
        print(f'prop {pid}: {w}x{h} logical, {size // 1024}KB')
    for cid, c in (spec.get('chars') or {}).items():
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
