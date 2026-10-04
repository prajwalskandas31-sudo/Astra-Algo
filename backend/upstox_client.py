import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
# Fallback to ACCESS_TOKEN if UPSTOX_ACCESS_TOKEN is not populated
UPSTOX_ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN")

BASE_URL = "https://api.upstox.com/v2"

def get_headers():
    token = UPSTOX_ACCESS_TOKEN
    return {
        "accept": "application/json",
        "Api-Version": "2.0",
        "Authorization": f"Bearer {token}"
    }

def test_connection():
    """
    Checks Upstox API connection and token status.
    """
    if not UPSTOX_ACCESS_TOKEN or "your_" in UPSTOX_ACCESS_TOKEN:
        return {"status": "UNCONFIGURED", "detail": "Missing or placeholder Upstox access token."}
    
    # Check user profile or market quotes
    url = f"{BASE_URL}/user/profile"
    try:
        response = requests.get(url, headers=get_headers(), timeout=5)
        if response.status_code == 200:
            user_data = response.json().get("data", {})
            return {
                "status": "CONNECTED",
                "user_id": user_data.get("user_id"),
                "user_name": user_data.get("user_name"),
                "broker": "Upstox V2 API",
                "authenticated": True
            }
        elif response.status_code == 401:
            return {"status": "EXPIRED", "detail": "Upstox token expired or invalid."}
        else:
            # Check market status
            return {
                "status": "ONLINE",
                "broker": "Upstox V2 Gateway",
                "authenticated": True,
                "http_status": response.status_code
            }
    except Exception as e:
        return {"status": "ERROR", "detail": str(e)}

def get_historical_data(instrument_key: str, interval: str = "1minute"):
    """
    Fetches intraday historical data for the instrument.
    Upstox interval options: 1minute, 30minute.
    """
    url = f"{BASE_URL}/historical-candle/intraday/{instrument_key}/{interval}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "success":
                return data.get("data", {}).get("candles", [])
    except Exception as e:
        print(f"Error fetching Upstox candle data: {e}")
    return []

def get_latest_candle(instrument_key: str):
    """
    Returns the most recent 1-minute candle data: [timestamp, open, high, low, close, volume, open_interest]
    """
    candles = get_historical_data(instrument_key, "1minute")
    if candles and len(candles) > 0:
        return candles[0]
    return None

def get_previous_day_high(instrument_key: str):
    """
    Fetches the Previous Day High from Upstox daily historical candles.
    Candles are formatted as: [timestamp, open, high, low, close, volume, open_interest]
    """
    import datetime
    today = datetime.date.today()
    past = today - datetime.timedelta(days=10)
    url = f"{BASE_URL}/historical-candle/{instrument_key}/day/{today}/{past}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=5)
        if response.status_code == 200:
            candles = response.json().get("data", {}).get("candles", [])
            if candles and len(candles) > 0 and len(candles[0]) >= 3:
                return float(candles[0][2])
    except Exception as e:
        print(f"Error fetching previous day high for {instrument_key}: {e}")
    return None

def get_live_market_quotes(instrument_keys: list):
    """
    Fetches live LTP and daily OHLC quotes for multiple instruments in a single batch request.
    """
    if not instrument_keys:
        return {}
    url = f"{BASE_URL}/market-quote/ohlc?instrument_key=" + ",".join(instrument_keys) + "&interval=1d"
    try:
        response = requests.get(url, headers=get_headers(), timeout=5)
        if response.status_code == 200:
            return response.json().get("data", {})
    except Exception as e:
        print(f"Error fetching market quotes: {e}")
    return {}
