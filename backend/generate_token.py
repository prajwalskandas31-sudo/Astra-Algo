import os
import requests
import urllib.parse
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.getenv("UPSTOX_API_KEY")
API_SECRET = os.getenv("UPSTOX_API_SECRET")
REDIRECT_URI = "http://127.0.0.1:8000"

def generate_auth_url():
    params = {
        "response_type": "code",
        "client_id": API_KEY,
        "redirect_uri": REDIRECT_URI
    }
    url = f"https://api.upstox.com/v2/login/authorization/dialog?{urllib.parse.urlencode(params)}"
    return url

def get_access_token(code: str):
    url = "https://api.upstox.com/v2/login/authorization/token"
    headers = {
        "accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "code": code,
        "client_id": API_KEY,
        "client_secret": API_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    response = requests.post(url, headers=headers, data=data)
    if response.status_code == 200:
        token_data = response.json()
        return token_data.get('access_token')
    else:
        print("Failed to get token:", response.text)
        return None

if __name__ == "__main__":
    print("\n--- Upstox Authentication Flow ---")
    print("\n1. Please visit the following URL in your browser to authorize the app:")
    print(generate_auth_url())
    print("\n2. After authorizing, you will be redirected to something like: http://127.0.0.1:8000/?code=xxxxxx")
    code_input = input("3. Paste the 'code' from that URL here (just the code part): ").strip()
    
    if code_input:
        print("\nExchanging code for access token...")
        token = get_access_token(code_input)
        if token:
            print("\nSUCCESS! Your Access Token is:")
            print(token)
            print("\nPlease add this to your .env file as UPSTOX_ACCESS_TOKEN=...")
        else:
            print("\nFailed.")
