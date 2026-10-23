"""Crop one QR code from a screenshot and verify its payload before saving.

Install requirements.txt in an isolated virtual environment first.
The input is never changed. Payloads are printed only with --show-payload.
"""
import argparse
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("box", nargs="*", type=float, help="Optional left top right bottom, as fractions from 0 to 1")
    parser.add_argument("--size", type=int, default=520)
    parser.add_argument("--monochrome", action="store_true")
    parser.add_argument("--show-payload", action="store_true")
    args = parser.parse_args()
    if len(args.box) not in (0, 4):
        parser.error("Provide either no crop region or all four coordinates.")
    box = args.box or [0, 0, 1, 1]
    if not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
        parser.error("Region must satisfy 0 <= left < right <= 1 and 0 <= top < bottom <= 1.")
    if not 128 <= args.size <= 4096:
        parser.error("--size must be between 128 and 4096 pixels.")
    if args.source.resolve() == args.output.resolve():
        parser.error("Output must differ from the source screenshot.")
    if args.output.exists():
        parser.error("Output exists; choose a new filename.")
    try:
        import zxingcpp
        from PIL import Image, ImageOps
    except ImportError:
        parser.error("Missing dependencies. Install requirements.txt in your virtual environment.")
    with Image.open(args.source) as raw:
        image = ImageOps.exif_transpose(raw).convert("RGB")
    w, h = image.size
    region = image.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))
    codes = zxingcpp.read_barcodes(region, formats=zxingcpp.BarcodeFormat.QRCode)
    if len(codes) != 1:
        parser.error(f"Expected one QR code in the region; found {len(codes)}. Choose a tighter region or a clearer image.")
    code = codes[0]
    points = [code.position.top_left, code.position.top_right, code.position.bottom_left, code.position.bottom_right]
    bounds = (max(0, min(p.x for p in points)), max(0, min(p.y for p in points)), min(region.width, max(p.x for p in points) + 1), min(region.height, max(p.y for p in points) + 1))
    result = region.crop(bounds)
    side = max(result.size)
    square = Image.new("RGB", (side, side), "white")
    square.paste(result, ((side - result.width) // 2, (side - result.height) // 2))
    result = ImageOps.expand(square, border=max(8, round(side * 0.15)), fill="white")
    result = result.resize((args.size, args.size), Image.Resampling.LANCZOS)
    if args.monochrome:
        result = result.convert("L").point(lambda value: 255 if value > 140 else 0).convert("1")
    after = zxingcpp.read_barcodes(result.convert("RGB"), formats=zxingcpp.BarcodeFormat.QRCode)
    if len(after) != 1 or after[0].bytes != code.bytes:
        parser.error("Processed QR does not match the input. No output was saved; try a larger size or omit --monochrome.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, format="PNG", optimize=True)
    print(f"Verified matching QR code; saved {args.size} x {args.size} PNG.")
    if args.show_payload:
        print(code.text)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(f"QR processing failed: {error}", file=sys.stderr)
        sys.exit(1)
