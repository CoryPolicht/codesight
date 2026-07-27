import os
ENABLE_LEGACY = os.getenv("ENABLE_LEGACY", "false")
TIMEOUT = os.environ.get("TIMEOUT", "30")
API_KEY = os.getenv("API_KEY")
SECRET = os.environ["SECRET"]