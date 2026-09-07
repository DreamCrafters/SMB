#!/usr/bin/env python3
"""Разовая конвертация `Справочник РЖД.xls` в ассеты миграции `077_railway_reference`.

Источник задачи 106 — файл `Справочник РЖД.xls` (BIFF8), в котором три листа:
` ЕТСНГ` (имя листа с ведущим пробелом), `Станции` и `Крепления`. Файл в
репозиторий не кладётся: миграция переносит справочник один раз, дальше он
живёт в БД, поэтому в репозитории нужен только результат конвертации и этот
скрипт как описание того, откуда он взялся.

Запуск (xlrd не входит в зависимости проекта, это разовый инструмент):

    pip install xlrd
    python3 scripts/convert-railway-reference.py "<путь>/Справочник РЖД.xls"

Нормализация повторяет правила справочников марок и сырья: обрезка пробелов и
схлопывание пробельных последовательностей, включая неразрывный пробел. Коды
ЕТСНГ приходят двумя типами ячеек — текстом с ведущим нулём (`01000`) и числом
(`10000.0`); числовые приводятся к целому без дополнения нулями, потому что
двузначные значения (43, 45, 71 ... 73) — это коды разделов, а не позиции.
"""

import json
import re
import sys
from pathlib import Path

import xlrd

WHITESPACE = re.compile(r"\s+", re.UNICODE)
ASSETS = Path(__file__).resolve().parent.parent / "server" / "assets" / "railway-reference"


def clean(value: str) -> str:
    return WHITESPACE.sub(" ", value.replace("\xa0", " ")).strip()


def read_cell(sheet, row: int, column: int) -> str:
    cell = sheet.cell(row, column)
    if cell.ctype == xlrd.XL_CELL_NUMBER:
        return str(int(cell.value))
    return clean(str(cell.value))


def read_pairs(sheet) -> list[list[str]]:
    """Строки листа без заголовка; строки с пустой первой колонкой отбрасываются."""
    pairs: list[list[str]] = []
    for row in range(1, sheet.nrows):
        first = read_cell(sheet, row, 0)
        if first == "":
            continue
        pairs.append([first, read_cell(sheet, row, 1)])
    return pairs


def write_asset(name: str, rows: list[list[str]]) -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    path = ASSETS / f"{name}.json"
    path.write_text(
        json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"{path.relative_to(ASSETS.parent.parent.parent)}: {len(rows)} строк")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    book = xlrd.open_workbook(sys.argv[1])
    write_asset("etsng", read_pairs(book.sheet_by_name(" ЕТСНГ")))
    write_asset("stations", read_pairs(book.sheet_by_name("Станции")))
    write_asset("securing-methods", read_pairs(book.sheet_by_name("Крепления")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
