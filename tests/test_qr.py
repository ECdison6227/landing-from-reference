import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
import qrcode
import zxingcpp

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "qr.py"
PAYLOAD = "https://example.com/join/demo"


class QrTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="landing-qr-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.output = self.root / "screenshot.png", self.root / "qr.png"
        self.code = qrcode.make(PAYLOAD, box_size=8, border=4).convert("RGB")
        screenshot = Image.new("RGB", (760, 900), "#f7f4ef")
        ImageDraw.Draw(screenshot).text((30, 35), "Example contact card", fill="black")
        screenshot.paste(self.code, (200, 270))
        screenshot.save(self.source)

    def run_tool(self, *extra, source=None, output=None):
        return subprocess.run([sys.executable, str(SCRIPT), str(source or self.source), str(output or self.output), *extra], capture_output=True, text=True, timeout=30)

    def test_crop_matches_payload_and_has_white_margin(self):
        result = self.run_tool()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(PAYLOAD, result.stdout)
        with Image.open(self.output) as image:
            self.assertEqual(image.size, (520, 520))
            self.assertEqual(image.convert("RGB").getpixel((0, 0)), (255, 255, 255))
            self.assertEqual(zxingcpp.read_barcodes(image)[0].text, PAYLOAD)

    def test_monochrome_and_optional_payload(self):
        result = self.run_tool("--monochrome", "--show-payload")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(PAYLOAD, result.stdout)

    def test_blank_image_does_not_create_output(self):
        Image.new("RGB", (500, 500), "white").save(self.source)
        result = self.run_tool()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_same_source_is_never_overwritten(self):
        before = self.source.read_bytes()
        result = self.run_tool(output=self.source)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.source.read_bytes(), before)

    def test_region_selects_one_code_from_multiple_codes(self):
        image = Image.new("RGB", (1000, 500), "white")
        image.paste(self.code, (30, 80))
        image.paste(qrcode.make("https://example.com/second", box_size=8).convert("RGB"), (550, 80))
        image.save(self.source)
        self.assertNotEqual(self.run_tool().returncode, 0)
        self.assertFalse(self.output.exists())
        selected = self.run_tool("0", "0", "0.5", "1")
        self.assertEqual(selected.returncode, 0, selected.stderr)
        with Image.open(self.output) as image:
            self.assertEqual(zxingcpp.read_barcodes(image)[0].text, PAYLOAD)

    def test_invalid_region_and_existing_output_are_rejected(self):
        self.assertNotEqual(self.run_tool("0.8", "0", "0.2", "1").returncode, 0)
        self.assertFalse(self.output.exists())
        self.output.write_bytes(b"keep")
        self.assertNotEqual(self.run_tool().returncode, 0)
        self.assertEqual(self.output.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
