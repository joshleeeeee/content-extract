#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path
from zipfile import ZipInfo
from zipfile import BadZipFile, ZipFile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "解压批量导出的分卷 zip，并提取所有 md 到输出目录根层。"
        )
    )
    parser.add_argument(
        "input",
        help="输入目录或 zip 文件（目录下会扫描 *.zip）",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="输出目录；不传时自动输出到输入路径同级目录",
    )
    parser.add_argument(
        "--extract-all",
        action="store_true",
        help="除 md 平铺外，同时保留按文档目录展开的完整内容",
    )
    return parser.parse_args()


def collect_outer_zips(path: str) -> list[Path]:
    zips: list[Path] = []
    p = Path(path).expanduser().resolve()
    if p.is_dir():
        zips.extend(sorted(x for x in p.iterdir() if x.is_file() and x.suffix.lower() == ".zip"))
    elif p.is_file() and p.suffix.lower() == ".zip":
        zips.append(p)
    else:
        print(f"无效输入: {path}")
    return zips


def default_output_for_input(input_path: str) -> Path:
    p = Path(input_path).expanduser().resolve()
    if p.is_dir():
        return p.parent / f"{p.name}_flat"
    return p.parent / f"{p.stem}_flat"


def safe_unique_dir(base_dir: Path, name: str) -> Path:
    target = base_dir / name
    idx = 2
    while target.exists():
        target = base_dir / f"{name}_{idx}"
        idx += 1
    return target


def safe_unique_file(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    idx = 2
    candidate = parent / f"{stem}_{idx}{suffix}"
    while candidate.exists():
        idx += 1
        candidate = parent / f"{stem}_{idx}{suffix}"
    return candidate


def unzip_to(src_zip: Path, dest_dir: Path) -> None:
    with ZipFile(src_zip, "r") as zf:
        zf.extractall(dest_dir)


def _read_md_infos(zf: ZipFile) -> list[ZipInfo]:
    md_infos: list[ZipInfo] = []
    for info in zf.infolist():
        if info.is_dir():
            continue
        if Path(info.filename).suffix.lower() == ".md":
            md_infos.append(info)
    return md_infos


def _read_image_infos(zf: ZipFile) -> list[ZipInfo]:
    img_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"}
    infos: list[ZipInfo] = []
    for info in zf.infolist():
        if info.is_dir():
            continue
        p = Path(info.filename)
        if len(p.parts) >= 2 and p.parts[0].lower() == "images" and p.suffix.lower() in img_exts:
            infos.append(info)
    return infos


def extract_md_flat(src_zip: Path, output_dir: Path, prefix: str | None = None) -> int:
    count = 0
    with ZipFile(src_zip, "r") as zf:
        md_infos = _read_md_infos(zf)
        for info in md_infos:
            base_name = Path(info.filename).name
            final_name = base_name
            if prefix and final_name.lower() in {"document.md", "untitled.md"}:
                final_name = f"{prefix}.md"
            out_path = safe_unique_file(output_dir / final_name)
            data = zf.read(info.filename)
            out_path.write_bytes(data)
            count += 1
    return count


def extract_images_to_shared_dir(src_zip: Path, output_dir: Path) -> int:
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    with ZipFile(src_zip, "r") as zf:
        img_infos = _read_image_infos(zf)
        for info in img_infos:
            rel_name = "/".join(Path(info.filename).parts[1:])
            if not rel_name:
                continue
            out_path = images_dir / rel_name
            out_path.parent.mkdir(parents=True, exist_ok=True)
            data = zf.read(info.filename)

            if out_path.exists():
                # 不改写 md 路径，文件名冲突时优先保留已有文件；同内容跳过，不同内容警告。
                old = out_path.read_bytes()
                if old != data:
                    print(f"  ! 图片重名冲突，已保留已有文件: {out_path.name}")
                continue

            out_path.write_bytes(data)
            count += 1
    return count


def flatten_volumes(outer_zips: list[Path], output_dir: Path, extract_all: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"输出目录: {output_dir}")
    print(f"待处理分卷数: {len(outer_zips)}")
    total_md = 0
    total_images = 0

    with tempfile.TemporaryDirectory(prefix="unpack_batch_") as tmp:
        tmp_root = Path(tmp)

        for i, outer_zip in enumerate(outer_zips, start=1):
            print(f"[{i}/{len(outer_zips)}] 解压分卷: {outer_zip.name}")
            outer_dir = tmp_root / f"outer_{i}"
            outer_dir.mkdir(parents=True, exist_ok=True)

            try:
                unzip_to(outer_zip, outer_dir)
            except BadZipFile:
                print(f"  ! 跳过损坏 zip: {outer_zip}")
                continue

            inner_zips = sorted(outer_dir.rglob("*.zip"))

            if not inner_zips:
                try:
                    md_count = extract_md_flat(outer_zip, output_dir, prefix=outer_zip.stem)
                    total_md += md_count
                    total_images += extract_images_to_shared_dir(outer_zip, output_dir)
                except BadZipFile:
                    print(f"  ! 跳过损坏 zip: {outer_zip}")
                if extract_all:
                    vol_name = outer_zip.stem
                    dest = safe_unique_dir(output_dir, vol_name)
                    shutil.copytree(outer_dir, dest)
                continue

            for inner_zip in inner_zips:
                doc_name = inner_zip.stem
                try:
                    md_count = extract_md_flat(inner_zip, output_dir, prefix=doc_name)
                    total_md += md_count
                    total_images += extract_images_to_shared_dir(inner_zip, output_dir)
                except BadZipFile:
                    print(f"  ! 跳过损坏内层 zip: {inner_zip}")
                    continue
                if extract_all:
                    doc_dest = safe_unique_dir(output_dir, doc_name)
                    doc_dest.mkdir(parents=True, exist_ok=True)
                    try:
                        unzip_to(inner_zip, doc_dest)
                    except BadZipFile:
                        print(f"  ! 跳过损坏内层 zip: {inner_zip}")
                        continue

    print(f"完成。已提取 md: {total_md}，images: {total_images}，输出目录: {output_dir}")


def main() -> int:
    args = parse_args()
    outer_zips = collect_outer_zips(args.input)
    if not outer_zips:
        print("未找到可处理的 zip 文件。")
        return 1

    output_dir = Path(args.output).expanduser().resolve() if args.output else default_output_for_input(args.input)
    flatten_volumes(outer_zips, output_dir, extract_all=args.extract_all)
    return 0


if __name__ == "__main__":
    sys.exit(main())
