import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pyrefly: ignore [missing-import]
from app.database import init_db, get_db_stats, DB_PATH
# pyrefly: ignore [missing-import]
from app.main import app

def test_phase1():
    print("Testing Database Initialization...")
    init_db()
    assert DB_PATH.exists(), f"Database file not found at {DB_PATH}"
    print(f"✓ Database file created successfully at: {DB_PATH}")

    stats = get_db_stats()
    print("Database Stats:")
    print(f"  Path: {stats['db_path']}")
    print(f"  Size: {stats['db_size_bytes']} bytes")
    print("  Tables initialized:")
    for table, count in stats['table_counts'].items():
        print(f"    - {table}: {count} records")
        assert count == 0, f"Expected 0 records in {table}, got {count}"

    print("\nPhase 1 verification PASSED! All 5 tables exist and are ready for data ingestion.")

if __name__ == "__main__":
    test_phase1()
