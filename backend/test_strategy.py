import os
import sys

# Ensure backend imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from strategy import market_open_job

if __name__ == "__main__":
    print("Testing Strategy Job directly...")
    market_open_job()
    print("Test complete.")
