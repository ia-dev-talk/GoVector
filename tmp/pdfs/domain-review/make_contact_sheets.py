from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageOps


source_dir = Path(sys.argv[1])
prefix = sys.argv[2]
files = sorted(source_dir.glob(f"{prefix}-*.png"))

cell_width = 620
cell_height = 880
margin = 20

for sheet_index in range(0, len(files), 4):
    sheet_files = files[sheet_index : sheet_index + 4]
    sheet = Image.new(
        "RGB",
        (cell_width * 2 + margin * 3, cell_height * 2 + margin * 3),
        "#d9dde4",
    )
    draw = ImageDraw.Draw(sheet)

    for index, file_path in enumerate(sheet_files):
        with Image.open(file_path) as page:
            page = ImageOps.contain(
                page.convert("RGB"),
                (cell_width, cell_height - 28),
            )

        column = index % 2
        row = index // 2
        left = margin + column * (cell_width + margin)
        top = margin + row * (cell_height + margin)
        sheet.paste(page, (left, top + 28))
        draw.text((left, top + 4), file_path.stem, fill="#111827")

    output_index = sheet_index // 4 + 1
    sheet.save(source_dir / f"{prefix}-contact-{output_index}.png")
