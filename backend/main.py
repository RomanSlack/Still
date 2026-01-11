import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError

from routers import auth_router, videos_router
from routers.auth import JWT_SECRET, JWT_ALGORITHM


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting Video Journal API...")
    yield
    # Shutdown
    print("Shutting down Video Journal API...")


app = FastAPI(
    title="Video Journal API",
    description="Personal video journal with AI transcription and tagging",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Auth middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Skip CORS preflight requests
    if request.method == "OPTIONS":
        return await call_next(request)

    # Skip auth for certain paths
    public_paths = ["/", "/health", "/auth", "/docs", "/openapi.json", "/redoc"]

    if any(request.url.path == path or request.url.path.startswith(path + "/") for path in ["/docs", "/openapi.json", "/redoc"]):
        return await call_next(request)

    if request.url.path in public_paths:
        return await call_next(request)

    # Skip auth for SSE progress endpoints (EventSource doesn't support headers)
    if request.url.path.endswith("/progress"):
        return await call_next(request)

    # Check for auth header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Missing or invalid authorization header"},
        )

    token = auth_header.split(" ")[1]

    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid or expired token"},
        )

    return await call_next(request)


# Include routers
app.include_router(auth_router)
app.include_router(videos_router)


@app.get("/")
async def root():
    return {"message": "Video Journal API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
