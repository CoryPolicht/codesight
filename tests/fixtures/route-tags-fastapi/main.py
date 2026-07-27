from fastapi import FastAPI

app = FastAPI()

# Portal-authenticated routes live in billing.py. Public read below.

@app.get("/api/v1/health")
async def health():
    return {"ok": True}

@app.get("/api/v1/me")
async def me(token: str):
    session = validate_token(token)
    return session.user
