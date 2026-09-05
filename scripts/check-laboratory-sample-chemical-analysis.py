"""Exercise the actual OTK SELECTs on isolated SQLite fixtures.

Run with Python 3 after npm install. This checks relational selection rules,
not MariaDB-specific syntax, collation or execution plans. No live DB is used.
"""

import json
from pathlib import Path
import re
import sqlite3
import subprocess
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
COLLECT_QUERIES = """
import { createLaboratoryUnshapedProductSampleJournalRepository as unshaped }
  from './server/src/repositories/laboratoryUnshapedProductSampleJournalRepository.ts';
import { createLaboratoryFormedProductSampleJournalRepository as formed }
  from './server/src/repositories/laboratoryFormedProductSampleJournalRepository.ts';
import { createLaboratoryVerificationJournalRepository as verification }
  from './server/src/repositories/laboratoryVerificationJournalRepository.ts';
const queries = [];
const pool = { query: async (sql, parameters) => {
  queries.push({ sql, parameters });
  return [[], []];
} };
await unshaped(pool).list({ limit: 50 });
await formed(pool, {}).list({ limit: 50 });
await verification(pool).list({ limit: 50 });
process.stdout.write(JSON.stringify(queries));
"""
CHEMICAL_COLUMNS = [
    "laboratory_analysis_number", "chemical_analysis_date",
    "chemical_analysis_laboratory_assistant", "batch_number", "al2o3", "fe2o3",
    "sio2", "cao2", "p2o5", "loss_on_ignition", "moisture", "notes",
]
SAMPLE_COLUMNS = [
    "source_sample_registration_id", "sample_number", "sample_date", "sampled_by",
    "batch_number", "sample_code", "product_name", "product_brand", "batch_mass",
    "chemical_analysis_number", "moisture", "grain_composition", "fire_resistance",
    "suitability", "notes", "created_at", "sorting_date", "wagon_number",
    "molding_date", "verification_date", "sampling_location",
]
SAMPLE_TABLES = [
    "laboratory_unshaped_product_sample_journal",
    "laboratory_formed_product_sample_journal",
    "laboratory_verification_journal",
]


class SampleChemicalAnalysisProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["node", "--import", "tsx", "--input-type=module"],
            input=COLLECT_QUERIES, cwd=REPOSITORY_ROOT,
            text=True, capture_output=True, timeout=30,
        )
        if result.returncode:
            raise RuntimeError(result.stderr)
        cls.queries = json.loads(result.stdout)

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.create_function(
            "regexp", 2, lambda pattern, value: bool(re.search(pattern, value or "")),
        )
        self.db.create_function(
            "concat_ws", -1,
            lambda separator, *values: separator.join(
                str(value) for value in values if value is not None
            ),
        )
        self.db.execute(
            "create table laboratory_sample_registration_journal "
            "(id text primary key, laboratory_sample_code text, "
            + ",".join(column + " text" for column in CHEMICAL_COLUMNS[1:]) + ")"
        )
        self.db.execute(
            "create table laboratory_chemical_analysis_journal "
            "(sequence_id integer primary key, id text, sample_registration_id text, "
            "unshaped_product_sample_id text, "
            + ",".join(column + " text" for column in CHEMICAL_COLUMNS) + ")"
        )
        for table in SAMPLE_TABLES:
            self.db.execute(
                "create table " + table + " (sequence_id integer primary key, id text, "
                + ",".join(column + " text" for column in SAMPLE_COLUMNS) + ")"
            )
        for identifier, alumina in [("r1", "99"), ("r2", "60"), ("r3", "77")]:
            self.insert(
                "laboratory_sample_registration_journal", id=identifier,
                laboratory_sample_code="same-code", al2o3=alumina, notes="legacy",
            )
        for sequence, identifier, registration, unshaped, alumina in [
            (1, "old", "r1", None, "1"),
            (100, "current", "r1", None, "45,6"),
            (3, "own", None, "u1", "10"),
            (4, "empty", "r3", None, None),
            (5, "zero", None, "u3", "0"),
            (6, "own-empty", None, "u6", None),
        ]:
            self.insert(
                "laboratory_chemical_analysis_journal", sequence_id=sequence,
                id=identifier, sample_registration_id=registration,
                unshaped_product_sample_id=unshaped, al2o3=alumina,
            )
        for table, prefix in zip(SAMPLE_TABLES, ["u", "f", "v"]):
            for number, registration in [
                (1, "r1"), (2, "r2"), (3, None), (4, "r3"),
                (5, None), (6, "r1"), (7, "r1"),
            ]:
                self.insert(
                    table, sequence_id=number, id=prefix + str(number),
                    source_sample_registration_id=registration,
                    sample_number=str(number), sample_date="2026-09-04",
                    sorting_date="2026-09-04", verification_date="2026-09-04",
                    sample_code="same-code", batch_number="sample-batch",
                    moisture="sample-moisture", notes="sample-notes",
                )

    def insert(self, table, **fields):
        self.db.execute(
            "insert into " + table + " (" + ",".join(fields) + ") values ("
            + ",".join("?" for _ in fields) + ")", list(fields.values()),
        )

    def read(self, index):
        query = self.queries[index]
        return {
            row["id"]: dict(row)
            for row in self.db.execute(query["sql"], query["parameters"])
        }

    def test_latest_analysis_legacy_values_and_stable_links(self):
        for index, prefix in enumerate(["u", "f", "v"]):
            with self.subTest(journal=prefix):
                rows = self.read(index)
                self.assertEqual(len(rows), 7)
                self.assertEqual(rows[prefix + "7"]["linked_al2o3"], "45,6")
                self.assertEqual(rows[prefix + "2"]["linked_al2o3"], "60")
                self.assertEqual(rows[prefix + "4"]["linked_analysis_id"], "empty")
                self.assertIsNone(rows[prefix + "4"]["linked_al2o3"])
                self.assertIsNone(rows[prefix + "5"]["linked_analysis_id"])
                self.assertIsNone(rows[prefix + "5"]["linked_al2o3"])

    def test_own_analysis_wins_whole_even_when_older_or_empty(self):
        rows = self.read(0)
        self.assertEqual(rows["u1"]["linked_al2o3"], "10")
        self.assertIsNone(rows["u1"]["linked_notes"])
        self.assertEqual(rows["u6"]["linked_analysis_id"], "own-empty")
        self.assertIsNone(rows["u6"]["linked_al2o3"])
        self.assertEqual(rows["u3"]["linked_al2o3"], "0")
        self.assertEqual(rows["u1"]["batch_number"], "sample-batch")
        self.assertEqual(rows["u1"]["moisture"], "sample-moisture")
        self.assertEqual(rows["u1"]["notes"], "sample-notes")

    def test_corrections_and_reassignment_appear_on_next_read(self):
        self.db.execute(
            "update laboratory_chemical_analysis_journal set al2o3='46' where id='current'"
        )
        for index, prefix in enumerate(["u", "f", "v"]):
            self.assertEqual(self.read(index)[prefix + "7"]["linked_al2o3"], "46")
        self.db.execute(
            "update laboratory_chemical_analysis_journal "
            "set unshaped_product_sample_id='u5' where id='own'"
        )
        rows = self.read(0)
        self.assertEqual(rows["u1"]["linked_al2o3"], "46")
        self.assertEqual(rows["u5"]["linked_al2o3"], "10")


if __name__ == "__main__":
    unittest.main()
